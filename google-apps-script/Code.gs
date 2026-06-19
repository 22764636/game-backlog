// ============================================================
//  Building the Backlog — Google Apps Script backend
//
//  Setup:
//  1. Open your Google Sheet → Extensions → Apps Script
//  2. Paste this entire file, replacing any existing code
//  3. Deploy → New deployment → Web app
//       Execute as: Me
//       Who has access: Anyone
//  4. Copy the deployment URL and paste it into app.js as SHEET_URL
// ============================================================

const SHEET_NAME = 'Games';   // Name of the sheet tab that stores games
const META_SHEET = 'Meta';    // Optional: sheet tab for genre/tag metadata

// ── Entry point ──────────────────────────────────────────────
function doGet(e) {
  const params = e.parameter;
  const action = params.action || '';
  const callback = params.callback || '';

  let result;
  try {
    switch (action) {
      case 'getAll':  result = getAll();  break;
      case 'getMeta': result = getMeta(); break;
      default:        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  const json = JSON.stringify(result);
  const output = callback
    ? ContentService.createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT)
    : ContentService.createTextOutput(json)
        .setMimeType(ContentService.MimeType.JSON);

  return output;
}

function doPost(e) {
  const params = e.parameter;
  const action = params.action || '';

  let result;
  try {
    switch (action) {
      case 'setRows':  result = setRows(JSON.parse(e.postData.contents));  break;
      case 'setAll':   result = setAll(JSON.parse(e.postData.contents));   break;
      case 'deleteRow':result = deleteRow(params.id);                      break;
      default:         result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Read all games ───────────────────────────────────────────
function getAll() {
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const headers = rows[0].map(String);
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
    });
    return obj;
  });
}

// ── Read metadata (genres / tags) ────────────────────────────
function getMeta() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(META_SHEET);
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const tz = ss.getSpreadsheetTimeZone();
  const headers = rows[0].map(String);
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
    });
    return obj;
  });
}

// ── Serialise a record value to a sheet-safe scalar ─────────
function toCell(v) {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v) || (typeof v === 'object')) return JSON.stringify(v);
  return v;
}

// ── Write one or more rows (upsert by id) ────────────────────
function setRows(records) {
  if (!Array.isArray(records)) records = [records];
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(String);

  records.forEach(record => {
    const idCol = headers.indexOf('id');
    const existingRow = rows.findIndex((r, i) => i > 0 && String(r[idCol]) === String(record.id));

    const rowData = headers.map(h => toCell(record[h]));
    if (existingRow > 0) {
      sheet.getRange(existingRow + 1, 1, 1, headers.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  });

  return { ok: true };
}

// ── Overwrite the entire sheet ───────────────────────────────
function setAll(records) {
  const sheet = getSheet(SHEET_NAME);
  if (!Array.isArray(records) || records.length === 0) return { ok: true };

  // Preserve existing header row or build one from the first record
  const existing = sheet.getDataRange().getValues();
  let headers = existing.length > 0 ? existing[0].map(String) : Object.keys(records[0]);

  // Add any new fields from records not already in headers
  const headerSet = new Set(headers);
  records.forEach(r => Object.keys(r).forEach(k => {
    if (!headerSet.has(k)) { headers.push(k); headerSet.add(k); }
  }));

  const rows = [headers, ...records.map(r => headers.map(h => toCell(r[h])))];
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  return { ok: true };
}

// ── Delete a row by id ───────────────────────────────────────
function deleteRow(id) {
  if (!id) return { error: 'No id provided' };
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(String);
  const idCol = headers.indexOf('id');

  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { error: 'Row not found: ' + id };
}

// ── Helper: get or create sheet tab ─────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Seed the header row — columns match the game data model
    sheet.appendRow([
      'id','title','status','playStatus','steamAppId','genres','platforms',
      'priority','hotness','releaseDate','tbaText','price','cost','purchaseDate',
      'developer','publisher','cover','storeLink','store','type','parentAppId',
      'steamCollection','myRating','myReview','added','cancelled','notes',
      'purchases','tags','shortDescription'
    ]);
  }
  return sheet;
}
