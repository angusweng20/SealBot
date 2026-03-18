/**
 * ADMIN HELPERS
 *
 * These helpers are intended to be run manually from the Apps Script editor
 * while the hosted product is still in early-stage operation.
 */

function listManagedUsers(limit) {
  const result = Database.listManagedUsers(limit || 20);
  if (!result.success) {
    throw new Error('無法取得使用者列表：' + result.error);
  }

  if (!result.data || result.data.length === 0) {
    return '目前沒有使用者資料。';
  }

  return result.data.map((item, index) => {
    return [
      `${index + 1}. ${item.display_name || '(no name)'}`,
      `LINE User ID：${item.line_user_id}`,
      `Plan：${item.plan_code}`,
      `Status：${item.status}`,
      `Last Seen：${item.last_seen_at || ''}`
    ].join('\n');
  }).join('\n\n');
}

function listRecentExports(limit) {
  const result = Database.listExports(limit || 20);
  if (!result.success) {
    throw new Error('無法取得匯出紀錄：' + result.error);
  }

  if (!result.data || result.data.length === 0) {
    return '目前沒有匯出紀錄。';
  }

  return result.data.map((item, index) => {
    return [
      `${index + 1}. ${item.file_name || '(no file name)'}`,
      `LINE User ID：${item.line_user_id}`,
      `Format：${item.format}`,
      `Records：${item.record_count}`,
      `Status：${item.status}`,
      `Created At：${item.created_at}`
    ].join('\n');
  }).join('\n\n');
}

function getUsageSnapshot() {
  const usersResult = Database.listManagedUsers(200);
  const feedbacksResult = Database.listFeedbacks({ limit: 200 });
  const exportsResult = Database.listExports(200);

  if (!usersResult.success) {
    throw new Error('無法取得使用者資料：' + usersResult.error);
  }

  const users = usersResult.data || [];
  const feedbacks = feedbacksResult.success ? (feedbacksResult.data || []) : [];
  const exports = exportsResult.success ? (exportsResult.data || []) : [];

  const planCounts = users.reduce((acc, user) => {
    const key = (user.plan_code || 'LITE').toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const feedbackStatusCounts = feedbacks.reduce((acc, item) => {
    const key = item.status || 'new';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const exportFormatCounts = exports.reduce((acc, item) => {
    const key = item.format || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return [
    `Users: ${users.length}`,
    `Plan Counts: ${JSON.stringify(planCounts)}`,
    `Feedback Counts: ${JSON.stringify(feedbackStatusCounts)}`,
    `Export Counts: ${JSON.stringify(exportFormatCounts)}`
  ].join('\n');
}

function initializeCurrentDatabase() {
  const ok = Database.init();
  if (!ok) {
    throw new Error('資料庫初始化失敗');
  }
  return `資料庫初始化完成。Provider: ${CONFIG.DATABASE_PROVIDER}`;
}

function getRuntimeConfigSummary() {
  const capabilities = getAvailableCapabilities();
  const lines = [
    `DATABASE_PROVIDER: ${CONFIG.DATABASE_PROVIDER}`,
    `Capabilities: ${JSON.stringify(capabilities)}`
  ];

  if (capabilities.planLimits) {
    lines.push(`MANAGED_DEFAULT_PLAN: ${CONFIG.MANAGED_DEFAULT_PLAN}`);
    lines.push(`LITE_MAX_ACTIVE_REMINDERS: ${CONFIG.LITE_MAX_ACTIVE_REMINDERS}`);
    lines.push(`LITE_MAX_RUNS_PER_RECURRING_REMINDER: ${CONFIG.LITE_MAX_RUNS_PER_RECURRING_REMINDER}`);
  }

  if (isSheetsProvider()) {
    lines.push(`SHEET_ID: ${CONFIG.SHEET_ID || '(active spreadsheet)'}`);
  }

  return lines.join('\n');
}

function setupOpenSourceMode() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('DATABASE_PROVIDER', 'SHEETS');

  const ok = Database.init();
  if (!ok) {
    throw new Error('開源版初始化失敗');
  }

  setupTrigger();
  return [
    '已切換到 Google Sheets 開源模式。',
    '請確認以下設定：',
    '- CHANNEL_ACCESS_TOKEN 已設定',
    '- SHEET_ID 已設定，或目前有可用的試算表',
    '- Web App 已重新部署'
  ].join('\n');
}

function getOpenSourceSetupChecklist() {
  return [
    '1. 在 Script Properties 設定 DATABASE_PROVIDER=SHEETS',
    '2. 設定 CHANNEL_ACCESS_TOKEN',
    '3. 設定 SHEET_ID，或直接把專案綁在目標試算表',
    '4. 執行 initializeCurrentDatabase() 建立工作表',
    '5. 執行 setupTrigger() 建立每分鐘提醒檢查',
    '6. 重新部署 GAS Web App 並填回 LINE Webhook URL'
  ].join('\n');
}

function getOpenSourcePublishChecklist() {
  return [
    '1. 確認 DATABASE_PROVIDER=SHEETS',
    '2. 確認沒有留下 SUPABASE_SERVICE_ROLE_KEY',
    '3. 執行 initializeCurrentDatabase() 建立提醒事項工作表',
    '4. 執行 getOpenSourceHealthCheck()，確認 Reminder Sheet 與 Trigger 都是 OK',
    '5. 重新部署 GAS Web App',
    '6. 更新 README 中的 Webhook URL / 安裝步驟',
    '7. 用測試 LINE 帳號實測：要記得 / 查詢 / 完成 / 取消 / 延後'
  ].join('\n');
}

function getOpenSourceHealthCheck() {
  const triggers = ScriptApp.getProjectTriggers();
  const triggerReady = triggers.some(function(trigger) {
    return trigger.getHandlerFunction() === 'checkReminders';
  });

  const spreadsheet = CONFIG.SHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const reminderSheet = spreadsheet.getSheetByName('提醒事項');

  return [
    `DATABASE_PROVIDER: ${CONFIG.DATABASE_PROVIDER}`,
    `Spreadsheet: ${spreadsheet.getId()}`,
    `Reminder Sheet: ${reminderSheet ? 'OK' : 'MISSING'}`,
    `Trigger checkReminders: ${triggerReady ? 'OK' : 'MISSING'}`
  ].join('\n');
}
