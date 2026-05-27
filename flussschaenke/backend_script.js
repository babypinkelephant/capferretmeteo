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
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bestellungen');
      if (!sheet) throw new Error('Blatt Bestellungen nicht gefunden');
      
      const timestamp = new Date().toISOString();
      
      // Aufbau der Zeile: [Bestell_ID, Tisch_Nr, Name, Menge, Preis, Status, Zeitstempel]
      sheet.appendRow([
        data.bestellId,
        data.tischNr,
        data.name,
        data.menge,
        data.preis || '',
        data.status || 'Neu',
        timestamp
      ]);
      
      return outputJSON({ status: 'success' });
    }

    // 2. STATUS AKTUALISIEREN (z.B. Neu -> Serviert, oder Serviert -> Bezahlt)
    if (action === 'updateOrderStatus') {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bestellungen');
      const rowIdx = findRowIndexByOrderId(sheet, data.bestellId);
      
      if (rowIdx > -1) {
        // Spalte 6 = Status (A=1, B=2, C=3, D=4, E=5 Preis, F=6 Status)
        sheet.getRange(rowIdx, 6).setValue(data.neuerStatus);
        return outputJSON({ status: 'success' });
      } else {
        return outputJSON({ status: 'error', message: 'Bestellung nicht gefunden' });
      }
    }

    // 3. MENGE KORRIGIEREN (+ / - in der Kasse)
    if (action === 'updateOrderMenge') {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bestellungen');
      const rowIdx = findRowIndexByOrderId(sheet, data.bestellId);
      
      if (rowIdx > -1) {
        if (data.neueMenge === 0) {
          // Spalte 4 = Menge, Spalte 6 = Status
          sheet.getRange(rowIdx, 4).setValue(0);
          sheet.getRange(rowIdx, 6).setValue('Storniert');
        } else {
          sheet.getRange(rowIdx, 4).setValue(data.neueMenge);
        }
        return outputJSON({ status: 'success' });
      } else {
        return outputJSON({ status: 'error', message: 'Bestellung nicht gefunden' });
      }
    }

    // 4. TEILRECHNUNG (Bestellung splitten)
    if (action === 'splitOrder') {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bestellungen');
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
        const preis = rowData[headers.indexOf('Preis')] || '';
        const alteMenge = parseInt(rowData[headers.indexOf('Menge')]);
        
        const mengeZumBezahlen = parseInt(data.mengeZumBezahlen);
        const restMenge = alteMenge - mengeZumBezahlen;
        
        if (restMenge > 0) {
          // 1. Passe alte Zeile an (Restmenge)
          sheet.getRange(rowIdx, 4).setValue(restMenge);
          
          // 2. Füge neue Zeile ein für den bezahlten Teil
          const splitId = data.bestellId + "-S" + Math.floor(Math.random()*1000);
          sheet.appendRow([
            splitId,
            tischNr,
            name,
            mengeZumBezahlen,
            preis,
            'Bezahlt',
            new Date().toISOString()
          ]);
        } else {
          // Alles wird bezahlt
          sheet.getRange(rowIdx, 6).setValue('Bezahlt');
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
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
