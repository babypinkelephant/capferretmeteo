/**
 * Flussschänke Zürich - Backend Google Apps Script (backend.gs)
 * Tabellenblatt: "Reservationen"
 *
 * Spalten-Aufbau (Zeile 1 Header, 1-basiert):
 * 1 (A): Booking_ID
 * 2 (B): Datum
 * 3 (C): Haupt_Nachname
 * 4 (D): Haupt_Email
 * 5 (E): Gast_Vorname
 * 6 (F): Gast_Nachname
 * 7 (G): Gast_Email
 * 8 (H): Allergien_Praeferenzen
 * 9 (I): Status (Aktiv / Storniert)
 * 10 (J): Timestamp
 * 11 (K): Payment (Checkbox WAHR/FALSCH)
 */

const SHEET_NAME = 'Reservationen';
const MAX_SEATS_PER_NIGHT = 30;
const OPEN_DATES = [
  '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', 
  '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'
];

function outputJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'Booking_ID', 'Datum', 'Haupt_Nachname', 'Haupt_Email', 
      'Gast_Vorname', 'Gast_Nachname', 'Gast_Email', 
      'Allergien_Praeferenzen', 'Status', 'Timestamp', 'Payment'
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#EFEFEF');
  }
  return sheet;
}

// GET-APIs: Verfügbarkeiten und Reservationen abrufen
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) ? e.parameter.action : 'getAvailability';
    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();

    if (action === 'getAvailability') {
      const availability = {};
      OPEN_DATES.forEach(date => {
        availability[date] = { booked: 0, available: MAX_SEATS_PER_NIGHT, total: MAX_SEATS_PER_NIGHT };
      });

      // data[i][8] ist Spalte I (Status)
      for (let i = 1; i < data.length; i++) {
        const date = String(data[i][1]).trim();
        const status = String(data[i][8]).trim(); // Index 8 = Spalte I (Status)

        if (availability[date] && status !== 'Storniert' && status !== '') {
          availability[date].booked += 1;
          availability[date].available = Math.max(0, MAX_SEATS_PER_NIGHT - availability[date].booked);
        }
      }
      return outputJSON({ status: 'success', data: availability });
    }

    if (action === 'lookupBooking') {
      const email = String(e.parameter.email || '').toLowerCase().trim();
      const bookingId = String(e.parameter.bookingId || '').trim();

      if (!email || !bookingId) return outputJSON({ status: 'error', message: 'E-Mail und Booking-ID erforderlich.' });

      const gaeste = [];
      let datum = '';
      let hauptEmail = '';
      let paymentStatus = false;
      let totalPaid = 0;

      for (let i = 1; i < data.length; i++) {
        const bId = String(data[i][0]).trim();
        const hEmail = String(data[i][3]).toLowerCase().trim(); // Index 3 = Spalte D (Haupt_Email)
        const status = String(data[i][8]).trim(); // Index 8 = Spalte I (Status)

        if (bId === bookingId && hEmail === email && status !== 'Storniert') {
          datum = String(data[i][1]).trim();
          hauptEmail = String(data[i][3]).trim();
          
          const isPaid = (data[i][10] === true || String(data[i][10]).toUpperCase() === 'TRUE' || String(data[i][10]).toUpperCase() === 'WAHR');
          if (isPaid) totalPaid++;

          gaeste.push({
            rowIndex: i + 1,
            vorname: String(data[i][4]), // E
            nachname: String(data[i][5]), // F
            email: String(data[i][6]), // G
            allergien: String(data[i][7]) // H
          });
        }
      }

      if (gaeste.length === 0) return outputJSON({ status: 'error', message: 'Keine aktive Reservation für diese Angaben gefunden.' });

      return outputJSON({
        status: 'success',
        bookingId: bookingId,
        datum: datum,
        hauptEmail: hauptEmail,
        gaeste: gaeste,
        paymentInfo: {
          totalPaid: totalPaid,
          isFullyPaid: totalPaid >= gaeste.length
        }
      });
    }

    return outputJSON({ status: 'error', message: 'Ungültige GET Action.' });
  } catch (err) {
    return outputJSON({ status: 'error', message: err.toString() });
  }
}

// POST-APIs: Reservation erstellen oder bearbeiten
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    if (!e.postData || !e.postData.contents) {
      return outputJSON({ status: 'error', message: 'Keine Daten empfangen.' });
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const sheet = getOrCreateSheet();

    if (action === 'createReservation') {
      const datum = String(payload.datum || '').trim();
      const hauptEmail = String(payload.hauptEmail || '').toLowerCase().trim();
      const hauptNachname = String(payload.hauptNachname || '').trim();
      const gaeste = payload.gaeste || [];

      if (!OPEN_DATES.includes(datum)) return outputJSON({ status: 'error', message: 'Ungültiges Veranstaltungsdatum.' });
      if (!hauptEmail || !hauptNachname || gaeste.length === 0) return outputJSON({ status: 'error', message: 'Unvollständige Angaben.' });

      const data = sheet.getDataRange().getValues();
      let gebuchtePlaetze = 0;
      for (let i = 1; i < data.length; i++) {
        const rowDate = String(data[i][1]).trim();
        const status = String(data[i][8]).trim(); // Index 8 = Spalte I (Status)
        if (rowDate === datum && status !== 'Storniert' && status !== '') {
          gebuchtePlaetze += 1;
        }
      }

      const verfuegbar = MAX_SEATS_PER_NIGHT - gebuchtePlaetze;
      if (gaeste.length > verfuegbar) {
        return outputJSON({
          status: 'error',
          code: 'FULL',
          message: 'Leider haben wir nicht genug Platz an deinem gewünschten Abend. Suche dir einen anderen Abend oder wende dich per Email an uns. reservation.flussschaenke@gmail.com'
        });
      }

      const cleanDate = datum.replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const bookingId = 'RES-' + cleanDate + '-' + randomSuffix;
      const timestamp = new Date().toISOString();

      gaeste.forEach(gast => {
        sheet.appendRow([
          bookingId, 
          datum, 
          hauptNachname, 
          hauptEmail, 
          gast.vorname || '', 
          gast.nachname || '', 
          gast.email || '', 
          gast.allergien || 'Keine Einschränkungen', 
          'Aktiv', 
          timestamp, 
          false // Payment = FALSCH
        ]);
      });

      sendConfirmationEmail(hauptEmail, bookingId, datum, gaeste);

      return outputJSON({
        status: 'success',
        bookingId: bookingId,
        datum: datum,
        anzahlPlaetze: gaeste.length
      });
    }

    if (action === 'updateReservation') {
      const bookingId = String(payload.bookingId || '').trim();
      const hauptEmail = String(payload.hauptEmail || '').toLowerCase().trim();
      const gaeste = payload.gaeste || [];

      if (!bookingId || !hauptEmail || gaeste.length === 0) return outputJSON({ status: 'error', message: 'Unvollständige Daten für das Update.' });

      const data = sheet.getDataRange().getValues();
      let targetDatum = '';
      let savedHauptNachname = '';
      const existingRowIndices = [];

      for (let i = 1; i < data.length; i++) {
        const bId = String(data[i][0]).trim();
        const hEmail = String(data[i][3]).toLowerCase().trim(); // Index 3 = Spalte D (Haupt_Email)
        const status = String(data[i][8]).trim(); // Index 8 = Spalte I (Status)

        if (bId === bookingId && hEmail === hauptEmail && status !== 'Storniert') {
          targetDatum = String(data[i][1]).trim();
          savedHauptNachname = String(data[i][2]).trim(); // Index 2 = Spalte C (Haupt_Nachname)
          existingRowIndices.push({
            row: i + 1,
            payment: data[i][10] // Index 10 = Spalte K (Payment)
          });
        }
      }

      if (existingRowIndices.length === 0) return outputJSON({ status: 'error', message: 'Reservation konnte nicht gefunden werden.' });

      const neugeschaffenePlaetze = gaeste.length - existingRowIndices.length;
      if (neugeschaffenePlaetze > 0) {
        let gebuchtePlaetze = 0;
        for (let i = 1; i < data.length; i++) {
          const rowDate = String(data[i][1]).trim();
          const status = String(data[i][8]).trim();
          if (rowDate === targetDatum && status !== 'Storniert' && status !== '') {
            gebuchtePlaetze += 1;
          }
        }
        if (neugeschaffenePlaetze > (MAX_SEATS_PER_NIGHT - gebuchtePlaetze)) {
          return outputJSON({
            status: 'error',
            code: 'FULL',
            message: 'Leider haben wir nicht genug Platz an deinem gewünschten Abend. Suche dir einen anderen Abend oder wende dich per Email an uns. reservation.flussschaenke@gmail.com'
          });
        }
      }

      const timestamp = new Date().toISOString();

      for (let i = 0; i < gaeste.length; i++) {
        const gast = gaeste[i];
        if (i < existingRowIndices.length) {
          const rowData = existingRowIndices[i];
          const row = rowData.row;
          sheet.getRange(row, 5).setValue(gast.vorname || ''); // E
          sheet.getRange(row, 6).setValue(gast.nachname || ''); // F
          sheet.getRange(row, 7).setValue(gast.email || ''); // G
          sheet.getRange(row, 8).setValue(gast.allergien || 'Keine Einschränkungen'); // H
          sheet.getRange(row, 10).setValue(timestamp); // J
        } else {
          sheet.appendRow([
            bookingId, 
            targetDatum, 
            savedHauptNachname, 
            hauptEmail, 
            gast.vorname || '', 
            gast.nachname || '', 
            gast.email || '', 
            gast.allergien || 'Keine Einschränkungen', 
            'Aktiv', 
            timestamp, 
            false
          ]);
        }
      }

      if (gaeste.length < existingRowIndices.length) {
        for (let i = gaeste.length; i < existingRowIndices.length; i++) {
          const row = existingRowIndices[i].row;
          sheet.getRange(row, 9).setValue('Storniert'); // I (Status)
          sheet.getRange(row, 10).setValue(timestamp); // J
        }
      }

      sendUpdateConfirmationEmail(hauptEmail, bookingId, targetDatum, gaeste);
      return outputJSON({ status: 'success', message: 'Reservation erfolgreich aktualisiert.' });
    }

    return outputJSON({ status: 'error', message: 'Ungültige POST Action.' });
  } catch (err) {
    return outputJSON({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// Hilfsfunktion: Bestätigungs-E-Mail bei Neubuchung
function sendConfirmationEmail(toEmail, bookingId, datumStr, gaeste) {
  try {
    const formattedDate = formatDateCH(datumStr);
    const subject = `Bestätigung deiner Reservation für die Flussschänke Zürich (${formattedDate})`;
    const betrag = gaeste.length * 50;
    
    let gastListHtml = '';
    gaeste.forEach((g, idx) => {
      gastListHtml += `<li style="margin-bottom: 6px;"><strong>${g.vorname} ${g.nachname}</strong> – <em>Präferenzen/Allergien: ${g.allergien || 'Keine'}</em></li>`;
    });

    const bodyHtml = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #4A4036; max-width: 600px; margin: 0 auto; border: 1px solid #EAE3DA; border-radius: 12px; padding: 24px; background-color: #FDFBF7;">
        <div style="text-align: center; padding-bottom: 16px; border-bottom: 2px solid #D4A373;">
          <h1 style="color: #B58356; margin: 0; font-size: 26px;">Flussschänke Zürich</h1>
          <p style="color: #8C7E72; margin-top: 4px; font-size: 14px;">Herbst-Pop-up an der Limmat</p>
        </div>

        <div style="padding: 20px 0;">
          <p style="font-size: 16px; line-height: 1.5;">Hoi!</p>
          <p style="font-size: 16px; line-height: 1.5;">Wir haben deine Plätze reserviert. Twinte eure Anzahlung von <strong>CHF ${betrag}.-</strong> (${gaeste.length} x CHF 50) innert 48 Stunden. Sobald wir sie bestätigen, bist du bei uns fix auf der Liste.</p>
          
          <div style="background-color: #FDF9EE; border-left: 4px solid #D4A373; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #B58356;">Deine Buchungsübersicht</h3>
            <p style="margin: 4px 0;"><strong>Booking-ID:</strong> <span style="font-family: monospace; font-size: 16px; background: #FFF; padding: 2px 6px; border-radius: 4px;">${bookingId}</span></p>
            <p style="margin: 4px 0;"><strong>Datum:</strong> ${formattedDate}</p>
            <p style="margin: 4px 0;"><strong>Zeit:</strong> Eintreffen 18h | Start 19h</p>
            <p style="margin: 4px 0;"><strong>Reservierte Plätze:</strong> ${gaeste.length}</p>
          </div>

          <h3 style="color: #B58356; margin-top: 24px;">Gästeliste & Allergien</h3>
          <ul style="padding-left: 20px; line-height: 1.6;">
            ${gastListHtml}
          </ul>

          <div style="background-color: #FFF; border: 1px dashed #D4A373; padding: 14px; border-radius: 8px; margin-top: 24px;">
            <h4 style="margin: 0 0 6px 0; color: #B58356;">Wichtiger Hinweis:</h4>
            <p style="margin: 0; font-size: 14px; color: #8C7E72;">
              Du kannst deine Gästedaten sowie Allergien jederzeit mit deiner Haupt-E-Mail und deiner Booking-ID unter "Reservation verwalten" auf <a href="https://pinkpenguin.ch/flussschaenke-reservation" style="color: #D4A373; font-weight: bold;">pinkpenguin.ch/flussschaenke-reservation</a> anpassen.
            </p>
          </div>
        </div>

        <div style="text-align: center; padding-top: 16px; border-top: 1px solid #EAE3DA; color: #8C7E72; font-size: 13px;">
          <p style="margin: 0;">limmatelier.ch · Hönggerstrasse 45a, 8037 Zürich · <a href="mailto:reservation.flussschaenke@gmail.com" style="color: #D4A373;">reservation.flussschaenke@gmail.com</a></p>
        </div>
      </div>
    `;

    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      body: `Booking-ID: ${bookingId}`, 
      htmlBody: bodyHtml
    });
  } catch (err) {
    Logger.log('E-Mail Fehler: ' + err.toString());
  }
}

// Hilfsfunktion: Bestätigungs-E-Mail bei Aktualisierung
function sendUpdateConfirmationEmail(toEmail, bookingId, datumStr, gaeste) {
  try {
    const formattedDate = formatDateCH(datumStr);
    const subject = `Aktualisierung deiner Reservation – Flussschänke Zürich (${formattedDate})`;
    
    let gastListHtml = '';
    gaeste.forEach((g, idx) => {
      gastListHtml += `<li style="margin-bottom: 6px;"><strong>${g.vorname} ${g.nachname}</strong> – <em>Präferenzen/Allergien: ${g.allergien || 'Keine'}</em></li>`;
    });

    const bodyHtml = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #4A4036; max-width: 600px; margin: 0 auto; border: 1px solid #EAE3DA; border-radius: 12px; padding: 24px; background-color: #FDFBF7;">
        <div style="text-align: center; padding-bottom: 16px; border-bottom: 2px solid #D4A373;">
          <h1 style="color: #B58356; margin: 0; font-size: 26px;">Flussschänke Zürich</h1>
          <p style="color: #8C7E72; margin-top: 4px; font-size: 14px;">Reservation aktualisiert</p>
        </div>

        <div style="padding: 20px 0;">
          <p style="font-size: 16px;">Hoi!</p>
          <p style="font-size: 16px;">Deine Reservation mit der Booking-ID <strong>${bookingId}</strong> für den <strong>${formattedDate}</strong> wurde erfolgreich aktualisiert.</p>
          
          <h3 style="color: #B58356; margin-top: 20px;">Aktualisierte Gästeliste</h3>
          <ul style="padding-left: 20px; line-height: 1.6;">
            ${gastListHtml}
          </ul>
        </div>
      </div>
    `;

    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      body: `Aktualisiert: Booking-ID ${bookingId}`,
      htmlBody: bodyHtml
    });
  } catch (err) {
    Logger.log('E-Mail Update Fehler: ' + err.toString());
  }
}

function formatDateCH(isoDateStr) {
  if (!isoDateStr) return '';
  const parts = isoDateStr.split('-');
  if (parts.length === 3) return parts[2] + '.' + parts[1] + '.' + parts[0];
  return isoDateStr;
}
