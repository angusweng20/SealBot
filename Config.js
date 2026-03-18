/**
 * CONFIGURATION & CONSTANTS
 */

// 1. Environment Variables (Secret)
// Use PropertiesService.getScriptProperties().getProperty('KEY') to get these.
// If not found, fall back to these defaults (for dev/testing).
const DEFAULT_CHANNEL_ACCESS_TOKEN = ''; 
const DEFAULT_SHEET_ID = ''; 
const DEFAULT_SUPABASE_URL = '';
const DEFAULT_SUPABASE_SERVICE_ROLE_KEY = '';
const DEFAULT_OPENAI_API_KEY = '';
const DEFAULT_ANTHROPIC_API_KEY = '';

function getScriptProperty(key, contentDefault = '') {
  try {
    const val = PropertiesService.getScriptProperties().getProperty(key);
    return val ? val : contentDefault;
  } catch (e) {
    return contentDefault;
  }
}

function getNumberScriptProperty(key, defaultValue) {
  const raw = getScriptProperty(key, String(defaultValue));
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getSupabaseServiceRoleKey() {
  const value = getScriptProperty('SUPABASE_SERVICE_ROLE_KEY', DEFAULT_SUPABASE_SERVICE_ROLE_KEY);
  return value && value.indexOf('sb_publishable_') !== 0 ? value : '';
}

const CONFIG = {
  get CHANNEL_ACCESS_TOKEN() { return getScriptProperty('CHANNEL_ACCESS_TOKEN', DEFAULT_CHANNEL_ACCESS_TOKEN); },
  get SHEET_ID() { return getScriptProperty('SHEET_ID', DEFAULT_SHEET_ID); },
  get DATABASE_PROVIDER() { return getScriptProperty('DATABASE_PROVIDER', 'SUPABASE').toUpperCase(); },
  get SUPABASE_URL() { return getScriptProperty('SUPABASE_URL', DEFAULT_SUPABASE_URL); },
  get SUPABASE_SERVICE_ROLE_KEY() { return getSupabaseServiceRoleKey(); },
  get OPENAI_API_KEY() { return getScriptProperty('OPENAI_API_KEY', DEFAULT_OPENAI_API_KEY); },
  get ANTHROPIC_API_KEY() { return getScriptProperty('ANTHROPIC_API_KEY', DEFAULT_ANTHROPIC_API_KEY); },
  BOT_NAME: '記得',
  BOT_TONE: 'SERIOUS', // 'LIVELY' or 'SERIOUS'
  ADMIN_UIDS: [], // Optional: list of admin user IDs
  get MANAGED_DEFAULT_PLAN() { return getScriptProperty('MANAGED_DEFAULT_PLAN', 'LITE').toUpperCase(); },
  get LITE_MAX_ACTIVE_REMINDERS() { return getNumberScriptProperty('LITE_MAX_ACTIVE_REMINDERS', 20); },
  get LITE_MAX_RUNS_PER_RECURRING_REMINDER() { return getNumberScriptProperty('LITE_MAX_RUNS_PER_RECURRING_REMINDER', 30); },
  get EXPORT_FOLDER_ID() { return getScriptProperty('EXPORT_FOLDER_ID', ''); },

  get GITHUB_TOKEN() { return getScriptProperty('GITHUB_TOKEN', ''); },
  get GITHUB_OWNER() { return getScriptProperty('GITHUB_OWNER', 'angusweng20'); },
  get GITHUB_REPO() { return getScriptProperty('GITHUB_REPO', 'Crab-Notes-DB'); },
  get GITHUB_INBOX_PATH() { return getScriptProperty('GITHUB_INBOX_PATH', 'Inbox'); }
};

function getPlanLimits(planName) {
  const plan = (planName || CONFIG.MANAGED_DEFAULT_PLAN || 'LITE').toUpperCase();
  if (plan === 'PRO') {
    return {
      plan: 'PRO',
      maxActiveReminders: 0,
      maxRunsPerRecurringReminder: 0
    };
  }

  return {
    plan: 'LITE',
    maxActiveReminders: CONFIG.LITE_MAX_ACTIVE_REMINDERS,
    maxRunsPerRecurringReminder: CONFIG.LITE_MAX_RUNS_PER_RECURRING_REMINDER
  };
}

function isSheetsProvider() {
  return CONFIG.DATABASE_PROVIDER === 'SHEETS';
}

function isSupabaseProvider() {
  return CONFIG.DATABASE_PROVIDER === 'SUPABASE';
}

function getAvailableCapabilities() {
  if (isSheetsProvider()) {
    return {
      reminder: true,
      feedback: false,
      ideaCapture: false,
      exportRecords: false,
      managedPlans: false,
      planLimits: false
    };
  }

  return {
    reminder: true,
    feedback: true,
    ideaCapture: true,
    exportRecords: true,
    managedPlans: true,
    planLimits: true
  };
}

const FREQ_MAP = {
  '單次': 'ONCE',
  '每天': 'DAILY',
  '每週': 'WEEKLY',
  '每月': 'MONTHLY'
};

const FREQ_MAP_REVERSE = {
  'ONCE': '單次',
  'DAILY': '每天',
  'WEEKLY': '每週',
  'MONTHLY': '每月'
};

const SHEETS = {
  MEMBERS: '成員名單',
  REMINDERS: '提醒事項'
};
