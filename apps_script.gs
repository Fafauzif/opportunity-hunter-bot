/**
 * Opportunity Hunter Bot - Google Sheets Webhook
 * Version: 1.0.0
 *
 * Paste this entire file into the Apps Script project attached to:
 * "Opportunity Hunter Database"
 *
 * Main public endpoints:
 *   GET  /exec  -> service status
 *   POST /exec  -> authenticated JSON webhook
 *
 * Supported POST actions:
 *   health_check
 *   check_duplicates
 *   upsert_opportunities
 *   log_run
 */

const APP_VERSION = '1.0.0';
const DEFAULT_TIMEZONE = 'Asia/Jakarta';
const MAX_ITEMS_PER_REQUEST = 250;
const MAX_TEXT_LENGTH = 45000;

const SHEET_NAMES = Object.freeze({
  OPPORTUNITIES: 'Opportunities',
  REJECTED: 'Rejected',
  RUN_LOGS: 'Run Logs',
  SETTINGS: 'Settings'
});

const OPPORTUNITY_COLUMNS = Object.freeze([
  ['opportunity_id', 'Opportunity ID'],
  ['date_found', 'Date Found'],
  ['last_seen', 'Last Seen'],
  ['alert_level', 'Alert Level'],
  ['match_score', 'Match Score'],
  ['title', 'Title'],
  ['organizer', 'Organizer'],
  ['category', 'Category'],
  ['subcategory', 'Subcategory'],
  ['summary', 'What Is This Opportunity?'],
  ['why_relevant', 'Why It May Matter'],
  ['opportunity_type', 'Opportunity Type'],
  ['format', 'Format'],
  ['location', 'Location'],
  ['host_country', 'Host Country'],
  ['language', 'Language'],
  ['official_source_status', 'Official Source Status'],
  ['official_url', 'Official URL'],
  ['application_url', 'Application URL'],
  ['source_url', 'Source URL'],
  ['source_type', 'Source Type'],
  ['source_domain', 'Source Domain'],
  ['opening_date', 'Opening Date'],
  ['start_date', 'Start Date'],
  ['end_date', 'End Date'],
  ['deadline_raw', 'Deadline Raw'],
  ['deadline_date', 'Deadline Date'],
  ['deadline_timezone', 'Deadline Timezone'],
  ['days_remaining', 'Days Remaining'],
  ['deadline_status', 'Deadline Status'],
  ['eligibility_status', 'Eligibility Status'],
  ['undergraduate_eligible', 'Undergraduate Eligible'],
  ['indonesian_eligible', 'Indonesian Eligible'],
  ['age_requirement', 'Age Requirement'],
  ['education_requirement', 'Education Requirement'],
  ['experience_requirement', 'Experience Requirement'],
  ['nationality_requirement', 'Nationality Requirement'],
  ['team_format', 'Individual / Team'],
  ['team_size', 'Team Size'],
  ['application_requirements', 'Application Requirements'],
  ['application_fee_raw', 'Application Fee Raw'],
  ['application_fee_idr', 'Application Fee IDR'],
  ['registration_fee_raw', 'Registration Fee Raw'],
  ['registration_fee_idr', 'Registration Fee IDR'],
  ['estimated_personal_cost_idr', 'Estimated Personal Cost IDR'],
  ['funding_status', 'Funding Status'],
  ['funding_coverage', 'Funding Coverage'],
  ['prize_benefits', 'Prize / Benefits'],
  ['travel_covered', 'Travel Covered'],
  ['accommodation_covered', 'Accommodation Covered'],
  ['meals_covered', 'Meals Covered'],
  ['visa_covered', 'Visa Covered'],
  ['eligibility_evidence', 'Eligibility Evidence'],
  ['funding_evidence', 'Funding Evidence'],
  ['deadline_evidence', 'Deadline Evidence'],
  ['confidence', 'AI Confidence'],
  ['warning_flags', 'Warning Flags'],
  ['verification_status', 'Verification Status'],
  ['first_source_query', 'First Source Query'],
  ['run_id', 'Run ID'],
  ['application_status', 'Application Status'],
  ['personal_priority', 'Personal Priority'],
  ['applied_date', 'Applied Date'],
  ['personal_notes', 'Personal Notes'],
  ['last_bot_update', 'Last Bot Update']
]);

const REJECTED_COLUMNS = Object.freeze([
  ['opportunity_id', 'Opportunity ID'],
  ['date_found', 'Date Found'],
  ['last_seen', 'Last Seen'],
  ['title', 'Title'],
  ['organizer', 'Organizer'],
  ['category', 'Category'],
  ['source_url', 'Source URL'],
  ['official_url', 'Official URL'],
  ['deadline_date', 'Deadline Date'],
  ['rejection_reason', 'Rejection Reason'],
  ['rejection_evidence', 'Rejection Evidence'],
  ['warning_flags', 'Warning Flags'],
  ['run_id', 'Run ID'],
  ['last_bot_update', 'Last Bot Update']
]);

const RUN_LOG_COLUMNS = Object.freeze([
  ['run_id', 'Run ID'],
  ['started_at', 'Started At'],
  ['finished_at', 'Finished At'],
  ['status', 'Status'],
  ['searches_attempted', 'Searches Attempted'],
  ['searches_succeeded', 'Searches Succeeded'],
  ['candidates_found', 'Candidates Found'],
  ['candidates_deduplicated', 'Candidates Deduplicated'],
  ['pages_fetched', 'Pages Fetched'],
  ['gemini_calls', 'Gemini Calls'],
  ['opportunities_inserted', 'Opportunities Inserted'],
  ['opportunities_updated', 'Opportunities Updated'],
  ['rejected_logged', 'Rejected Logged'],
  ['telegram_alerts_sent', 'Telegram Alerts Sent'],
  ['errors', 'Errors'],
  ['estimated_exa_cost_usd', 'Estimated Exa Cost USD'],
  ['notes', 'Notes']
]);

const MANUAL_FIELDS = new Set([
  'application_status',
  'personal_priority',
  'applied_date',
  'personal_notes'
]);

/**
 * Adds a convenient menu whenever the spreadsheet opens.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Opportunity Hunter')
    .addItem('Run initial setup', 'setupOpportunityHunter')
    .addItem('Show setup status', 'showSetupStatus')
    .addItem('Show webhook secret', 'showWebhookSecret')
    .addSeparator()
    .addItem('Rotate webhook secret', 'rotateWebhookSecret')
    .addToUi();
}

/**
 * Run this ONCE manually from the Apps Script editor.
 * It creates the database tabs, stores the spreadsheet ID, sets the timezone,
 * and generates the shared webhook secret.
 */
function setupOpportunityHunter() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error(
      'No spreadsheet is attached. Open Apps Script from the Google Sheet using Extensions > Apps Script.'
    );
  }

  spreadsheet.setSpreadsheetTimeZone(DEFAULT_TIMEZONE);

  const properties = PropertiesService.getScriptProperties();
  properties.setProperties(
    {
      SPREADSHEET_ID: spreadsheet.getId(),
      TIMEZONE: DEFAULT_TIMEZONE,
      APP_VERSION: APP_VERSION
    },
    false
  );

  let secret = properties.getProperty('WEBHOOK_SECRET');
  if (!secret) {
    secret = generateSecret_();
    properties.setProperty('WEBHOOK_SECRET', secret);
  }

  initializeSheets_(spreadsheet);
  updateSettingsSheet_(spreadsheet);

  console.log('APPS_SCRIPT_WEBHOOK_SECRET=' + secret);

  SpreadsheetApp.getUi().alert(
    'Opportunity Hunter setup complete',
    'The required tabs were created.\n\n' +
      'Copy the secret below and save it in GitHub as:\n' +
      'APPS_SCRIPT_WEBHOOK_SECRET\n\n' +
      secret +
      '\n\nDo not share this value or include it in screenshots.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Displays non-sensitive configuration status.
 */
function showSetupStatus() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  const secretExists = Boolean(properties.getProperty('WEBHOOK_SECRET'));

  SpreadsheetApp.getUi().alert(
    'Opportunity Hunter status',
    [
      'Version: ' + APP_VERSION,
      'Spreadsheet connected: ' + (spreadsheetId ? 'Yes' : 'No'),
      'Webhook secret stored: ' + (secretExists ? 'Yes' : 'No'),
      'Timezone: ' + (properties.getProperty('TIMEZONE') || DEFAULT_TIMEZONE)
    ].join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Shows the existing webhook secret. Use only on your own account.
 */
function showWebhookSecret() {
  const secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!secret) {
    SpreadsheetApp.getUi().alert(
      'No webhook secret exists yet. Run "Run initial setup" first.'
    );
    return;
  }

  console.log('APPS_SCRIPT_WEBHOOK_SECRET=' + secret);
  SpreadsheetApp.getUi().alert(
    'Webhook secret',
    'Save this in GitHub as APPS_SCRIPT_WEBHOOK_SECRET:\n\n' +
      secret +
      '\n\nDo not share it or include it in screenshots.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Replaces the webhook secret.
 * IMPORTANT: update the APPS_SCRIPT_WEBHOOK_SECRET value in GitHub afterwards.
 */
function rotateWebhookSecret() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Rotate webhook secret?',
    'The existing GitHub secret will immediately stop working until you replace it.',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  const secret = generateSecret_();
  PropertiesService.getScriptProperties().setProperty('WEBHOOK_SECRET', secret);
  console.log('NEW_APPS_SCRIPT_WEBHOOK_SECRET=' + secret);

  ui.alert(
    'Webhook secret rotated',
    'Replace APPS_SCRIPT_WEBHOOK_SECRET in GitHub with:\n\n' +
      secret +
      '\n\nDo not share it or include it in screenshots.',
    ui.ButtonSet.OK
  );
}

/**
 * Public GET endpoint. It reveals no secret and writes nothing.
 * Open the deployed /exec URL in a browser to confirm the web app is online.
 */
function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'Opportunity Hunter Sheets Webhook',
    version: APP_VERSION,
    status: 'online',
    timezone: getTimezone_()
  });
}

/**
 * Authenticated POST endpoint used by the Python bot.
 */
function doPost(e) {
  let payload;

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Request body is empty.');
    }

    if (e.postData.contents.length > 1000000) {
      throw new Error('Request body is too large.');
    }

    payload = JSON.parse(e.postData.contents);
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: 'INVALID_REQUEST',
      message: String(error.message || error)
    });
  }

  if (!isAuthorized_(payload.secret)) {
    return jsonResponse_({
      ok: false,
      error: 'UNAUTHORIZED',
      message: 'The webhook secret is missing or incorrect.'
    });
  }

  try {
    switch (String(payload.action || '').trim()) {
      case 'health_check':
        return jsonResponse_({
          ok: true,
          service: 'Opportunity Hunter Sheets Webhook',
          version: APP_VERSION,
          spreadsheet_ready: Boolean(
            PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
          )
        });

      case 'check_duplicates':
        return jsonResponse_(checkDuplicates_(payload));

      case 'upsert_opportunities':
        return jsonResponse_(upsertOpportunities_(payload));

      case 'log_run':
        return jsonResponse_(logRun_(payload));

      default:
        return jsonResponse_({
          ok: false,
          error: 'UNKNOWN_ACTION',
          message:
            'Supported actions: health_check, check_duplicates, upsert_opportunities, log_run.'
        });
    }
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({
      ok: false,
      error: 'SERVER_ERROR',
      message: String(error.message || error)
    });
  }
}

/**
 * Checks candidates against both Opportunities and Rejected.
 *
 * Expected payload:
 * {
 *   "secret": "...",
 *   "action": "check_duplicates",
 *   "candidates": [
 *     {"opportunity_id": "...", "url": "..."}
 *   ]
 * }
 */
function checkDuplicates_(payload) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (candidates.length > MAX_ITEMS_PER_REQUEST) {
    throw new Error('Too many candidates. Maximum: ' + MAX_ITEMS_PER_REQUEST);
  }

  const spreadsheet = getSpreadsheet_();
  initializeSheets_(spreadsheet);

  const opportunityIndex = buildIndex_(
    spreadsheet.getSheetByName(SHEET_NAMES.OPPORTUNITIES),
    OPPORTUNITY_COLUMNS
  );
  const rejectedIndex = buildIndex_(
    spreadsheet.getSheetByName(SHEET_NAMES.REJECTED),
    REJECTED_COLUMNS
  );

  const results = candidates.map(function (candidate) {
    const id = cleanText_(candidate.opportunity_id, 256);
    const url = canonicalizeUrl_(
      candidate.url ||
        candidate.official_url ||
        candidate.application_url ||
        candidate.source_url ||
        ''
    );

    let match = null;

    if (id && opportunityIndex.ids[id]) {
      match = {
        exists: true,
        sheet: SHEET_NAMES.OPPORTUNITIES,
        row: opportunityIndex.ids[id]
      };
    } else if (id && rejectedIndex.ids[id]) {
      match = {
        exists: true,
        sheet: SHEET_NAMES.REJECTED,
        row: rejectedIndex.ids[id]
      };
    } else if (url && opportunityIndex.urls[url]) {
      match = {
        exists: true,
        sheet: SHEET_NAMES.OPPORTUNITIES,
        row: opportunityIndex.urls[url]
      };
    } else if (url && rejectedIndex.urls[url]) {
      match = {
        exists: true,
        sheet: SHEET_NAMES.REJECTED,
        row: rejectedIndex.urls[url]
      };
    }

    return {
      opportunity_id: id,
      canonical_url: url,
      exists: Boolean(match),
      sheet: match ? match.sheet : null,
      row: match ? match.row : null
    };
  });

  return {
    ok: true,
    checked: candidates.length,
    results: results
  };
}

/**
 * Inserts new records or updates existing records.
 *
 * All non-rejected items go to "Opportunities".
 * Items with alert_level="REJECTED" or record_status="REJECTED" go to "Rejected".
 *
 * Expected payload:
 * {
 *   "secret": "...",
 *   "action": "upsert_opportunities",
 *   "run_id": "...",
 *   "items": [...]
 * }
 */
function upsertOpportunities_(payload) {
  const items = Array.isArray(payload.items)
    ? payload.items
    : payload.item
      ? [payload.item]
      : [];

  if (items.length === 0) {
    return {
      ok: true,
      received: 0,
      inserted: 0,
      updated: 0,
      rejected_logged: 0,
      skipped: 0,
      errors: []
    };
  }

  if (items.length > MAX_ITEMS_PER_REQUEST) {
    throw new Error('Too many items. Maximum: ' + MAX_ITEMS_PER_REQUEST);
  }

  const spreadsheet = getSpreadsheet_();
  initializeSheets_(spreadsheet);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const opportunitiesSheet = spreadsheet.getSheetByName(SHEET_NAMES.OPPORTUNITIES);
    const rejectedSheet = spreadsheet.getSheetByName(SHEET_NAMES.REJECTED);

    let opportunityIndex = buildIndex_(opportunitiesSheet, OPPORTUNITY_COLUMNS);
    let rejectedIndex = buildIndex_(rejectedSheet, REJECTED_COLUMNS);

    const response = {
      ok: true,
      received: items.length,
      inserted: 0,
      updated: 0,
      rejected_logged: 0,
      skipped: 0,
      errors: []
    };

    items.forEach(function (originalItem, itemNumber) {
      try {
        const item = normalizeIncomingItem_(originalItem, payload.run_id);
        const isRejected =
          item.alert_level === 'REJECTED' || item.record_status === 'REJECTED';

        if (!item.title && !item.source_url && !item.official_url) {
          response.skipped += 1;
          response.errors.push({
            item: itemNumber,
            error: 'Missing title and URL.'
          });
          return;
        }

        item.opportunity_id =
          item.opportunity_id || buildOpportunityId_(item);

        if (isRejected) {
          const existingMainRow = findExistingRow_(item, opportunityIndex);

          // Do not create a rejected duplicate if the opportunity already exists
          // in the main database. The next normal upsert can update its status.
          if (existingMainRow) {
            response.skipped += 1;
            return;
          }

          const existingRejectedRow = findExistingRow_(item, rejectedIndex);
          if (existingRejectedRow) {
            updateRow_(
              rejectedSheet,
              REJECTED_COLUMNS,
              existingRejectedRow,
              item,
              false
            );
            response.updated += 1;
          } else {
            appendRow_(rejectedSheet, REJECTED_COLUMNS, item, false);
            response.rejected_logged += 1;
          }

          rejectedIndex = buildIndex_(rejectedSheet, REJECTED_COLUMNS);
          return;
        }

        const existingOpportunityRow = findExistingRow_(item, opportunityIndex);

        if (existingOpportunityRow) {
          updateRow_(
            opportunitiesSheet,
            OPPORTUNITY_COLUMNS,
            existingOpportunityRow,
            item,
            true
          );
          response.updated += 1;
        } else {
          appendRow_(opportunitiesSheet, OPPORTUNITY_COLUMNS, item, true);
          response.inserted += 1;
        }

        opportunityIndex = buildIndex_(opportunitiesSheet, OPPORTUNITY_COLUMNS);
      } catch (error) {
        response.skipped += 1;
        response.errors.push({
          item: itemNumber,
          title: cleanText_(originalItem && originalItem.title, 200),
          error: String(error.message || error)
        });
      }
    });

    return response;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Writes one run summary to "Run Logs".
 *
 * Expected payload:
 * {
 *   "secret": "...",
 *   "action": "log_run",
 *   "run": {...}
 * }
 */
function logRun_(payload) {
  const run = payload.run || payload;
  const spreadsheet = getSpreadsheet_();
  initializeSheets_(spreadsheet);

  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.RUN_LOGS);
  const normalized = {};

  RUN_LOG_COLUMNS.forEach(function (column) {
    normalized[column[0]] = run[column[0]];
  });

  normalized.run_id =
    normalized.run_id ||
    run.run_id ||
    Utilities.getUuid();

  normalized.finished_at =
    normalized.finished_at ||
    nowWib_();

  appendRow_(sheet, RUN_LOG_COLUMNS, normalized, false);

  return {
    ok: true,
    logged: true,
    run_id: normalized.run_id
  };
}

/**
 * Creates all required tabs and headers.
 */
function initializeSheets_(spreadsheet) {
  ensureSheet_(spreadsheet, SHEET_NAMES.OPPORTUNITIES, OPPORTUNITY_COLUMNS);
  ensureSheet_(spreadsheet, SHEET_NAMES.REJECTED, REJECTED_COLUMNS);
  ensureSheet_(spreadsheet, SHEET_NAMES.RUN_LOGS, RUN_LOG_COLUMNS);
  ensureSettingsSheet_(spreadsheet);
}

/**
 * Creates or upgrades a normal data sheet without deleting user data.
 */
function ensureSheet_(spreadsheet, sheetName, columns) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const requiredHeaders = columns.map(function (column) {
    return column[1];
  });

  const existingLastColumn = sheet.getLastColumn();
  let existingHeaders = [];

  if (existingLastColumn > 0) {
    existingHeaders = sheet
      .getRange(1, 1, 1, existingLastColumn)
      .getDisplayValues()[0]
      .map(function (value) {
        return String(value).trim();
      });
  }

  if (
    existingHeaders.length === 0 ||
    existingHeaders.every(function (value) {
      return !value;
    })
  ) {
    sheet
      .getRange(1, 1, 1, requiredHeaders.length)
      .setValues([requiredHeaders]);
    existingHeaders = requiredHeaders.slice();
  } else {
    const missingHeaders = requiredHeaders.filter(function (header) {
      return existingHeaders.indexOf(header) === -1;
    });

    if (missingHeaders.length > 0) {
      sheet
        .getRange(1, existingHeaders.length + 1, 1, missingHeaders.length)
        .setValues([missingHeaders]);
      existingHeaders = existingHeaders.concat(missingHeaders);
    }
  }

  formatDataSheet_(sheet, existingHeaders);
  return sheet;
}

/**
 * Creates the user-facing Settings tab. No secret is stored here.
 */
function ensureSettingsSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAMES.SETTINGS);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([
      ['Setting', 'Value', 'Explanation']
    ]);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 500);
}

/**
 * Refreshes safe, non-secret information in Settings.
 */
function updateSettingsSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.SETTINGS);
  const properties = PropertiesService.getScriptProperties();

  const rows = [
    ['Application version', APP_VERSION, 'Version of the Apps Script webhook.'],
    ['Spreadsheet ID stored', properties.getProperty('SPREADSHEET_ID') ? 'Yes' : 'No', 'Required for web-app access.'],
    ['Webhook secret stored', properties.getProperty('WEBHOOK_SECRET') ? 'Yes' : 'No', 'The actual secret is kept in Script Properties, not in this sheet.'],
    ['Timezone', getTimezone_(), 'Daily schedule and timestamps use Western Indonesia Time.'],
    ['Application fee guideline', 'Up to Rp300,000', 'Higher fees can still be stored but should carry a warning.'],
    ['Estimated personal cost guideline', 'Around Rp1,000,000', 'A flexible review threshold, not a hard database exclusion.'],
    ['Main database policy', 'Broad', 'Relevant opportunities are stored even when funding or eligibility needs review.'],
    ['Telegram policy', 'Moderate priority', 'Only stronger matches should trigger immediate alerts.'],
    ['Default application status', 'New', 'You may edit Application Status and Personal Notes manually.']
  ];

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
  }
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
}

/**
 * Applies simple readable formatting.
 */
function formatDataSheet_(sheet, headers) {
  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setWrap(true);

  headers.forEach(function (header, index) {
    const column = index + 1;
    let width = 140;

    if (
      [
        'Title',
        'Organizer',
        'Category',
        'Application Requirements',
        'Funding Coverage',
        'Prize / Benefits',
        'Warning Flags'
      ].indexOf(header) !== -1
    ) {
      width = 220;
    }

    if (
      [
        'What Is This Opportunity?',
        'Why It May Matter',
        'Eligibility Evidence',
        'Funding Evidence',
        'Deadline Evidence',
        'Personal Notes',
        'Rejection Evidence'
      ].indexOf(header) !== -1
    ) {
      width = 360;
    }

    if (
      [
        'Official URL',
        'Application URL',
        'Source URL'
      ].indexOf(header) !== -1
    ) {
      width = 280;
    }

    sheet.setColumnWidth(column, width);
  });
}

/**
 * Builds ID and URL lookup maps for fast duplicate checking.
 */
function buildIndex_(sheet, columns) {
  const index = {
    ids: Object.create(null),
    urls: Object.create(null)
  };

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return index;
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0];

  const headerIndex = headerIndexMap_(headers);
  const idColumn = headerIndex['Opportunity ID'];

  const urlHeaders = ['Official URL', 'Application URL', 'Source URL'];
  const values = sheet
    .getRange(2, 1, lastRow - 1, lastColumn)
    .getDisplayValues();

  values.forEach(function (row, offset) {
    const rowNumber = offset + 2;

    if (idColumn !== undefined) {
      const id = String(row[idColumn] || '').trim();
      if (id) {
        index.ids[id] = rowNumber;
      }
    }

    urlHeaders.forEach(function (header) {
      const columnIndex = headerIndex[header];
      if (columnIndex === undefined) {
        return;
      }

      const url = canonicalizeUrl_(row[columnIndex]);
      if (url) {
        index.urls[url] = rowNumber;
      }
    });
  });

  return index;
}

/**
 * Finds an existing row by opportunity ID or any known URL.
 */
function findExistingRow_(item, index) {
  if (item.opportunity_id && index.ids[item.opportunity_id]) {
    return index.ids[item.opportunity_id];
  }

  const urls = [
    item.official_url,
    item.application_url,
    item.source_url
  ];

  for (let i = 0; i < urls.length; i += 1) {
    const canonical = canonicalizeUrl_(urls[i]);
    if (canonical && index.urls[canonical]) {
      return index.urls[canonical];
    }
  }

  return null;
}

/**
 * Appends a new row using header names, so future column additions are safe.
 */
function appendRow_(sheet, columns, item, preserveManualFields) {
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0];

  const row = buildRow_(headers, columns, item, null, preserveManualFields);
  sheet.appendRow(row);
}

/**
 * Updates an existing row while preserving user-controlled fields.
 */
function updateRow_(
  sheet,
  columns,
  rowNumber,
  item,
  preserveManualFields
) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0];

  const existing = sheet
    .getRange(rowNumber, 1, 1, lastColumn)
    .getValues()[0];

  const row = buildRow_(
    headers,
    columns,
    item,
    existing,
    preserveManualFields
  );

  sheet.getRange(rowNumber, 1, 1, lastColumn).setValues([row]);
}

/**
 * Converts a JSON item into a spreadsheet row.
 */
function buildRow_(
  headers,
  columns,
  item,
  existingRow,
  preserveManualFields
) {
  const labelToKey = Object.create(null);
  columns.forEach(function (column) {
    labelToKey[column[1]] = column[0];
  });

  const now = nowWib_();

  if (!item.date_found) {
    item.date_found = now;
  }
  item.last_seen = now;
  item.last_bot_update = now;

  if (!item.application_status) {
    item.application_status = 'New';
  }

  return headers.map(function (header, index) {
    const key = labelToKey[header];

    if (!key) {
      return existingRow ? existingRow[index] : '';
    }

    if (
      preserveManualFields &&
      MANUAL_FIELDS.has(key) &&
      existingRow &&
      existingRow[index] !== ''
    ) {
      return existingRow[index];
    }

    if (
      key === 'date_found' &&
      existingRow &&
      existingRow[index] !== ''
    ) {
      return existingRow[index];
    }

    return safeCellValue_(item[key]);
  });
}

/**
 * Normalizes one incoming opportunity.
 */
function normalizeIncomingItem_(rawItem, defaultRunId) {
  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
    throw new Error('Each item must be a JSON object.');
  }

  const item = Object.assign({}, rawItem);

  item.alert_level = cleanText_(
    item.alert_level || item.notification_level || 'DATABASE_ONLY',
    50
  ).toUpperCase();

  item.record_status = cleanText_(
    item.record_status || '',
    50
  ).toUpperCase();

  item.run_id = cleanText_(item.run_id || defaultRunId || '', 256);

  item.title = cleanText_(item.title || item.opportunity_title || '', 500);
  item.organizer = cleanText_(item.organizer || '', 500);
  item.source_url = cleanUrl_(item.source_url || item.url || '');
  item.official_url = cleanUrl_(item.official_url || '');
  item.application_url = cleanUrl_(item.application_url || '');

  if (item.match_score !== undefined && item.match_score !== null && item.match_score !== '') {
    const score = Number(item.match_score);
    item.match_score = Number.isFinite(score)
      ? Math.max(0, Math.min(100, score))
      : '';
  }

  if (!item.source_domain) {
    item.source_domain = extractDomain_(
      item.official_url || item.source_url || item.application_url
    );
  }

  return item;
}

/**
 * Creates a stable fallback opportunity ID.
 */
function buildOpportunityId_(item) {
  const primaryUrl = canonicalizeUrl_(
    item.official_url || item.application_url || item.source_url
  );

  const identity = [
    primaryUrl,
    normalizeKey_(item.title),
    normalizeKey_(item.organizer),
    String(item.deadline_date || '').slice(0, 4)
  ].join('|');

  return sha256Hex_(identity).slice(0, 32);
}

/**
 * Returns the spreadsheet stored during setup.
 */
function getSpreadsheet_() {
  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error(
      'Spreadsheet is not configured. Run setupOpportunityHunter manually first.'
    );
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

/**
 * Verifies the shared secret without exposing it.
 */
function isAuthorized_(candidateSecret) {
  const expectedSecret = PropertiesService
    .getScriptProperties()
    .getProperty('WEBHOOK_SECRET');

  if (!expectedSecret || !candidateSecret) {
    return false;
  }

  return constantTimeEquals_(
    String(expectedSecret),
    String(candidateSecret)
  );
}

/**
 * Reduces timing differences when comparing secrets.
 */
function constantTimeEquals_(left, right) {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let i = 0; i < maxLength; i += 1) {
    const leftCode = i < left.length ? left.charCodeAt(i) : 0;
    const rightCode = i < right.length ? right.charCodeAt(i) : 0;
    difference |= leftCode ^ rightCode;
  }

  return difference === 0;
}

/**
 * Sanitizes values before writing them to Sheets.
 * It blocks spreadsheet formula injection from scraped webpage text.
 */
function safeCellValue_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '';
  }

  if (typeof value === 'boolean') {
    return value;
  }

  let text;

  if (Array.isArray(value)) {
    text = value
      .map(function (entry) {
        return typeof entry === 'object'
          ? JSON.stringify(entry)
          : String(entry);
      })
      .join(' | ');
  } else if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }

  text = text.trim().slice(0, MAX_TEXT_LENGTH);

  if (/^[=+\-@]/.test(text)) {
    return "'" + text;
  }

  return text;
}

/**
 * Restricts URLs to HTTP and HTTPS.
 */
function cleanUrl_(value) {
  const url = cleanText_(value, 5000);
  if (!url) {
    return '';
  }

  if (!/^https?:\/\//i.test(url)) {
    return '';
  }

  return url;
}

/**
 * Removes fragments and common tracking parameters for deduplication.
 */
function canonicalizeUrl_(value) {
  let url = cleanUrl_(value);
  if (!url) {
    return '';
  }

  url = url.split('#')[0];

  const parts = url.split('?');
  const base = parts[0].replace(/\/+$/, '').toLowerCase();

  if (parts.length === 1) {
    return base;
  }

  const trackingPattern = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|source$)/i;

  const keptParameters = parts
    .slice(1)
    .join('?')
    .split('&')
    .filter(Boolean)
    .filter(function (parameter) {
      const key = decodeURIComponent(parameter.split('=')[0] || '');
      return !trackingPattern.test(key);
    })
    .sort();

  return keptParameters.length
    ? base + '?' + keptParameters.join('&')
    : base;
}

/**
 * Extracts a readable domain without relying on browser-only APIs.
 */
function extractDomain_(url) {
  const cleaned = cleanUrl_(url);
  if (!cleaned) {
    return '';
  }

  const match = cleaned.match(/^https?:\/\/([^\/?#]+)/i);
  return match ? match[1].replace(/^www\./i, '').toLowerCase() : '';
}

/**
 * Cleans normal text.
 */
function cleanText_(value, maximumLength) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maximumLength || MAX_TEXT_LENGTH);
}

/**
 * Normalizes title and organizer text for fallback IDs.
 */
function normalizeKey_(value) {
  return cleanText_(value, 1000)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Returns a SHA-256 hexadecimal string.
 */
function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(function (byte) {
      const unsigned = byte < 0 ? byte + 256 : byte;
      return unsigned.toString(16).padStart(2, '0');
    })
    .join('');
}

/**
 * Generates a long random shared secret.
 */
function generateSecret_() {
  return sha256Hex_(
    Utilities.getUuid() +
      '|' +
      Utilities.getUuid() +
      '|' +
      new Date().getTime() +
      '|' +
      Math.random()
  );
}

/**
 * Makes a header-label to zero-based-column map.
 */
function headerIndexMap_(headers) {
  const map = Object.create(null);

  headers.forEach(function (header, index) {
    map[String(header).trim()] = index;
  });

  return map;
}

/**
 * Returns the configured timezone.
 */
function getTimezone_() {
  return (
    PropertiesService.getScriptProperties().getProperty('TIMEZONE') ||
    DEFAULT_TIMEZONE
  );
}

/**
 * Returns a stable WIB timestamp.
 */
function nowWib_() {
  return Utilities.formatDate(
    new Date(),
    getTimezone_(),
    'yyyy-MM-dd HH:mm:ss'
  );
}

/**
 * Returns JSON through Apps Script ContentService.
 */
function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
