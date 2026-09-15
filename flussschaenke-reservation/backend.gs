/**
 * Fluss-Schänke Zürich - Backend Google Apps Script
 *
 * GESCHWINDIGKEITS-ARCHITEKTUR:
 * - Ein zeitgesteuerter Trigger (jede Minute) ruft refreshAvailabilityCache() auf.
 * - Dieser liest das Sheet und speichert das Ergebnis im CacheService (Script-Cache).
 * - doGet('getAvailability') liest NUR den Cache – das ist ~100ms statt 2-5 Sekunden.
 * - Nach einer Buchung wird der Cache sofort ungültig gemacht und neu befüllt.
 */

const SHEET_NAME = 'Reservationen';
const MAX_SEATS = 30;
const OPEN_DATES = [
  '2026-11-04','2026-11-05','2026-11-06','2026-11-07',
  '2026-11-11','2026-11-12','2026-11-13','2026-11-14'
];

const CACHE_KEY = 'availability_v2';
const CACHE_TTL = 360; 

// ============================================================
// CACHE MANAGEMENT
// ============================================================

function refreshAvailabilityCache() {
  const availability = computeAvailabilityFromSheet();
  const cache = CacheService.getScriptCache();
  cache.put(CACHE_KEY, JSON.stringify(availability), CACHE_TTL);
  Logger.log('Cache aktualisiert: ' + JSON.stringify(availability));
}

function computeAvailabilityFromSheet() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  const availability = {};
  OPEN_DATES.forEach(date => {
    availability[date] = { booked: 0, available: MAX_SEATS, total: MAX_SEATS };
  });

  for (let i = 1; i < data.length; i++) {
    const date = parseSheetDate(data[i][1]);
    const status = String(data[i][8]).trim();
    if (availability[date] && !status.startsWith('Storniert') && status !== '') {
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
      const cache = CacheService.getScriptCache();
      const cachedData = cache.get(CACHE_KEY);

      if (cachedData) {
        return outputJSON({ status: 'success', data: JSON.parse(cachedData), source: 'cache' });
      }

      const availability = computeAvailabilityFromSheet();
      cache.put(CACHE_KEY, JSON.stringify(availability), 60);

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
  const datum = sanitizeSheetInput(payload.datum);
  const hauptEmail = sanitizeSheetInput(payload.hauptEmail).toLowerCase();
  const hauptNachname = sanitizeSheetInput(payload.hauptNachname);
  const gaeste = payload.gaeste || [];

  if (!OPEN_DATES.includes(datum)) return outputJSON({ status: 'error', message: 'Ungültiges Veranstaltungsdatum.' });
  if (!hauptEmail || !hauptNachname || gaeste.length === 0) return outputJSON({ status: 'error', message: 'Unvollständige Angaben.' });

  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();

  let gebucht = 0;
  for (let i = 1; i < data.length; i++) {
    const sheetDatum = parseSheetDate(data[i][1]);
    if (sheetDatum === datum && !String(data[i][8]).trim().startsWith('Storniert') && String(data[i][8]).trim() !== '') {
      gebucht++;
    }
  }

  if (gaeste.length > (MAX_SEATS - gebucht)) {
    return outputJSON({ status: 'error', code: 'FULL', message: 'Diese Plätze sind beliebt. Wir sind fast ausgebucht. Melde dich per Email bei uns. Wir finden bestimmt eine Lösung.' });
  }

  const bookingId = 'RES-' + datum.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
  const timestamp = new Date().toISOString();
  const safeDatumString = "'" + datum; 

  gaeste.forEach(gast => {
    const vName = sanitizeSheetInput(gast.vorname);
    const nName = sanitizeSheetInput(gast.nachname);
    const gEmail = sanitizeSheetInput(gast.email);
    const gAllergie = sanitizeSheetInput(gast.allergien) || 'Keine Einschränkungen';
    
    sheet.appendRow([bookingId, safeDatumString, hauptNachname, hauptEmail, vName, nName, gEmail, gAllergie, 'Aktiv', timestamp, false]);
  });

  CacheService.getScriptCache().remove(CACHE_KEY);
  refreshAvailabilityCache();

  sendConfirmationEmail(hauptEmail, bookingId, datum, gaeste);
  return outputJSON({ status: 'success', bookingId, datum, anzahlPlaetze: gaeste.length });
}

function updateReservation(payload) {
  const bookingId = sanitizeSheetInput(payload.bookingId);
  const hauptEmail = sanitizeSheetInput(payload.hauptEmail).toLowerCase();
  const gaeste = payload.gaeste || [];

  if (!bookingId || !hauptEmail || gaeste.length === 0) return outputJSON({ status: 'error', message: 'Unvollständige Daten.' });

  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  let targetDatum = '', savedNachname = '';
  const existingRows = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === bookingId && String(data[i][3]).toLowerCase().trim() === hauptEmail && !String(data[i][8]).trim().startsWith('Storniert')) {
      targetDatum = parseSheetDate(data[i][1]);
      savedNachname = String(data[i][2]).trim();
      existingRows.push({ row: i + 1, payment: data[i][10], status: String(data[i][8]).trim() });
    }
  }

  if (existingRows.length === 0) return outputJSON({ status: 'error', message: 'Reservation nicht gefunden.' });

  const timestamp = new Date().toISOString();
  const safeDatumString = "'" + targetDatum;

  for (let i = 0; i < gaeste.length; i++) {
    const vName = sanitizeSheetInput(gaeste[i].vorname);
    const nName = sanitizeSheetInput(gaeste[i].nachname);
    const gEmail = sanitizeSheetInput(gaeste[i].email);
    const gAllergie = sanitizeSheetInput(gaeste[i].allergien) || 'Keine Einschränkungen';

    if (i < existingRows.length) {
      const r = existingRows[i].row;
      sheet.getRange(r, 5).setValue(vName);
      sheet.getRange(r, 6).setValue(nName);
      sheet.getRange(r, 7).setValue(gEmail);
      sheet.getRange(r, 8).setValue(gAllergie);
      sheet.getRange(r, 10).setValue(timestamp);
    } else {
      const inheritStatus = (existingRows[0] && existingRows[0].status === 'Bezahlt') ? 'Bezahlt' : 'Aktiv';
      sheet.appendRow([bookingId, safeDatumString, savedNachname, hauptEmail, vName, nName, gEmail, gAllergie, inheritStatus, timestamp, false]);
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
    if (String(data[i][0]).trim() === bookingId && String(data[i][3]).toLowerCase().trim() === email && !String(data[i][8]).trim().startsWith('Storniert')) {
      datum = parseSheetDate(data[i][1]);
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

function parseSheetDate(cellValue) {
  if (!cellValue) return '';
  if (cellValue instanceof Date) {
    const y = cellValue.getFullYear();
    const m = String(cellValue.getMonth() + 1).padStart(2, '0');
    const d = String(cellValue.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(cellValue).trim();
}

function sanitizeSheetInput(str) {
  if (!str) return '';
  return String(str).replace(/^[=+\-@\s]+/g, '').trim();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// E-MAIL VERSAND (GMAIL APP)
// ============================================================

function sendConfirmationEmail(toEmail, bookingId, datumStr, gaeste) {
  try {
    const formattedDate = formatDateCH(datumStr);
    const betrag = gaeste.length * 50;
    
    const gastListHtml = gaeste.map(g => {
      const v = escapeHtml(g.vorname);
      const n = escapeHtml(g.nachname);
      const a = escapeHtml(g.allergien || 'Keine Einschränkungen');
      return `<li><strong>${v} ${n}</strong> &ndash; ${a}</li>`;
    }).join('');
    
    const subject = `Reservation erhalten – Fluss-Schänke Zürich (${formattedDate})`;
    const bodyHtml = `
      <div style="font-family:sans-serif;color:#4A3828;max-width:600px;margin:0 auto;border:1px solid #EAE0D5;border-radius:12px;padding:28px;background:#FDFBF7;">
        <h2 style="color:#A06840;border-bottom:2px solid #C8956C;padding-bottom:12px;">Fluss-Schänke Zürich &middot; Limmatelier</h2>
        <p>Ciao! Wir haben deine Plätze reserviert. Bitte überweise deine Anzahlung von <strong>CHF ${betrag}.&ndash;</strong> (${gaeste.length} &times; CHF 50) innert 48 Stunden. Sobald wir die Anzahlung per Email bestätigen, bist du bei uns fix auf der Liste. A dopo!</p>
        
        <div style="background:#FFF;border:1px solid #C8956C;padding:20px;border-radius:8px;margin:24px 0;">
          <h3 style="color:#A06840;margin-top:0;margin-bottom:12px;">Zahlungsinformationen</h3>
          <p style="margin-top:0;font-size:0.95em;color:#4A3828;">Scanne den QR-Code mit deiner E-Banking App oder löse die Überweisung manuell aus:</p>
          
          <div style="background:#FDF9EE;padding:14px;border-radius:6px;font-family:monospace;font-size:0.95em;margin-bottom:20px;line-height:1.5;">
            <strong>Konto:</strong> CH61 0070 0114 8069 5993 4<br>
            <strong>Empfänger:</strong> Verein Flusshüsli, 8037 Zürich<br>
            <strong>Zweck:</strong> ${escapeHtml(bookingId)}
          </div>
          
          <div style="text-align:center;">
            <img src="https://fluss-schaenke.ch/img/twint.png" alt="QR-Code für Zahlung" style="width:100%;max-width:240px;border-radius:8px;border:1px solid #EAE0D5;">
          </div>
        </div>

        <div style="background:#FDF9EE;border-left:4px solid #C8956C;padding:14px;border-radius:6px;margin:18px 0;">
          <strong>Booking-ID:</strong> <code style="font-size:1.1em;background:#FFF;padding:2px 6px;border-radius:4px;">${escapeHtml(bookingId)}</code><br>
          <strong>Datum:</strong> ${formattedDate}<br>
          <strong>Zeit:</strong> Eintreffen 18h | Menüstart 19h<br>
          <strong>Plätze:</strong> ${gaeste.length}
        </div>
        <h4 style="color:#A06840;">Gästeliste &amp; Allergien</h4>
        <ul style="padding-left:20px;line-height:1.7;">${gastListHtml}</ul>
        <div style="background:#FFF;border:1px dashed #C8956C;padding:14px;border-radius:8px;margin-top:20px;font-size:0.9em;color:#8C7060;">
          <strong>Wichtiger Hinweis:</strong> Du kannst Gästedaten und Allergien jederzeit unter "Reservation verwalten" auf <a href="https://fluss-schaenke.ch/" style="color:#C8956C;">fluss-schaenke.ch</a> anpassen. Benutze dazu deine E-Mail und Booking-ID.
        </div>
        <p style="margin-top:20px;font-size:0.85em;color:#8C7060;border-top:1px solid #EAE0D5;padding-top:14px;">limmatelier.ch &middot; Hönggerstrasse 45a, 8037 Zürich &middot; <a href="mailto:booking@fluss-schaenke.ch" style="color:#C8956C;">booking@fluss-schaenke.ch</a></p>
      </div>`;
      
    GmailApp.sendEmail(toEmail, subject, `Booking-ID: ${bookingId} - Bitte überweise CHF ${betrag}.`, {
      htmlBody: bodyHtml,
      from: 'booking@fluss-schaenke.ch',
      name: 'Fluss-Schänke Zürich'
    });
  } catch (err) { Logger.log('E-Mail Fehler: ' + err); }
}

function sendUpdateConfirmationEmail(toEmail, bookingId, datumStr, gaeste) {
  try {
    const formattedDate = formatDateCH(datumStr);
    
    const gastListHtml = gaeste.map(g => {
      const v = escapeHtml(g.vorname);
      const n = escapeHtml(g.nachname);
      const a = escapeHtml(g.allergien || 'Keine Einschränkungen');
      return `<li><strong>${v} ${n}</strong> &ndash; ${a}</li>`;
    }).join('');
    
    const subject = `Reservation aktualisiert – Fluss-Schänke Zürich (${formattedDate})`;
    const bodyHtml = `
      <div style="font-family:sans-serif;color:#4A3828;max-width:600px;margin:0 auto;border:1px solid #EAE0D5;border-radius:12px;padding:28px;background:#FDFBF7;">
        <h2 style="color:#A06840;">Fluss-Schänke Zürich &middot; Limmatelier</h2>
        <p>Ciao! Deine Reservation <strong>${escapeHtml(bookingId)}</strong> für den <strong>${formattedDate}</strong> wurde aktualisiert.</p>
        <h4 style="color:#A06840;">Aktualisierte Gästeliste</h4>
        <ul style="padding-left:20px;line-height:1.7;">${gastListHtml}</ul>
        <p style="margin-top:20px;font-size:0.85em;color:#8C7060;border-top:1px solid #EAE0D5;padding-top:14px;">limmatelier.ch &middot; Hönggerstrasse 45a, 8037 Zürich &middot; <a href="mailto:booking@fluss-schaenke.ch" style="color:#C8956C;">booking@fluss-schaenke.ch</a></p>
      </div>`;
      
    GmailApp.sendEmail(toEmail, subject, `Aktualisiert: ${bookingId}`, {
      htmlBody: bodyHtml,
      from: 'booking@fluss-schaenke.ch',
      name: 'Fluss-Schänke Zürich'
    });
  } catch (err) { Logger.log('E-Mail Fehler: ' + err); }
}

function sendCancellationEmail(toEmail, bookingId, datumStr, nachname) {
  try {
    const formattedDate = formatDateCH(datumStr);
    
    const subject = `Reservation storniert – Fluss-Schänke Zürich (${formattedDate})`;
    const bodyHtml = `
      <div style="font-family:sans-serif;color:#4A3828;max-width:600px;margin:0 auto;border:1px solid #EAE0D5;border-radius:12px;padding:28px;background:#FDFBF7;">
        <h2 style="color:#A06840;border-bottom:2px solid #C8956C;padding-bottom:12px;">Fluss-Schänke Zürich &middot; Limmatelier</h2>
        <p>Ciao!</p>
        <p>Wir haben deine Reservation für den <strong>${formattedDate}</strong> storniert.</p>
        <div style="background:#FDF9EE;border-left:4px solid #C8956C;padding:14px;border-radius:6px;margin:18px 0;">
          <strong>Booking-ID:</strong> <code style="font-size:1.1em;background:#FFF;padding:2px 6px;border-radius:4px;">${escapeHtml(bookingId)}</code><br>
          <strong>Status:</strong> Storniert
        </div>
        <p>Fragen oder Unklarheiten? Melde dich bei uns per Email auf <a href="mailto:booking@fluss-schaenke.ch" style="color:#C8956C;">booking@fluss-schaenke.ch</a>.</p>
        <p style="margin-top:20px;font-size:0.85em;color:#8C7060;border-top:1px solid #EAE0D5;padding-top:14px;">limmatelier.ch &middot; Hönggerstrasse 45a, 8037 Zürich &middot; <a href="mailto:booking@fluss-schaenke.ch" style="color:#C8956C;">booking@fluss-schaenke.ch</a></p>
      </div>`;
      
    GmailApp.sendEmail(toEmail, subject, `Reservation ${bookingId} storniert.`, {
      htmlBody: bodyHtml,
      from: 'booking@fluss-schaenke.ch',
      name: 'Fluss-Schänke Zürich'
    });
  } catch (err) { Logger.log('E-Mail Fehler (Storno): ' + err); }
}

function sendPaymentConfirmationEmail(toEmail, bookingId, datumStr, anzahlPersonen) {
  try {
    const formattedDate = formatDateCH(datumStr);
    const betrag = anzahlPersonen * 50;
    
    const subject = `Anzahlung bestätigt – Fluss-Schänke Zürich (${formattedDate})`;
    const bodyHtml = `
      <div style="font-family:sans-serif;color:#4A3828;max-width:600px;margin:0 auto;border:1px solid #EAE0D5;border-radius:12px;padding:28px;background:#FDFBF7;">
        <h2 style="color:#A06840;border-bottom:2px solid #C8956C;padding-bottom:12px;">Fluss-Schänke Zürich &middot; Limmatelier</h2>
        <p>Grazie! Wir haben deine Anzahlung von <strong>CHF ${betrag}.&ndash;</strong> für <strong>${anzahlPersonen} Personen</strong> erhalten.</p>
        <p>Deine Reservation für den <strong>${formattedDate}</strong> ist nun definitiv bestätigt und du stehst fix auf unserer Gästeliste.</p>
        <div style="background:#FDF9EE;border-left:4px solid #C8956C;padding:14px;border-radius:6px;margin:18px 0;">
          <strong>Booking-ID:</strong> <code style="font-size:1.1em;background:#FFF;padding:2px 6px;border-radius:4px;">${escapeHtml(bookingId)}</code><br>
          <strong>Datum:</strong> ${formattedDate}<br>
          <strong>Zeit:</strong> Eintreffen ab 18:00 Uhr | Menüstart 19:00 Uhr<br>
        </div>
        <div style="background:#FFF;border:1px dashed #C8956C;padding:14px;border-radius:8px;margin-top:20px;font-size:0.9em;color:#8C7060;">
          <strong>Wichtiger Hinweis:</strong> Du kannst Gästedaten und Präferenzen jederzeit unter "Reservation verwalten" auf <a href="https://fluss-schaenke.ch/" style="color:#C8956C;">fluss-schaenke.ch</a> anpassen. Benutze dazu deine E-Mail und Booking-ID.
        </div>
        <p style="margin-top:20px;font-size:0.85em;color:#8C7060;border-top:1px solid #EAE0D5;padding-top:14px;">limmatelier.ch &middot; Hönggerstrasse 45a, 8037 Zürich &middot; <a href="mailto:booking@fluss-schaenke.ch" style="color:#C8956C;">booking@fluss-schaenke.ch</a></p>
      </div>`;
      
    GmailApp.sendEmail(toEmail, subject, `Zahlungseingang bestätigt für ${bookingId}. Betrag: CHF ${betrag}.`, {
      htmlBody: bodyHtml,
      from: 'booking@fluss-schaenke.ch',
      name: 'Fluss-Schänke Zürich'
    });
  } catch (err) { 
    Logger.log('E-Mail Fehler (Payment): ' + err); 
  }
}

// ============================================================
// SHEET TRIGGERS
// ============================================================

/**
 * Trigger-Funktion: Reagiert auf manuelle Änderungen im Sheet.
 * Behandelt Status-Änderungen (Stornierung) und Payment-Änderungen.
 */
function handleStatusChange(e) {
  if (!e || !e.range) return;
  
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  
  const row = e.range.getRow();
  const col = e.range.getColumn();
  
  // Hört ausschliesslich auf Spalte I (9 - Status) und K (11 - Payment)
  if ((col !== 9 && col !== 11) || row < 2) return;
  
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(5000);
    
    const bookingId = String(sheet.getRange(row, 1).getValue()).trim();
    const hauptEmail = String(sheet.getRange(row, 4).getValue()).trim();
    const datum = parseSheetDate(sheet.getRange(row, 2).getValue());
    
    const data = sheet.getDataRange().getValues();

    if (col === 11) {
      // --------------------------------------------------------
      // PAYMENT LOGIC
      // --------------------------------------------------------
      const isChecked = e.range.getValue() === true;
      if (!isChecked) return; 

      let totalGuests = 0;
      let paidGuests = 0;
      let alreadyProcessed = false;
      const rowsToUpdate = [];
      
      for (let i = 1; i < data.length; i++) {
        const currentBookingId = String(data[i][0]).trim();
        const status = String(data[i][8]).trim();
        
        if (currentBookingId === bookingId && !status.startsWith('Storniert')) {
          totalGuests++;
          rowsToUpdate.push(i + 1);
          
          if (status === 'Bezahlt') {
            alreadyProcessed = true;
          }
          
          const paid = (data[i][10] === true || String(data[i][10]).toUpperCase() === 'TRUE' || String(data[i][10]).toUpperCase() === 'WAHR');
          if (paid) {
            paidGuests++;
          }
        }
      }
      
      if (totalGuests > 0 && totalGuests === paidGuests && !alreadyProcessed) {
        sendPaymentConfirmationEmail(hauptEmail, bookingId, datum, totalGuests);
        Logger.log(`Zahlung bestätigt für ${bookingId}. E-Mail versendet.`);
        
        rowsToUpdate.forEach(r => {
          sheet.getRange(r, 9).setValue('Bezahlt'); 
        });
      }
    } else if (col === 9) {
      // --------------------------------------------------------
      // CANCELLATION LOGIC
      // --------------------------------------------------------
      const newStatus = String(e.range.getValue()).trim();
      
      if (newStatus === 'Storniert') {
        let totalRows = 0;
        let cancelledRows = 0;
        let mailAlreadySent = false;
        const rowsToUpdate = [];
        let hauptNachname = '';

        for (let i = 1; i < data.length; i++) {
          const currentBookingId = String(data[i][0]).trim();
          if (currentBookingId === bookingId) {
            totalRows++;
            rowsToUpdate.push(i + 1);
            if (hauptNachname === '') hauptNachname = String(data[i][2]).trim();

            const status = String(data[i][8]).trim();
            if (status.startsWith('Storniert')) {
              cancelledRows++;
            }
            if (status === 'Storniert (Mail)') {
              mailAlreadySent = true;
            }
          }
        }

        // E-Mail versenden, wenn alle Zeilen dieser Buchung storniert wurden und noch keine Mail rausging
        if (totalRows > 0 && totalRows === cancelledRows && !mailAlreadySent) {
          sendCancellationEmail(hauptEmail, bookingId, datum, hauptNachname);
          Logger.log(`Stornierung für ${bookingId} verarbeitet. E-Mail versendet.`);

          // Markieren, um Spam zu verhindern
          rowsToUpdate.forEach(r => {
            sheet.getRange(r, 9).setValue('Storniert (Mail)');
          });
        }
      }
      
      // Zwingend ausführen bei Statusänderungen: Cache invalidieren, um freie Plätze dem Frontend sofort mitzuteilen
      refreshAvailabilityCache();
    }
  } catch (err) {
    Logger.log('Fehler im handleStatusChange Trigger: ' + err);
  } finally {
    lock.releaseLock();
  }
}