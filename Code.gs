/**
 * Latschding – Google Apps Script Backend
 *
 * Einrichtung:
 * 1. Google Sheet erstellen (z. B. "Latschding") – oder ein bestehendes leeres nutzen
 * 2. Erweiterungen → Apps Script → diesen Code komplett einfügen
 * 3. TOKEN unten ändern (beliebige geheime Zeichenkette)
 * 4. Bereitstellen → Neue Bereitstellung → Typ "Web-App"
 *    - Ausführen als: Ich
 *    - Zugriff: Jeder
 * 5. Web-App-URL kopieren und zusammen mit dem Token in der App
 *    unter "Einstellungen" eintragen.
 *
 * WICHTIG: Nach Code-Änderungen immer "Bereitstellen → Bereitstellungen
 * verwalten → Bearbeiten → Neue Version" wählen, sonst läuft der alte Code.
 */

var TOKEN = 'HIER-EIGENES-GEHEIMES-TOKEN-EINTRAGEN';

var SHEET_TOUREN = 'Touren';
var SHEET_ZIELE = 'Ziele';

function doGet(e) {
  try {
    if (!e.parameter || e.parameter.token !== TOKEN) {
      return json({ ok: false, error: 'Ungültiges Token' });
    }
    ensureSetup();
    return json({ ok: true, data: getAll() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) {
      return json({ ok: false, error: 'Ungültiges Token' });
    }
    ensureSetup();
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    var extra = null;
    try {
      switch (body.action) {
        case 'addTour':     addTour(body.tour); break;
        case 'updateTour':  updateTour(body.id, body.tour); break;
        case 'deleteTour':  deleteTour(body.id); break;
        case 'importTours': extra = importTours(body.tours); break;
        case 'saveGoal':    saveGoal(body); break;
        default: return json({ ok: false, error: 'Unbekannte Aktion: ' + body.action });
      }
    } finally {
      lock.releaseLock();
    }
    return json({ ok: true, data: getAll(), extra: extra });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------- Aktionen ----------

/** tour: { datum:'YYYY-MM-DD', art, tour, km, hm, gehzeit, gesamtzeit, notiz } (Zeiten in Minuten) */
function addTour(t) {
  validateTour(t);
  var id = String(new Date().getTime()) + Math.floor(Math.random() * 1000);
  sheet(SHEET_TOUREN).appendRow(tourRow(id, t));
  return id;
}

function updateTour(id, t) {
  validateTour(t);
  var sh = sheet(SHEET_TOUREN);
  var row = findTourRow(sh, id);
  if (!row) throw new Error('Tour nicht gefunden');
  sh.getRange(row, 1, 1, 9).setValues([tourRow(id, t)]);
}

function deleteTour(id) {
  var sh = sheet(SHEET_TOUREN);
  var row = findTourRow(sh, id);
  if (!row) throw new Error('Tour nicht gefunden');
  sh.deleteRow(row);
}

/** tours: Array wie bei addTour. Überspringt Duplikate (Datum+Art+Tour+Km). */
function importTours(tours) {
  if (!tours || !tours.length) return { imported: 0, skipped: 0 };
  var sh = sheet(SHEET_TOUREN);
  var existing = {};
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    existing[dupKeyRaw(rows[i][1], rows[i][2], rows[i][3], rows[i][4])] = true;
  }
  var toAppend = [];
  var skipped = 0;
  tours.forEach(function (t) {
    validateTour(t);
    var key = dupKeyRaw(t.datum, t.art, t.tour, t.km);
    if (existing[key]) { skipped++; return; }
    existing[key] = true;
    var id = String(new Date().getTime()) + Math.floor(Math.random() * 100000);
    toAppend.push(tourRow(id, t));
  });
  if (toAppend.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, 9).setValues(toAppend);
  }
  return { imported: toAppend.length, skipped: skipped };
}

/** body: { jahr, art, ziel } – ziel in km */
function saveGoal(b) {
  var jahr = Number(b.jahr), ziel = Number(b.ziel);
  if (!jahr || jahr < 2000 || jahr > 2100) throw new Error('Ungültiges Jahr');
  var sh = sheet(SHEET_ZIELE);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (Number(rows[i][0]) === jahr && String(rows[i][1]) === String(b.art)) {
      sh.getRange(i + 1, 3).setValue(ziel);
      return;
    }
  }
  sh.appendRow([jahr, String(b.art), ziel]);
}

// ---------- Daten lesen ----------

function getAll() {
  var tz = Session.getScriptTimeZone();
  var tours = sheet(SHEET_TOUREN).getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0] !== '' && r[1] !== ''; })
    .map(function (r) {
      return {
        id: String(r[0]),
        datum: r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') : String(r[1]),
        art: String(r[2]),
        tour: String(r[3]),
        km: Number(r[4]) || 0,
        hm: Number(r[5]) || 0,
        gehzeit: Number(r[6]) || 0,
        gesamtzeit: Number(r[7]) || 0,
        notiz: r[8] === null || r[8] === undefined ? '' : String(r[8])
      };
    });

  var goals = sheet(SHEET_ZIELE).getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0] !== ''; })
    .map(function (r) {
      return { jahr: Number(r[0]), art: String(r[1]), ziel: Number(r[2]) || 0 };
    });

  return { tours: tours, goals: goals };
}

// ---------- Hilfsfunktionen ----------

function validateTour(t) {
  if (!t) throw new Error('Tour fehlt');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(t.datum))) throw new Error('Ungültiges Datum: ' + t.datum);
  if (['Wandern', 'Radeln'].indexOf(String(t.art)) === -1) throw new Error('Art muss Wandern oder Radeln sein');
  if (!String(t.tour || '').trim()) throw new Error('Tourname fehlt');
}

function tourRow(id, t) {
  return [id, String(t.datum), String(t.art), String(t.tour).trim(),
          Number(t.km) || 0, Number(t.hm) || 0, Number(t.gehzeit) || 0,
          Number(t.gesamtzeit) || 0, String(t.notiz || '')];
}

function findTourRow(sh, id) {
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) return i + 1;
  }
  return 0;
}

function dupKeyRaw(datum, art, tour, km) {
  var d = datum instanceof Date
    ? Utilities.formatDate(datum, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    : String(datum);
  return d + '|' + String(art) + '|' + String(tour).trim().toLowerCase() + '|' + (Math.round(Number(km) * 100) / 100);
}

function ensureSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var tsh = ss.getSheetByName(SHEET_TOUREN);
  if (!tsh) {
    tsh = ss.insertSheet(SHEET_TOUREN);
    tsh.appendRow(['ID', 'Datum', 'Art', 'Tour', 'Km', 'HM', 'GehzeitMin', 'GesamtzeitMin', 'Notiz']);
    tsh.setFrozenRows(1);
    // Datum als Text halten, damit 'YYYY-MM-DD' nicht umformatiert wird
    tsh.getRange('B:B').setNumberFormat('@');
    tsh.getRange('A:A').setNumberFormat('@');
  }

  var zsh = ss.getSheetByName(SHEET_ZIELE);
  if (!zsh) {
    zsh = ss.insertSheet(SHEET_ZIELE);
    zsh.appendRow(['Jahr', 'Art', 'ZielKm']);
    zsh.setFrozenRows(1);
  }
  if (zsh.getLastRow() <= 1) {
    var jahr = new Date().getFullYear();
    zsh.appendRow([jahr, 'Wandern', 1000]);
    zsh.appendRow([jahr, 'Radeln', 2000]);
  }
}

function sheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
