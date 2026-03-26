/**
 * Google Apps Script for ECKCM Google Sheets Integration
 *
 * Setup:
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Replace the default code with this entire file
 * 3. Click Deploy → New Deployment → Web App
 * 4. Set "Execute as: Me" and "Who has access: Anyone"
 * 5. Copy the Web App URL and add as GOOGLE_APPS_SCRIPT_URL in your env
 *
 * This script handles 5 actions via POST requests:
 *   ensureSheets - Create missing sheet tabs and write headers
 *   sync         - Full sync: clear and rewrite all sheets
 *   incrementalSync - Append to some sheets, full replace others
 *   clear        - Clear all data (keep headers)
 *   status       - Return row counts per sheet
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var result;

    switch (action) {
      case "ensureSheets":
        result = handleEnsureSheets(body);
        break;
      case "sync":
        result = handleSync(body);
        break;
      case "incrementalSync":
        result = handleIncrementalSync(body);
        break;
      case "clear":
        result = handleClear(body);
        break;
      case "status":
        result = handleStatus(body);
        break;
      default:
        result = { error: "Unknown action: " + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Create missing sheet tabs and write header rows.
 * body.sheetNames: string[]
 * body.headers: { [sheetName]: string[] }
 */
function handleEnsureSheets(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = {};
  ss.getSheets().forEach(function (s) {
    existing[s.getName()] = true;
  });

  var sheetNames = body.sheetNames || [];
  var headers = body.headers || {};

  for (var i = 0; i < sheetNames.length; i++) {
    var name = sheetNames[i];
    var sheet;
    if (!existing[name]) {
      sheet = ss.insertSheet(name);
    } else {
      sheet = ss.getSheetByName(name);
    }
    // Write headers in row 1
    var headerRow = headers[name];
    if (headerRow && headerRow.length > 0) {
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
      // Bold the header row
      sheet.getRange(1, 1, 1, headerRow.length).setFontWeight("bold");
    }
  }

  return { success: true };
}

/**
 * Full sync: clear from row 2 and write all data for each sheet.
 * body.sheets: { [sheetName]: any[][] }
 */
function handleSync(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = body.sheets || {};
  var counts = {};

  for (var name in sheets) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) continue;

    var rows = sheets[name];
    counts[name] = rows.length;

    // Clear existing data (preserve header)
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
    }

    // Write new data
    if (rows.length > 0) {
      var numCols = rows[0].length;
      sheet.getRange(2, 1, rows.length, numCols).setValues(rows);
    }
  }

  return { success: true, counts: counts };
}

/**
 * Incremental sync: append row to some sheets, full replace others.
 * body.appendRow: any[] | null - single row to append
 * body.appendSheets: string[] - sheet names to append to
 * body.syncSheets: { [sheetName]: any[][] } - sheets to clear and rewrite
 */
function handleIncrementalSync(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Append row to specified sheets
  if (body.appendRow && body.appendSheets) {
    for (var i = 0; i < body.appendSheets.length; i++) {
      var sheet = ss.getSheetByName(body.appendSheets[i]);
      if (!sheet) continue;
      var nextRow = sheet.getLastRow() + 1;
      sheet.getRange(nextRow, 1, 1, body.appendRow.length).setValues([body.appendRow]);
    }
  }

  // Full replace for sync sheets
  var syncSheets = body.syncSheets || {};
  for (var name in syncSheets) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) continue;

    var rows = syncSheets[name];
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
    }
    if (rows.length > 0) {
      var numCols = rows[0].length;
      sheet.getRange(2, 1, rows.length, numCols).setValues(rows);
    }
  }

  return { success: true };
}

/**
 * Clear all data from specified sheets (keep headers).
 * body.sheetNames: string[]
 */
function handleClear(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = body.sheetNames || [];

  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = ss.getSheetByName(sheetNames[i]);
    if (!sheet) continue;

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
    }
  }

  return { success: true };
}

/**
 * Return row counts for each sheet (excluding header).
 * body.sheetNames: string[]
 */
function handleStatus(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = body.sheetNames || [];
  var result = {};

  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = ss.getSheetByName(sheetNames[i]);
    if (!sheet) {
      result[sheetNames[i]] = 0;
      continue;
    }
    var lastRow = sheet.getLastRow();
    result[sheetNames[i]] = Math.max(0, lastRow - 1);
  }

  return { success: true, sheets: result };
}
