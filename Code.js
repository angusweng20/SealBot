/**
 * MAIN ENTRY POINT
 */

function setup() {
  if (CONFIG.DATABASE_PROVIDER === 'SUPABASE') {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_ROLE_KEY) {
      Logger.log('尚未設定 Supabase 連線資訊，請先在 Script Properties 設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。');
      return;
    }

    const test = Database.init();
    if (!test) {
      Logger.log('Supabase 初始化失敗');
      return;
    }
    
    Logger.log('Supabase 連線成功！初始化完成');
  } else {
    Database.init();
    Logger.log('Google Sheets 資料庫初始化完成');
  }
  
  // Auto-setup Trigger
  setupTrigger();
}

/**
 * Setup Time-Driven Trigger for Reminders
 */
function setupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const triggerName = 'checkReminders';
  
  // Check if exists
  for (const t of triggers) {
    if (t.getHandlerFunction() === triggerName) {
      Logger.log('Trigger already exists.');
      return;
    }
  }
  
  // Create every 1 minute
  ScriptApp.newTrigger(triggerName)
    .timeBased()
    .everyMinutes(1)
    .create();
    
  Logger.log('已建立每分鐘檢查的觸發程序 (Trigger Created)');
}

function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const events = json.events;
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        handleMessage(event);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);
  } catch (ex) {
    Logger.log('doPost Error: ' + ex.message);
    console.error(ex);
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: ex.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Connection Test Function & LINE Webhook Verification
 */
function doGet(e) {
  // LINE webhook verification - return the challenge
  if (e && e.parameter && e.parameter.challenge) {
    return ContentService.createTextOutput(e.parameter.challenge)
      .setMimeType(ContentService.MimeType.PLAIN_TEXT);
  }
  return ContentService.createTextOutput(getPublicStatusText())
    .setMimeType(ContentService.MimeType.PLAIN_TEXT);
}

function getPublicStatusText() {
  const provider = CONFIG.DATABASE_PROVIDER;
  if (provider === 'SHEETS') {
    const spreadsheet = CONFIG.SHEET_ID
      ? SpreadsheetApp.openById(CONFIG.SHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    const reminderSheet = spreadsheet.getSheetByName('提醒事項');

    return [
      'Connection Success! The bot is accessible.',
      `Provider: ${provider}`,
      `Spreadsheet: ${spreadsheet.getId()}`,
      `Reminder Sheet: ${reminderSheet ? 'OK' : 'MISSING'}`
    ].join('\n');
  }

  return [
    'Connection Success! The bot is accessible.',
    `Provider: ${provider}`
  ].join('\n');
}

/**
 * Trigger Function (Run every minute)
 */
function checkReminders() {
  const result = Database.getDueReminders
    ? Database.getDueReminders()
    : { success: false, data: [] };
  
  if (!result.success || !result.data) {
    return;
  }
  
  const reminders = result.data;
  
  for (const row of reminders) {
    const scheduledTime = new Date(row.scheduled_at);
    const content = row.content;
    const targetId = row.line_user_id;
    const id = row.id;
    const freqCode = row.frequency;
    const currentRunCount = Number(row.run_count || 0);
    const maxRuns = row.max_runs ? Number(row.max_runs) : 0;
    const reachedRunLimit = maxRuns > 0 && currentRunCount + 1 >= maxRuns;
    
    if (targetId) {
      const timeStr = Utilities.formatDate(scheduledTime, "GMT+8", "HH:mm");
      const flex = createTriggerFlex(content, timeStr);
      
      pushMessage(targetId, [{ 
          type: 'flex', 
          altText: `🔔 提醒：${content}`, 
          contents: flex 
      }]);

      if (freqCode !== 'ONCE' && reachedRunLimit) {
        pushMessage(targetId, [{
          type: 'text',
          text: `提醒「${content}」已達目前方案的單一事件提醒上限，已自動停止。之後若要繼續，可以重新建立這則提醒。`
        }]);
      }
    }
    
    let nextDate = new Date(scheduledTime);
    if (freqCode === 'DAILY') nextDate.setDate(nextDate.getDate() + 1);
    else if (freqCode === 'WEEKLY') nextDate.setDate(nextDate.getDate() + 7);
    else if (freqCode === 'MONTHLY') nextDate.setMonth(nextDate.getMonth() + 1);
    
    Database.updateReminderAfterRun(id, freqCode, nextDate, currentRunCount, maxRuns);
  }
}
