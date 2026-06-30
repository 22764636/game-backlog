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

const SHEET_NAME = 'Games';
const META_SHEET = 'Meta';
const PLAT_STORES_SHEET = 'PlatformStores';
const RATE_LOG_SHEET = 'RateLog';
const GAME_PRICES_SHEET = 'GamePrices';
const PRICE_HISTORY_SHEET = 'PriceHistory';

// ── Entry point ──────────────────────────────────────────────
function doGet(e) {
  const params = e.parameter;
  const action = params.action || '';
  const callback = params.callback || '';

  let result;
  try {
    switch (action) {
      case 'getAll':      result = getAll();      break;
      case 'getMeta':     result = getMeta();     break;
      case 'getPlatStores': result = getPlatStores(); break;
      case 'getRateLog':    result = getRateLog();      break;
      case 'getGamePrices': result = getGamePrices();   break;
      default:              result = { error: 'Unknown action: ' + action };
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
      case 'setRows':   result = setRows(JSON.parse(e.postData.contents));   break;
      case 'setAll':    result = setAll(JSON.parse(e.postData.contents));    break;
      case 'deleteRow': result = deleteRow(params.id);                       break;
      case 'upsertGamePrices':  result = upsertGamePrices(JSON.parse(e.postData.contents));  break;
      case 'appendPriceHistory': result = appendPriceHistory(JSON.parse(e.postData.contents)); break;
      case 'logFetch':  result = logFetch(JSON.parse(e.postData.contents));  break;
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

// ── Read platform → store mappings ──────────────────────────
function getPlatStores() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PLAT_STORES_SHEET);
  if (!sheet) return {};

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return {};

  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const platform = String(rows[i][0]).trim();
    const store    = String(rows[i][1]).trim();
    if (!platform || !store) continue;
    if (!result[platform]) result[platform] = [];
    result[platform].push(store);
  }
  return result;
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

// ── GG.deals rate-limit log: read entries from last hour ────
function getRateLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(RATE_LOG_SHEET);
  if (!sheet) return { entries: [] };
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { entries: [] };
  const oneHourAgo = Date.now() - 3600000;
  const entries = rows.slice(1)
    .filter(r => Number(r[0]) >= oneHourAgo)
    .map(r => ({ ts: Number(r[0]), count: Number(r[1]) }));
  return { entries };
}

// ── Read saved game prices ───────────────────────────────────────
function getGamePrices() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GAME_PRICES_SHEET);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

// ── GG.deals rate-limit log: append + prune rows older than 1h ──
function logFetch(entry) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RATE_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RATE_LOG_SHEET);
    sheet.appendRow(['ts', 'count']);
  }
  const rows = sheet.getDataRange().getValues();
  const oneHourAgo = Date.now() - 3600000;
  const keep = rows.slice(1).filter(r => Number(r[0]) >= oneHourAgo);
  keep.push([entry.ts, entry.count]);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([rows[0] || ['ts', 'count']]);
  if (keep.length) sheet.getRange(2, 1, keep.length, 2).setValues(keep);
  return { ok: true };
}

// ── Upsert GamePrices + compute personal lows ────────────────
function upsertGamePrices(entries) {
  if (!Array.isArray(entries) || !entries.length) return { ok: true, newLows: [] };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GAME_PRICES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(GAME_PRICES_SHEET);
    sheet.appendRow(['appid','title','last_retail','last_keyshop','personal_low_retail','personal_low_keyshop','last_fetched']);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const c = h => headers.indexOf(h);

  // Index existing rows by appid
  const idx = {};
  for (let i = 1; i < data.length; i++) idx[String(data[i][c('appid')])] = i;

  const newLows = [];
  const now = Date.now();

  entries.forEach(entry => {
    const retail  = parseFloat(entry.retail)  || 0;
    const keyshop = parseFloat(entry.keyshop) || 0;
    const key = String(entry.appid);

    if (key in idx) {
      const i = idx[key];
      const prevLowR = parseFloat(data[i][c('personal_low_retail')])  || Infinity;
      const prevLowK = parseFloat(data[i][c('personal_low_keyshop')]) || Infinity;
      data[i][c('title')]        = entry.title;
      data[i][c('last_retail')]  = retail  || '';
      data[i][c('last_keyshop')] = keyshop || '';
      data[i][c('last_fetched')] = now;
      if (retail  > 0 && retail  <= prevLowR) { data[i][c('personal_low_retail')]  = retail;  newLows.push(key); }
      if (keyshop > 0 && keyshop <= prevLowK)   data[i][c('personal_low_keyshop')] = keyshop;
    } else {
      const row = new Array(headers.length).fill('');
      row[c('appid')]                = entry.appid;
      row[c('title')]                = entry.title;
      row[c('last_retail')]          = retail  || '';
      row[c('last_keyshop')]         = keyshop || '';
      row[c('personal_low_retail')]  = retail  || '';
      row[c('personal_low_keyshop')] = keyshop || '';
      row[c('last_fetched')]         = now;
      idx[key] = data.length;
      data.push(row);
      if (retail > 0) newLows.push(key);
    }
  });

  // Write back entire range in one call (new rows already appended to data)
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);

  return { ok: true, newLows };
}

// ── Append rows to PriceHistory ──────────────────────────────
function appendPriceHistory(entries) {
  if (!Array.isArray(entries) || !entries.length) return { ok: true };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PRICE_HISTORY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PRICE_HISTORY_SHEET);
    sheet.appendRow(['id','appid','title','fetched_at','retail','keyshop','currency']);
  }
  const lastRow = sheet.getLastRow();
  const rows = entries.map((e, i) => [
    lastRow + i, e.appid, e.title, e.fetched_at, e.retail, e.keyshop, e.currency
  ]);
  sheet.getRange(lastRow + 1, 1, rows.length, 7).setValues(rows);
  return { ok: true };
}

// ── Helper: get or create sheet tab ─────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Seed the header row — columns match the game data model
    sheet.appendRow([
      'id','title','status','steamAppId','genres',
      'priority','hotness','releaseDate','price',
      'developer','publisher','cover','storeLink','type','parentAppId',
      'myRating','myReview','steamWishlist','added','removeNote','notes',
      'purchases','tags','shortDescription','delisted','skipGGFetch'
    ]);
  }
  return sheet;
}
