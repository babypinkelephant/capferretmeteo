/**
 * Flussschänke Zürich - Backend Google Apps Script (backend.gs)
 * Tabellenblatt: "Reservationen"
 *
 * Spalten-Aufbau (Zeile 1 Header):
 * A: Booking_ID
 * B: Datum
 * C: Haupt_Email
 * D: Gast_Vorname
 * E: Gast_Nachname
 * F: Gast_Email
 * G: Allergien_Praeferenzen
 * H: Status (Aktiv / Storniert / Anzahlung bezahlt)
 * I: Timestamp
 */

const SHEET_NAME = 'Reservationen';
const MAX_SEATS_PER_NIGHT = 30;
const OPEN_DATES = [
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14'
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
      'Booking_ID',
      'Datum',
      'Haupt_Email',
      'Gast_Vorname',
      'Gast_Nachname',
      'Gast_Email',
      'Allergien_Praeferenzen',
      'Status',
      'Timestamp'
    ]);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#EFEFEF');
  }
  return sheet;
}

// GET-APIs: Verfügbarkeiten und Reservationen abrufen
function doGet(e) {
  try {
    const action = e.parameter.action || 'getAvailability';
    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();

    if (action === 'getAvailability') {
      const availability = {};
      OPEN_DATES.forEach(date => {
        availability[date] = { booked: 0, available: MAX_SEATS_PER_NIGHT, total: MAX_SEATS_PER_NIGHT };
      });

      for (let i = 1; i < data.length; i++) {
        const date = String(data[i][1]).trim();
        const status = String(data[i][7]).trim();

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

      if (!email || !bookingId) {
        return outputJSON({ status: 'error', message: 'E-Mail und Booking-ID erforderlich.' });
      }

      const gaeste = [];
      let datum = '';
      let hauptEmail = '';

      for (let i = 1; i < data.length; i++) {
        const bId = String(data[i][0]).trim();
        const hEmail = String(data[i][2]).toLowerCase().trim();
        const status = String(data[i][7]).trim();

        if (bId === bookingId && hEmail === email && status !== 'Storniert') {
          datum = String(data[i][1]).trim();
          hauptEmail = String(data[i][2]).trim();
          gaeste.push({
            rowIndex: i + 1,
            vorname: String(data[i][3]),
            nachname: String(data[i][4]),
            email: String(data[i][5]),
            allergien: String(data[i][6])
          });
        }
      }

      if (gaeste.length === 0) {
        return outputJSON({ status: 'error', message: 'Keine aktive Reservation für diese Angaben gefunden.' });
      }

      return outputJSON({
        status: 'success',
        bookingId: bookingId,
        datum: datum,
        hauptEmail: hauptEmail,
        gaeste: gaeste
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
    // Lock mit Max 10 Sekunden Wartezeit gegen Race Conditions
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
      const gaeste = payload.gaeste || [];

      if (!OPEN_DATES.includes(datum)) {
        return outputJSON({ status: 'error', message: 'Ungültiges Veranstaltungsdatum.' });
      }
      if (!hauptEmail || gaeste.length === 0) {
        return outputJSON({ status: 'error', message: 'Unvollständige Angaben.' });
      }

      // Live-Prüfung der verbleibenden Plätze (Race Condition Prevention)
      const data = sheet.getDataRange().getValues();
      let gebuchtePlaetze = 0;
      for (let i = 1; i < data.length; i++) {
        const rowDate = String(data[i][1]).trim();
        const status = String(data[i][7]).trim();
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

      // Booking-ID generieren: RES-YYYYMMDD-4RandomDigits
      const cleanDate = datum.replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const bookingId = 'RES-' + cleanDate + '-' + randomSuffix;
      const timestamp = new Date().toISOString();

      // Pro Gast eine Zeile anfügen
      gaeste.forEach(gast => {
        sheet.appendRow([
          bookingId,
          datum,
          hauptEmail,
          gast.vorname || '',
          gast.nachname || '',
          gast.email || '',
          gast.allergien || 'Keine',
          'Aktiv',
          timestamp
        ]);
      });

      // Bestätigungs-E-Mail senden
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

      if (!bookingId || !hauptEmail || gaeste.length === 0) {
        return outputJSON({ status: 'error', message: 'Unvollständige Daten für das Update.' });
      }

      const data = sheet.getDataRange().getValues();
      let targetDatum = '';
      const existingRowIndices = [];

      for (let i = 1; i < data.length; i++) {
        const bId = String(data[i][0]).trim();
        const hEmail = String(data[i][2]).toLowerCase().trim();
        const status = String(data[i][7]).trim();

        if (bId === bookingId && hEmail === hauptEmail && status !== 'Storniert') {
          targetDatum = String(data[i][1]).trim();
          existingRowIndices.push(i + 1); // 1-based index
        }
      }

      if (existingRowIndices.length === 0) {
        return outputJSON({ status: 'error', message: 'Reservation konnte nicht gefunden werden.' });
      }

      // Falls Gästeanzahl erhöht wird, Kapazität prüfen!
      const neugeschaffenePlaetze = gaeste.length - existingRowIndices.length;
      if (neugeschaffenePlaetze > 0) {
        let gebuchtePlaetze = 0;
        for (let i = 1; i < data.length; i++) {
          const rowDate = String(data[i][1]).trim();
          const status = String(data[i][7]).trim();
          if (rowDate === targetDatum && status !== 'Storniert' && status !== '') {
            gebuchtePlaetze += 1;
          }
        }
        const verfuegbar = MAX_SEATS_PER_NIGHT - gebuchtePlaetze;
        if (neugeschaffenePlaetze > verfuegbar) {
          return outputJSON({
            status: 'error',
            code: 'FULL',
            message: 'Leider haben wir nicht genug Platz an deinem gewünschten Abend. Suche dir einen anderen Abend oder wende dich per Email an uns. reservation.flussschaenke@gmail.com'
          });
        }
      }

      // Alte Zeilen aktualisieren bzw. neue anfügen
      const timestamp = new Date().toISOString();

      for (let i = 0; i < gaeste.length; i++) {
        const gast = gaeste[i];
        if (i < existingRowIndices.length) {
          const row = existingRowIndices[i];
          sheet.getRange(row, 4).setValue(gast.vorname || '');
          sheet.getRange(row, 5).setValue(gast.nachname || '');
          sheet.getRange(row, 6).setValue(gast.email || '');
          sheet.getRange(row, 7).setValue(gast.allergien || 'Keine');
          sheet.getRange(row, 9).setValue(timestamp);
        } else {
          // Zusätzliche Plätze anfügen
          sheet.appendRow([
            bookingId,
            targetDatum,
            hauptEmail,
            gast.vorname || '',
            gast.nachname || '',
            gast.email || '',
            gast.allergien || 'Keine',
            'Aktiv',
            timestamp
          ]);
        }
      }

      // Wenn die neue Gästeliste kleiner ist als bisher, überzählige alte Zeilen auf Storniert setzen
      if (gaeste.length < existingRowIndices.length) {
        for (let i = gaeste.length; i < existingRowIndices.length; i++) {
          const row = existingRowIndices[i];
          sheet.getRange(row, 8).setValue('Storniert');
          sheet.getRange(row, 9).setValue(timestamp);
        }
      }

      // Aktualisierte Bestätigungs-E-Mail senden
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
    
    let gastListText = '';
    let gastListHtml = '';
    
    gaeste.forEach((g, idx) => {
      gastListText += `- Gast ${idx + 1}: ${g.vorname} ${g.nachname} (${g.allergien || 'Keine Präferenzen'})\n`;
      gastListHtml += `<li style="margin-bottom: 6px;"><strong>${g.vorname} ${g.nachname}</strong> – <em>Präferenzen/Allergien: ${g.allergien || 'Keine'}</em></li>`;
    });

    const bodyText = `Hoi!

Vielen Dank für deine Reservation für die Flussschänke Zürich!

DEINE RESERVATIONSDATEN:
- Booking-ID: ${bookingId}
- Datum: ${formattedDate}
- Uhrzeit: Eintreffen ab 18:00 Uhr, Beginn 1. Gang um 19:00 Uhr
- Anzahl Plätze: ${gaeste.length}

GEBUCHTE GÄSTE & ERNÄHRUNGSPRÄFERENZEN:
${gastListText}

LOCATION & ANREISE:
Flussschänke am Limmatufer, Zürich.

WICHTIGER HINWEIS:
Solltest du deine Angaben oder Ernährungspräferenzen zu einem späteren Zeitpunkt anpassen wollen, kannst du dies jederzeit auf unserer Website unter "Reservation verwalten" mit deiner Haupt-E-Mail-Adresse (${toEmail}) und deiner Booking-ID (${bookingId}) tun.

Wir freuen uns riesig auf einen genussvollen Herbstabend mit euch an der Limmat!

Herzliche Grüsse,
Dein Team der Flussschänke Zürich`;

    const bodyHtml = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2C2C2C; max-width: 600px; margin: 0 auto; border: 1px solid #E5D9CC; border-radius: 12px; padding: 24px; background-color: #FFFDF9;">
        <div style="text-align: center; padding-bottom: 16px; border-bottom: 2px solid #D96B27;">
          <h1 style="color: #B84A17; margin: 0; font-size: 26px;">Flussschänke Zürich</h1>
          <p style="color: #665243; margin-top: 4px; font-size: 14px;">Herbst-Pop-up an der Limmat</p>
        </div>

        <div style="padding: 20px 0;">
          <p style="font-size: 16px; line-height: 1.5;">Hoi!</p>
          <p style="font-size: 16px; line-height: 1.5;">Vielen Dank für deine Reservation! Wir haben deine Plätze verbindlich reserviert.</p>
          
          <div style="background-color: #F7EFE6; border-left: 4px solid #D96B27; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #B84A17;">Deine Buchungsübersicht</h3>
            <p style="margin: 4px 0;"><strong>Booking-ID:</strong> <span style="font-family: monospace; font-size: 16px; background: #FFF; padding: 2px 6px; border-radius: 4px;">${bookingId}</span></p>
            <p style="margin: 4px 0;"><strong>Datum:</strong> ${formattedDate}</p>
            <p style="margin: 4px 0;"><strong>Zeit:</strong> Eintreffen ab 18:00 Uhr | Start 1. Gang um 19:00 Uhr</p>
            <p style="margin: 4px 0;"><strong>Reservierte Plätze:</strong> ${gaeste.length}</p>
          </div>

          <h3 style="color: #B84A17; margin-top: 24px;">Gästeliste & Allergien</h3>
          <ul style="padding-left: 20px; line-height: 1.6;">
            ${gastListHtml}
          </ul>

          <div style="background-color: #FFF; border: 1px dashed #D96B27; padding: 14px; border-radius: 8px; margin-top: 24px;">
            <h4 style="margin: 0 0 6px 0; color: #B84A17;">Angaben nachträglich anpassen?</h4>
            <p style="margin: 0; font-size: 14px; color: #555;">
              Du kannst deine Reservation sowie die Allergien deiner Gäste jederzeit online auf <a href="https://pinkpenguin.ch/flussschaenke-reservation" style="color: #D96B27; font-weight: bold;">pinkpenguin.ch/flussschaenke-reservation</a> anpassen. Benutze dazu deine E-Mail-Adresse (<code>${toEmail}</code>) und deine Booking-ID (<code>${bookingId}</code>).
            </p>
          </div>
        </div>

        <div style="text-align: center; padding-top: 16px; border-top: 1px solid #E5D9CC; color: #887261; font-size: 13px;">
          <p style="margin: 0;">Flussschänke Zürich · Limmatufer · <a href="mailto:reservation.flussschaenke@gmail.com" style="color: #D96B27;">reservation.flussschaenke@gmail.com</a></p>
        </div>
      </div>
    `;

    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      body: bodyText,
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
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2C2C2C; max-width: 600px; margin: 0 auto; border: 1px solid #E5D9CC; border-radius: 12px; padding: 24px; background-color: #FFFDF9;">
        <div style="text-align: center; padding-bottom: 16px; border-bottom: 2px solid #D96B27;">
          <h1 style="color: #B84A17; margin: 0; font-size: 26px;">Flussschänke Zürich</h1>
          <p style="color: #665243; margin-top: 4px; font-size: 14px;">Reservation aktualisiert</p>
        </div>

        <div style="padding: 20px 0;">
          <p style="font-size: 16px;">Hoi!</p>
          <p style="font-size: 16px;">Deine Reservation mit der Booking-ID <strong>${bookingId}</strong> für den <strong>${formattedDate}</strong> wurde erfolgreich aktualisiert.</p>
          
          <h3 style="color: #B84A17; margin-top: 20px;">Aktualisierte Gästeliste</h3>
          <ul style="padding-left: 20px; line-height: 1.6;">
            ${gastListHtml}
          </ul>
        </div>

        <div style="text-align: center; padding-top: 16px; border-top: 1px solid #E5D9CC; color: #887261; font-size: 13px;">
          <p style="margin: 0;">Flussschänke Zürich · Limmatufer · <a href="mailto:reservation.flussschaenke@gmail.com" style="color: #D96B27;">reservation.flussschaenke@gmail.com</a></p>
        </div>
      </div>
    `;

    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      body: `Hoi! Deine Reservation (${bookingId}) für die Flussschänke Zürich wurde aktualisiert.`,
      htmlBody: bodyHtml
    });
  } catch (err) {
    Logger.log('E-Mail Update Fehler: ' + err.toString());
  }
}

function formatDateCH(isoDateStr) {
  if (!isoDateStr) return '';
  const parts = isoDateStr.split('-');
  if (parts.length === 3) {
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  return isoDateStr;
}
