/**
 * Flussschänke Zürich - Backend Google Apps Script
 *
 * GESCHWINDIGKEITS-ARCHITEKTUR:
 * - Ein zeitgesteuerter Trigger (jede Minute) ruft refreshAvailabilityCache() auf.
 * - Dieser liest das Sheet und speichert das Ergebnis im CacheService (Script-Cache).
 * - doGet('getAvailability') liest NUR den Cache – das ist ~100ms statt 2-5 Sekunden.
 * - Nach einer Buchung wird der Cache sofort ungültig gemacht und neu befüllt.
 *
 * SETUP (einmalig im Apps Script Editor):
 * 1. Code speichern
 * 2. Oben: Uhr-Symbol "Trigger" klicken > Trigger hinzufügen:
 *    - Funktion: refreshAvailabilityCache
 *    - Quelle: Zeitgesteuert > Minutentimer > Jede Minute
 * 3. Bereitstellen > Neue Bereitstellung > Web-App > Zugriff: Jeder
 *
 * SPALTEN-AUFBAU (1-basiert):
 * A(1): Booking_ID | B(2): Datum | C(3): Haupt_Nachname | D(4): Haupt_Email
 * E(5): Gast_Vorname | F(6): Gast_Nachname | G(7): Gast_Email
 * H(8): Allergien_Praeferenzen | I(9): Status | J(10): Timestamp | K(11): Payment
 */

const SHEET_NAME = 'Reservationen';
const MAX_SEATS = 30;
const OPEN_DATES = [
  '2026-11-04','2026-11-05','2026-11-06','2026-11-07',
  '2026-11-11','2026-11-12','2026-11-13','2026-11-14'
];
const CACHE_KEY = 'availability_v1';
const CACHE_TTL = 360; // Sekunden (6 Minuten, länger als Trigger-Intervall)

// ============================================================
// CACHE MANAGEMENT
// ============================================================

/**
 * Liest das Sheet und schreibt die Verfügbarkeit in den Cache.
 * Wird durch einen zeitgesteuerten Trigger jede Minute aufgerufen.
 */
function refreshAvailabilityCache() {
  const availability = computeAvailabilityFromSheet();
  const cache = CacheService.getScriptCache();
  cache.put(CACHE_KEY, JSON.stringify(availability), CACHE_TTL);
  Logger.log('Cache aktualisiert: ' + JSON.stringify(availability));
}

/**
 * Liest direkt aus dem Sheet und berechnet die Verfügbarkeit.
 */
function computeAvailabilityFromSheet() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  const availability = {};
  OPEN_DATES.forEach(date => {
    availability[date] = { booked: 0, available: MAX_SEATS, total: MAX_SEATS };
  });

  for (let i = 1; i < data.length; i++) {
    const date = String(data[i][1]).trim();
    const status = String(data[i][8]).trim(); // Spalte I (Index 8)
    if (availability[date] && status !== 'Storniert' && status !== '') {
      availability[date].booked += 1;
      availability[date].available = Math.max(0, MAX_SEATS - availability[date].booked);
    }
  }
  return availability;
}

// ============================================================
// HTTP HANDLERS
// ============================================================

function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) ? e.parameter.action : 'getAvailability';

    if (action === 'getAvailability') {
      // Immer frisch aus dem Sheet lesen (kein veralteter Cache)
      const availability = computeAvailabilityFromSheet();
      // Cache trotzdem befüllen, damit createReservation-Invalidierung konsistent bleibt
      CacheService.getScriptCache().put(CACHE_KEY, JSON.stringify(availability), CACHE_TTL);
      return outputJSON({ status: 'success', data: availability, source: 'sheet' });
    }

    if (action === 'lookupBooking') {
      const email = String(e.parameter.email || '').toLowerCase().trim();
      const bookingId = String(e.parameter.bookingId || '').trim();
      if (!email || !bookingId) return outputJSON({ status: 'error', message: 'E-Mail und Booking-ID erforderlich.' });
      return lookupBookingData(email, bookingId);
    }

    return outputJSON({ status: 'error', message: 'Ungültige GET Action.' });
  } catch (err) {
    return outputJSON({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    if (!e.postData || !e.postData.contents) return outputJSON({ status: 'error', message: 'Keine Daten empfangen.' });
    
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === 'createReservation') return createReservation(payload);
    if (action === 'updateReservation') return updateReservation(payload);

    return outputJSON({ status: 'error', message: 'Ungültige POST Action.' });
  } catch (err) {
    return outputJSON({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// BUSINESS LOGIC
// ============================================================

function createReservation(payload) {
  const datum = String(payload.datum || '').trim();
  const hauptEmail = String(payload.hauptEmail || '').toLowerCase().trim();
  const hauptNachname = String(payload.hauptNachname || '').trim();
  const gaeste = payload.gaeste || [];

  if (!OPEN_DATES.includes(datum)) return outputJSON({ status: 'error', message: 'Ungültiges Veranstaltungsdatum.' });
  if (!hauptEmail || !hauptNachname || gaeste.length === 0) return outputJSON({ status: 'error', message: 'Unvollständige Angaben.' });

  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();

  // Aktuelle Belegung aus Sheet (direkt, wegen Lock)
  let gebucht = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === datum && String(data[i][8]).trim() !== 'Storniert' && String(data[i][8]).trim() !== '') {
      gebucht++;
    }
  }

  if (gaeste.length > (MAX_SEATS - gebucht)) {
    return outputJSON({ status: 'error', code: 'FULL', message: 'Leider haben wir nicht genug Platz an deinem gewünschten Abend. Suche dir einen anderen Abend oder wende dich per Email an uns. reservation.flussschaenke@gmail.com' });
  }

  const bookingId = 'RES-' + datum.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
  const timestamp = new Date().toISOString();

  gaeste.forEach(gast => {
    sheet.appendRow([bookingId, datum, hauptNachname, hauptEmail, gast.vorname || '', gast.nachname || '', gast.email || '', gast.allergien || 'Keine Einschränkungen', 'Aktiv', timestamp, false]);
  });

  // Cache sofort invalidieren, damit nächste Anfrage frisch ist
  CacheService.getScriptCache().remove(CACHE_KEY);
  // Direkt neu aufbauen (nicht warten auf Trigger)
  refreshAvailabilityCache();

  sendConfirmationEmail(hauptEmail, bookingId, datum, gaeste);
  return outputJSON({ status: 'success', bookingId, datum, anzahlPlaetze: gaeste.length });
}

function updateReservation(payload) {
  const bookingId = String(payload.bookingId || '').trim();
  const hauptEmail = String(payload.hauptEmail || '').toLowerCase().trim();
  const gaeste = payload.gaeste || [];

  if (!bookingId || !hauptEmail || gaeste.length === 0) return outputJSON({ status: 'error', message: 'Unvollständige Daten.' });

  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  let targetDatum = '', savedNachname = '';
  const existingRows = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === bookingId && String(data[i][3]).toLowerCase().trim() === hauptEmail && String(data[i][8]).trim() !== 'Storniert') {
      targetDatum = String(data[i][1]).trim();
      savedNachname = String(data[i][2]).trim();
      existingRows.push({ row: i + 1, payment: data[i][10] });
    }
  }

  if (existingRows.length === 0) return outputJSON({ status: 'error', message: 'Reservation nicht gefunden.' });

  const timestamp = new Date().toISOString();

  for (let i = 0; i < gaeste.length; i++) {
    if (i < existingRows.length) {
      const r = existingRows[i].row;
      sheet.getRange(r, 5).setValue(gaeste[i].vorname || '');
      sheet.getRange(r, 6).setValue(gaeste[i].nachname || '');
      sheet.getRange(r, 7).setValue(gaeste[i].email || '');
      sheet.getRange(r, 8).setValue(gaeste[i].allergien || 'Keine Einschränkungen');
      sheet.getRange(r, 10).setValue(timestamp);
    } else {
      sheet.appendRow([bookingId, targetDatum, savedNachname, hauptEmail, gaeste[i].vorname || '', gaeste[i].nachname || '', gaeste[i].email || '', gaeste[i].allergien || 'Keine Einschränkungen', 'Aktiv', timestamp, false]);
    }
  }
  for (let i = gaeste.length; i < existingRows.length; i++) {
    sheet.getRange(existingRows[i].row, 9).setValue('Storniert');
    sheet.getRange(existingRows[i].row, 10).setValue(timestamp);
  }

  refreshAvailabilityCache();
  sendUpdateConfirmationEmail(hauptEmail, bookingId, targetDatum, gaeste);
  return outputJSON({ status: 'success', message: 'Reservation erfolgreich aktualisiert.' });
}

function lookupBookingData(email, bookingId) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  const gaeste = [];
  let datum = '', hauptEmail = '', totalPaid = 0;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === bookingId && String(data[i][3]).toLowerCase().trim() === email && String(data[i][8]).trim() !== 'Storniert') {
      datum = String(data[i][1]).trim();
      hauptEmail = String(data[i][3]).trim();
      const paid = (data[i][10] === true || String(data[i][10]).toUpperCase() === 'TRUE' || String(data[i][10]).toUpperCase() === 'WAHR');
      if (paid) totalPaid++;
      gaeste.push({ vorname: String(data[i][4]), nachname: String(data[i][5]), email: String(data[i][6]), allergien: String(data[i][7]) });
    }
  }

  if (gaeste.length === 0) return outputJSON({ status: 'error', message: 'Keine aktive Reservation für diese Angaben gefunden.' });
  return outputJSON({ status: 'success', bookingId, datum, hauptEmail, gaeste, paymentInfo: { totalPaid, isFullyPaid: totalPaid >= gaeste.length } });
}

// ============================================================
// HELPERS
// ============================================================

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Booking_ID','Datum','Haupt_Nachname','Haupt_Email','Gast_Vorname','Gast_Nachname','Gast_Email','Allergien_Praeferenzen','Status','Timestamp','Payment']);
    sheet.getRange(1,1,1,11).setFontWeight('bold').setBackground('#EFEFEF');
  }
  return sheet;
}

function outputJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function formatDateCH(isoStr) {
  if (!isoStr) return '';
  const p = isoStr.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : isoStr;
}

function sendConfirmationEmail(toEmail, bookingId, datumStr, gaeste) {
  try {
    const formattedDate = formatDateCH(datumStr);
    const betrag = gaeste.length * 50;
    const gastListHtml = gaeste.map(g => `<li><strong>${g.vorname} ${g.nachname}</strong> &ndash; ${g.allergien || 'Keine Einschränkungen'}</li>`).join('');
    const subject = `Reservation bestätigt – Flussschänke Zürich (${formattedDate})`;
    const bodyHtml = `
      <div style="font-family:sans-serif;color:#4A3828;max-width:600px;margin:0 auto;border:1px solid #EAE0D5;border-radius:12px;padding:28px;background:#FDFBF7;">
        <h2 style="color:#A06840;border-bottom:2px solid #C8956C;padding-bottom:12px;">Flussschänke Zürich &middot; Limmatelier</h2>
        <p>Wir haben deine Plätze reserviert. Twinte eure Anzahlung von <strong>CHF ${betrag}.&ndash;</strong> (${gaeste.length} &times; CHF 50) innert 48 Stunden. Sobald wir sie bestätigen, bist du bei uns fix auf der Liste.</p>
        <div style="background:#FDF9EE;border-left:4px solid #C8956C;padding:14px;border-radius:6px;margin:18px 0;">
          <strong>Booking-ID:</strong> <code style="font-size:1.1em;background:#FFF;padding:2px 6px;border-radius:4px;">${bookingId}</code><br>
          <strong>Datum:</strong> ${formattedDate}<br>
          <strong>Zeit:</strong> Eintreffen 18h | Menüstart 19h<br>
          <strong>Plätze:</strong> ${gaeste.length}
        </div>
        <h4 style="color:#A06840;">Gästeliste &amp; Allergien</h4>
        <ul style="padding-left:20px;line-height:1.7;">${gastListHtml}</ul>
        <div style="background:#FFF;border:1px dashed #C8956C;padding:14px;border-radius:8px;margin-top:20px;font-size:0.9em;color:#8C7060;">
          <strong>Wichtiger Hinweis:</strong> Du kannst Gästedaten und Allergien jederzeit unter "Reservation verwalten" auf <a href="https://pinkpenguin.ch/flussschaenke-reservation" style="color:#C8956C;">pinkpenguin.ch/flussschaenke-reservation</a> anpassen. Benutze dazu deine E-Mail und Booking-ID.
        </div>
        <p style="margin-top:20px;font-size:0.85em;color:#8C7060;border-top:1px solid #EAE0D5;padding-top:14px;">limmatelier.ch &middot; Hönggerstrasse 45a, 8037 Zürich &middot; <a href="mailto:reservation.flussschaenke@gmail.com" style="color:#C8956C;">reservation.flussschaenke@gmail.com</a></p>
      </div>`;
    MailApp.sendEmail({ to: toEmail, subject, body: `Booking-ID: ${bookingId}`, htmlBody: bodyHtml });
  } catch (err) { Logger.log('E-Mail Fehler: ' + err); }
}

function sendUpdateConfirmationEmail(toEmail, bookingId, datumStr, gaeste) {
  try {
    const formattedDate = formatDateCH(datumStr);
    const gastListHtml = gaeste.map(g => `<li><strong>${g.vorname} ${g.nachname}</strong> &ndash; ${g.allergien || 'Keine'}</li>`).join('');
    const subject = `Reservation aktualisiert – Flussschänke Zürich (${formattedDate})`;
    const bodyHtml = `
      <div style="font-family:sans-serif;color:#4A3828;max-width:600px;margin:0 auto;border:1px solid #EAE0D5;border-radius:12px;padding:28px;background:#FDFBF7;">
        <h2 style="color:#A06840;">Flussschänke Zürich &middot; Limmatelier</h2>
        <p>Deine Reservation <strong>${bookingId}</strong> für den <strong>${formattedDate}</strong> wurde aktualisiert.</p>
        <h4 style="color:#A06840;">Aktualisierte Gästeliste</h4>
        <ul style="padding-left:20px;line-height:1.7;">${gastListHtml}</ul>
      </div>`;
    MailApp.sendEmail({ to: toEmail, subject, body: `Aktualisiert: ${bookingId}`, htmlBody: bodyHtml });
  } catch (err) { Logger.log('E-Mail Fehler: ' + err); }
}
