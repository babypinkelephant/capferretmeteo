const SPREADSHEET_ID = '1BN3xy3e-gUxFNtLpPDRC8r1ZvG9t1hW0S_46W_2L5pE';
// Hilfsfunktion: Gibt JSON saubere Antworten inklusive CORS-Header zurück
function outputJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// GET-REQUESTS VERARBEITEN (Daten abrufen)
function doGet(e) {
  const action = e.parameter.action;
  
  try {
    if (action === 'getOrders') {
      let orders = getSheetData('Bestellungen');
      return outputJSON({ status: 'success', data: orders });
    }
    
    if (action === 'getReservations') {
      let reservations = getReservationsData();
      return outputJSON({ status: 'success', data: reservations });
    }
    
    return outputJSON({ status: 'error', message: 'Ungültige GET Action' });
  } catch (error) {
    return outputJSON({ status: 'error', message: error.toString() });
  }
}

// POST-REQUESTS VERARBEITEN (Daten schreiben)
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return outputJSON({ status: 'error', message: 'Keine Daten empfangen' });
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // Login (falls du das noch nutzt)
    if (action === 'login') {
      const users = getSheetData('Login');
      const user = users.find(u => u.Email === data.email && String(u.Passwort) === String(data.password));
      if (user) {
        return outputJSON({ status: 'success' });
      } else {
        return outputJSON({ status: 'error', message: 'Falsche Zugangsdaten' });
      }
    }

    // 1. NEUE BESTELLUNG HINZUFÜGEN
    if (action === 'addOrder') {
      const sheet = SpreadsheetApp.openById("1BN3xy3e-gUxFNtLpPDRC8r1ZvG9t1hW0S_46W_2L5pE").getSheetByName('Bestellungen');
      if (!sheet) throw new Error('Blatt Bestellungen nicht gefunden');
      
      const timestamp = new Date().toISOString();
      
      // Aufbau der Zeile: [Bestell_ID, Tisch_Nr, Name, Menge, Preis, Status, Zeitstempel, Zahlungsart]
      sheet.appendRow([
        data.bestellId,
        data.tischNr,
        data.name,
        data.menge,
        data.preis || '',
        data.status || 'Neu',
        timestamp,
        data.zahlungsart || ''
      ]);
      
      return outputJSON({ status: 'success' });
    }

    // 1b. MEHRERE BESTELLUNGEN AUF EINMAL HINZUFÜGEN (BATCH)
    if (action === 'addMultipleOrders') {
      const sheet = SpreadsheetApp.openById("1BN3xy3e-gUxFNtLpPDRC8r1ZvG9t1hW0S_46W_2L5pE").getSheetByName('Bestellungen');
      if (!sheet) throw new Error('Blatt Bestellungen nicht gefunden');
      
      const orders = data.orders || [];
      const timestamp = new Date().toISOString();
      
      const rows = orders.map(function(o) {
        return [
          o.bestellId,
          o.tischNr,
          o.name,
          o.menge,
          o.preis || '',
          o.status || 'Neu',
          timestamp,
          o.zahlungsart || ''
        ];
      });

      if (rows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      }
      
      return outputJSON({ status: 'success' });
    }

    // 2. STATUS AKTUALISIEREN (z.B. Neu -> Serviert, oder Serviert -> Bezahlt)
    if (action === 'updateOrderStatus') {
      const sheet = SpreadsheetApp.openById("1BN3xy3e-gUxFNtLpPDRC8r1ZvG9t1hW0S_46W_2L5pE").getSheetByName('Bestellungen');
      const rowIdx = findRowIndexByOrderId(sheet, data.bestellId);
      
      if (rowIdx > -1) {
        // Spalte 6 = Status (A=1, B=2, C=3, D=4, E=5 Preis, F=6 Status, G=7 Zeitstempel, H=8 Zahlungsart)
        sheet.getRange(rowIdx, 6).setValue(data.neuerStatus);
        if (data.zahlungsart) {
          sheet.getRange(rowIdx, 8).setValue(data.zahlungsart);
        }
        return outputJSON({ status: 'success' });
      } else {
        return outputJSON({ status: 'error', message: 'Bestellung nicht gefunden' });
      }
    }

    // 2b. MEHRERE STATUS AKTUALISIEREN / CHECKOUT (BATCH)
    if (action === 'updateMultipleOrderStatuses') {
      const sheet = SpreadsheetApp.openById("1BN3xy3e-gUxFNtLpPDRC8r1ZvG9t1hW0S_46W_2L5pE").getSheetByName('Bestellungen');
      if (!sheet) throw new Error('Blatt Bestellungen nicht gefunden');

      const updates = data.updates || []; // [{ bestellId, neuerStatus, zahlungsart, splitMenge, addTip: { tischNr, preis } }]
      const dataRange = sheet.getDataRange().getValues();
      const headers = dataRange[0];
      const idIndex = headers.indexOf('Bestell_ID');

      // Map für schnellen Zeilen-Lookup
      const rowMap = {};
      for (let i = 1; i < dataRange.length; i++) {
        rowMap[dataRange[i][idIndex]] = { rowIdx: i + 1, rowData: dataRange[i] };
      }

      const rowsToAdd = [];

      updates.forEach(function(u) {
        const item = rowMap[u.bestellId];
        if (item) {
          const rowIdx = item.rowIdx;
          const rowData = item.rowData;

          if (u.splitMenge && parseInt(u.splitMenge) > 0) {
            // Split Logik
            const alterGesamtPreis = parseFloat(rowData[headers.indexOf('Preis')]) || 0;
            const alteMenge = parseInt(rowData[headers.indexOf('Menge')]) || 1;
            const unitPrice = alterGesamtPreis / alteMenge;
            const mengeZumBezahlen = parseInt(u.splitMenge);
            const restMenge = alteMenge - mengeZumBezahlen;
            const zahlungsart = u.zahlungsart || '';

            if (restMenge > 0) {
              sheet.getRange(rowIdx, 4).setValue(restMenge);
              sheet.getRange(rowIdx, 5).setValue(restMenge * unitPrice);

              const splitId = u.bestellId + "-S" + Math.floor(Math.random()*1000);
              rowsToAdd.push([
                splitId,
                rowData[headers.indexOf('Tisch_Nr')],
                rowData[headers.indexOf('Name')],
                mengeZumBezahlen,
                mengeZumBezahlen * unitPrice,
                u.neuerStatus || 'Bezahlt',
                new Date().toISOString(),
                zahlungsart
              ]);
            } else {
              sheet.getRange(rowIdx, 6).setValue(u.neuerStatus || 'Bezahlt');
              if (zahlungsart) sheet.getRange(rowIdx, 8).setValue(zahlungsart);
            }
          } else {
            // Normaler Status Update
            if (u.neuerStatus) sheet.getRange(rowIdx, 6).setValue(u.neuerStatus);
            if (u.zahlungsart) sheet.getRange(rowIdx, 8).setValue(u.zahlungsart);
          }
        }
      });

      // Falls Trinkgeld dabei ist
      if (data.tip && data.tip.preis > 0) {
        const timestampStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const r = Math.floor(Math.random() * 1000);
        rowsToAdd.push([
          `ORD-${timestampStr}-${r}-TIP`,
          data.tip.tischNr,
          'Trinkgeld',
          1,
          data.tip.preis,
          'Bezahlt',
          new Date().toISOString(),
          data.tip.zahlungsart || ''
        ]);
      }

      if (rowsToAdd.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
      }

      return outputJSON({ status: 'success' });
    }

    // 3. MENGE KORRIGIEREN (+ / - in der Kasse)
    if (action === 'updateOrderMenge') {
      const sheet = SpreadsheetApp.openById("1BN3xy3e-gUxFNtLpPDRC8r1ZvG9t1hW0S_46W_2L5pE").getSheetByName('Bestellungen');
      const rowIdx = findRowIndexByOrderId(sheet, data.bestellId);
      
      if (rowIdx > -1) {
        if (data.neueMenge === 0) {
          // Spalte 4 = Menge, Spalte 5 = Preis, Spalte 6 = Status
          sheet.getRange(rowIdx, 4).setValue(0);
          sheet.getRange(rowIdx, 5).setValue(0);
          sheet.getRange(rowIdx, 6).setValue('Storniert');
        } else {
          // Alten Preis und Menge auslesen, um den Stückpreis zu berechnen
          const alteMenge = parseInt(sheet.getRange(rowIdx, 4).getValue()) || 1;
          const alterPreis = parseFloat(sheet.getRange(rowIdx, 5).getValue()) || 0;
          const unitPrice = alterPreis / alteMenge;
          
          sheet.getRange(rowIdx, 4).setValue(data.neueMenge);
          sheet.getRange(rowIdx, 5).setValue(data.neueMenge * unitPrice);
        }
        return outputJSON({ status: 'success' });
      } else {
        return outputJSON({ status: 'error', message: 'Bestellung nicht gefunden' });
      }
    }

    // 4. TEILRECHNUNG (Bestellung splitten)
    if (action === 'splitOrder') {
      const sheet = SpreadsheetApp.openById("1BN3xy3e-gUxFNtLpPDRC8r1ZvG9t1hW0S_46W_2L5pE").getSheetByName('Bestellungen');
      const dataRange = sheet.getDataRange().getValues();
      const headers = dataRange[0];
      const idIndex = headers.indexOf('Bestell_ID');
      
      let rowIdx = -1;
      let rowData = null;
      for (let i = 1; i < dataRange.length; i++) {
        if (dataRange[i][idIndex] === data.bestellId) {
          rowIdx = i + 1; // 1-basiert
          rowData = dataRange[i];
          break;
        }
      }
      
      if (rowIdx > -1) {
        const tischNr = rowData[headers.indexOf('Tisch_Nr')];
        const name = rowData[headers.indexOf('Name')];
        const alterGesamtPreis = parseFloat(rowData[headers.indexOf('Preis')]) || 0;
        const alteMenge = parseInt(rowData[headers.indexOf('Menge')]) || 1;
        const unitPrice = alterGesamtPreis / alteMenge;
        
        const mengeZumBezahlen = parseInt(data.mengeZumBezahlen);
        const restMenge = alteMenge - mengeZumBezahlen;
        const zahlungsart = data.zahlungsart || '';
        
        if (restMenge > 0) {
          // 1. Passe alte Zeile an (Restmenge und Restpreis)
          sheet.getRange(rowIdx, 4).setValue(restMenge);
          sheet.getRange(rowIdx, 5).setValue(restMenge * unitPrice);
          
          // 2. Füge neue Zeile ein für den bezahlten Teil (mit anteiligem Preis & Zahlungsart)
          const splitId = data.bestellId + "-S" + Math.floor(Math.random()*1000);
          sheet.appendRow([
            splitId,
            tischNr,
            name,
            mengeZumBezahlen,
            mengeZumBezahlen * unitPrice,
            'Bezahlt',
            new Date().toISOString(),
            zahlungsart
          ]);
        } else {
          // Alles wird bezahlt
          sheet.getRange(rowIdx, 6).setValue('Bezahlt');
          if (zahlungsart) {
            sheet.getRange(rowIdx, 8).setValue(zahlungsart);
          }
        }
        return outputJSON({ status: 'success' });
      } else {
        return outputJSON({ status: 'error', message: 'Bestellung nicht gefunden' });
      }
    }

    return outputJSON({ status: 'error', message: 'Ungültige POST Action' });

  } catch (error) {
    return outputJSON({ status: 'error', message: error.toString() });
  }
}

// Hilfsfunktion: Sucht die Zeilennummer einer Bestellung
function findRowIndexByOrderId(sheet, orderId) {
  const data = sheet.getDataRange().getValues();
  // Annahme: Spalte A (Index 0) ist Bestell_ID
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === orderId) {
      return i + 1; // Sheets sind 1-basiert
    }
  }
  return -1;
}

// Hilfsfunktion: Liest ein Blatt als Array von Objekten aus
function getSheetData(sheetName) {
  const sheet = SpreadsheetApp.openById("1BN3xy3e-gUxFNtLpPDRC8r1ZvG9t1hW0S_46W_2L5pE").getSheetByName(sheetName);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Nur Header oder leer
  
  const headers = data[0];
  const result = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    result.push(obj);
  }
  
  return result;
}

// Hilfsfunktion: Liest Reservationen aus "Reservationen Overview" strukturiert aus
function getReservationsData() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Reservationen Overview');
  if (!sheet) return {};
  
  // WICHTIG: getDisplayValues() holt den exakten Text (Strings) aus den Zellen, nicht die rohen Date-Objekte
  const data = sheet.getDataRange().getDisplayValues();
  const result = {};
  
  const dateRegex = /\d{1,2}\.\d{1,2}\.\d{4}/;
  
  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < data[row].length; col += 4) { // Blöcke sind alle 4 Spalten
      const cellValue = data[row][col];
      if (cellValue && typeof cellValue === 'string') {
        const match = cellValue.match(dateRegex);
        if (match && cellValue.includes(",")) {
          const dateKey = match[0];
          const tables = [];
          
          for (let r = row + 2; r < data.length; r++) {
            const name = data[r][col];
            
            if (name && typeof name === 'string' && name.match(dateRegex) && name.includes(",")) {
              break;
            }
            
            if (name === '' || name === null || name === undefined) continue;
            if (String(name).includes("Keine Reservationen")) continue;
            
            const plaetze = data[r][col + 1];
            tables.push({
              Name: String(name),
              Plätze: parseInt(plaetze) || 0
            });
          }
          result[dateKey] = tables;
        }
      }
    }
  }
  return result;
}
