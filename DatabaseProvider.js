/**
 * DATABASE PROVIDERS
 *
 * `SUPABASE` is the hosted default.
 * `SHEETS` is the self-hosted OSS path.
 */

const SHEET_COLUMNS = {
  REMINDERS: [
    'id',
    'line_user_id',
    'creator_line_user_id',
    'content',
    'category',
    'scheduled_at',
    'frequency',
    'run_count',
    'max_runs',
    'plan_code',
    'status',
    'created_at',
    'updated_at'
  ],
  USERS: [
    'id',
    'line_user_id',
    'display_name',
    'plan_code',
    'status',
    'created_at',
    'updated_at',
    'last_seen_at'
  ],
  IDEAS: [
    'id',
    'line_user_id',
    'content',
    'category',
    'source',
    'created_at'
  ],
  FEEDBACKS: [
    'id',
    'line_user_id',
    'target_id',
    'source_type',
    'message',
    'status',
    'admin_reply',
    'created_at',
    'replied_at',
    'updated_at'
  ],
  EXPORTS: [
    'id',
    'line_user_id',
    'format',
    'record_count',
    'file_name',
    'file_url',
    'status',
    'created_at'
  ]
};

const SHEETS_PROVIDER_NAMES = {
  REMINDERS: '提醒事項',
  USERS: '使用者',
  IDEAS: '記錄內容',
  FEEDBACKS: '反饋',
  EXPORTS: '匯出紀錄'
};

const SheetsDatabase = {
  init: function() {
    this.ensureSchema();
    return true;
  },

  ensureSchema: function() {
    this.ensureSheet(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS);

    if (!isSheetsProvider()) {
      this.ensureSheet(SHEETS_PROVIDER_NAMES.USERS, SHEET_COLUMNS.USERS);
      this.ensureSheet(SHEETS_PROVIDER_NAMES.IDEAS, SHEET_COLUMNS.IDEAS);
      this.ensureSheet(SHEETS_PROVIDER_NAMES.FEEDBACKS, SHEET_COLUMNS.FEEDBACKS);
      this.ensureSheet(SHEETS_PROVIDER_NAMES.EXPORTS, SHEET_COLUMNS.EXPORTS);
    }
  },

  getSpreadsheet: function() {
    const id = CONFIG.SHEET_ID;
    return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  },

  ensureSheet: function(name, headers) {
    const spreadsheet = this.getSpreadsheet();
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      sheet.appendRow(headers);
    } else {
      const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      const needsUpdate = headers.some(function(header, index) {
        return currentHeaders[index] !== header;
      });
      if (needsUpdate) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
    }

    return sheet;
  },

  generateId: function(prefix) {
    return [prefix, Utilities.getUuid()].join('_');
  },

  readRows: function(sheetName, headers) {
    const sheet = this.ensureSheet(sheetName, headers);
    const lastRow = sheet.getLastRow();
    const lastColumn = headers.length;
    if (lastRow < 2) {
      return [];
    }

    const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
    return values.map(function(row, index) {
      const item = { _rowIndex: index + 2 };
      headers.forEach(function(header, headerIndex) {
        item[header] = row[headerIndex];
      });
      return item;
    });
  },

  appendRowObject: function(sheetName, headers, data) {
    const sheet = this.ensureSheet(sheetName, headers);
    const row = headers.map(function(header) {
      return data[header] == null ? '' : data[header];
    });
    sheet.appendRow(row);
    return { success: true, data: data };
  },

  updateRowObject: function(sheetName, headers, rowIndex, patch) {
    const sheet = this.ensureSheet(sheetName, headers);
    const currentValues = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    const nextValues = headers.map(function(header, index) {
      return Object.prototype.hasOwnProperty.call(patch, header) ? patch[header] : currentValues[index];
    });
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([nextValues]);
    return { success: true };
  },

  findByField: function(sheetName, headers, field, value) {
    const rows = this.readRows(sheetName, headers);
    return rows.find(function(row) {
      return String(row[field]) === String(value);
    }) || null;
  },

  filterByField: function(sheetName, headers, field, value) {
    return this.readRows(sheetName, headers).filter(function(row) {
      return String(row[field]) === String(value);
    });
  },

  addReminder: function(reminderData) {
    const nowIso = new Date().toISOString();
    return this.appendRowObject(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS, {
      id: this.generateId('rem'),
      line_user_id: reminderData.targetId,
      creator_line_user_id: reminderData.creatorLineUserId || reminderData.targetId,
      content: reminderData.content,
      category: reminderData.category || 'other',
      scheduled_at: reminderData.nextRun.toISOString(),
      frequency: FREQ_MAP[reminderData.freq] || 'ONCE',
      run_count: reminderData.runCount || 0,
      max_runs: reminderData.maxRuns || '',
      plan_code: reminderData.planCode || 'LITE',
      status: 'pending',
      created_at: nowIso,
      updated_at: nowIso
    });
  },

  getActiveReminderCount: function(ownerLineUserId) {
    const rows = this.filterByField(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS, 'creator_line_user_id', ownerLineUserId);
    const count = rows.filter(function(row) {
      return row.status === 'pending';
    }).length;
    return { success: true, count: count };
  },

  ensureManagedUser: function(userData) {
    const nowIso = new Date().toISOString();
    const existing = this.findByField(SHEETS_PROVIDER_NAMES.USERS, SHEET_COLUMNS.USERS, 'line_user_id', userData.lineUserId);
    if (existing) {
      this.updateRowObject(SHEETS_PROVIDER_NAMES.USERS, SHEET_COLUMNS.USERS, existing._rowIndex, {
        display_name: userData.displayName || existing.display_name || '',
        status: existing.status || 'active',
        updated_at: nowIso,
        last_seen_at: nowIso
      });
      existing.display_name = userData.displayName || existing.display_name || '';
      existing.updated_at = nowIso;
      existing.last_seen_at = nowIso;
      return { success: true, data: existing };
    }

    const row = {
      id: this.generateId('usr'),
      line_user_id: userData.lineUserId,
      display_name: userData.displayName || '',
      plan_code: userData.planCode || CONFIG.MANAGED_DEFAULT_PLAN || 'LITE',
      status: 'active',
      created_at: nowIso,
      updated_at: nowIso,
      last_seen_at: nowIso
    };
    return this.appendRowObject(SHEETS_PROVIDER_NAMES.USERS, SHEET_COLUMNS.USERS, row);
  },

  getManagedPlanByLineUserId: function(lineUserId, displayName) {
    const existing = this.findByField(SHEETS_PROVIDER_NAMES.USERS, SHEET_COLUMNS.USERS, 'line_user_id', lineUserId);
    if (existing) {
      return { success: true, planCode: (existing.plan_code || 'LITE').toUpperCase(), data: existing };
    }
    const created = this.ensureManagedUser({
      lineUserId: lineUserId,
      displayName: displayName,
      planCode: CONFIG.MANAGED_DEFAULT_PLAN || 'LITE'
    });
    return { success: true, planCode: ((created.data && created.data.plan_code) || 'LITE').toUpperCase(), data: created.data };
  },

  setManagedUserPlan: function(lineUserId, planCode) {
    const normalizedPlan = (planCode || 'LITE').toUpperCase();
    const existing = this.findByField(SHEETS_PROVIDER_NAMES.USERS, SHEET_COLUMNS.USERS, 'line_user_id', lineUserId);
    if (existing) {
      return this.updateRowObject(SHEETS_PROVIDER_NAMES.USERS, SHEET_COLUMNS.USERS, existing._rowIndex, {
        plan_code: normalizedPlan,
        updated_at: new Date().toISOString()
      });
    }
    return this.ensureManagedUser({
      lineUserId: lineUserId,
      planCode: normalizedPlan
    });
  },

  listManagedUsers: function(limit) {
    const rows = this.readRows(SHEETS_PROVIDER_NAMES.USERS, SHEET_COLUMNS.USERS)
      .sort(function(a, b) {
        return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
      })
      .slice(0, limit || 20);
    return { success: true, data: rows };
  },

  getActiveRemindersForUser: function(targetId) {
    return this.readRows(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS)
      .filter(function(row) {
        return row.line_user_id === targetId && row.status === 'pending';
      })
      .sort(function(a, b) {
        return String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || ''));
      })
      .map(function(row) {
        return {
          id: row.id,
          rowIndex: row._rowIndex,
          runTime: new Date(row.scheduled_at),
          content: row.content,
          freq: FREQ_MAP_REVERSE[row.frequency] || '單次',
          category: row.category
        };
      });
  },

  getDueReminders: function() {
    const now = new Date();
    const rows = this.readRows(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS)
      .filter(function(row) {
        return row.status === 'pending' && row.scheduled_at && new Date(row.scheduled_at) <= now;
      });
    return { success: true, data: rows };
  },

  cancelReminder: function(id) {
    const row = this.findByField(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS, 'id', id);
    if (!row) {
      return { success: false, error: 'Reminder not found' };
    }
    return this.updateRowObject(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS, row._rowIndex, {
      status: 'cancelled',
      updated_at: new Date().toISOString()
    });
  },

  updateReminderAfterRun: function(id, freqCode, nextRun, runCount, maxRuns) {
    const row = this.findByField(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS, 'id', id);
    if (!row) {
      return { success: false, error: 'Reminder not found' };
    }
    const nextRunCount = Number(runCount || 0) + 1;
    const reachedRunLimit = maxRuns && Number(maxRuns) > 0 && nextRunCount >= Number(maxRuns);
    const patch = {
      run_count: nextRunCount,
      updated_at: new Date().toISOString()
    };
    if (freqCode === 'ONCE' || !freqCode || reachedRunLimit) {
      patch.status = 'completed';
    } else {
      patch.scheduled_at = nextRun.toISOString();
    }
    return this.updateRowObject(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS, row._rowIndex, patch);
  },

  postponeReminder: function(id, minutes) {
    const row = this.findByField(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS, 'id', id);
    if (!row) {
      return { success: false, error: 'Reminder not found' };
    }
    const newTime = new Date(row.scheduled_at);
    newTime.setMinutes(newTime.getMinutes() + (minutes || 10));
    return this.updateRowObject(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS, row._rowIndex, {
      scheduled_at: newTime.toISOString(),
      updated_at: new Date().toISOString()
    });
  },

  completeReminder: function(id) {
    const row = this.findByField(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS, 'id', id);
    if (!row) {
      return { success: false, error: 'Reminder not found' };
    }
    return this.updateRowObject(SHEETS_PROVIDER_NAMES.REMINDERS, SHEET_COLUMNS.REMINDERS, row._rowIndex, {
      status: 'completed',
      updated_at: new Date().toISOString()
    });
  },

  addIdea: function(ideaData) {
    return this.appendRowObject(SHEETS_PROVIDER_NAMES.IDEAS, SHEET_COLUMNS.IDEAS, {
      id: this.generateId('idea'),
      line_user_id: ideaData.userId,
      content: ideaData.content,
      category: ideaData.category || 'other',
      source: ideaData.source || 'LINE',
      created_at: new Date().toISOString()
    });
  },

  listIdeasByUser: function(lineUserId, options) {
    const rows = this.filterByField(SHEETS_PROVIDER_NAMES.IDEAS, SHEET_COLUMNS.IDEAS, 'line_user_id', lineUserId)
      .sort(function(a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      })
      .slice(0, (options && options.limit) || 500);
    return { success: true, data: rows };
  },

  addExportLog: function(exportData) {
    return this.appendRowObject(SHEETS_PROVIDER_NAMES.EXPORTS, SHEET_COLUMNS.EXPORTS, {
      id: this.generateId('exp'),
      line_user_id: exportData.lineUserId,
      format: exportData.format,
      record_count: exportData.recordCount || 0,
      file_name: exportData.fileName || '',
      file_url: exportData.fileUrl || '',
      status: exportData.status || 'completed',
      created_at: new Date().toISOString()
    });
  },

  listExports: function(limit) {
    const rows = this.readRows(SHEETS_PROVIDER_NAMES.EXPORTS, SHEET_COLUMNS.EXPORTS)
      .sort(function(a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      })
      .slice(0, limit || 20);
    return { success: true, data: rows };
  },

  addFeedback: function(feedbackData) {
    return this.appendRowObject(SHEETS_PROVIDER_NAMES.FEEDBACKS, SHEET_COLUMNS.FEEDBACKS, {
      id: this.generateId('fb'),
      line_user_id: feedbackData.userId,
      target_id: feedbackData.targetId || feedbackData.userId,
      source_type: feedbackData.sourceType || 'user',
      message: feedbackData.message,
      status: feedbackData.status || 'new',
      admin_reply: '',
      created_at: new Date().toISOString(),
      replied_at: '',
      updated_at: new Date().toISOString()
    });
  },

  getFeedback: function(id) {
    const row = this.findByField(SHEETS_PROVIDER_NAMES.FEEDBACKS, SHEET_COLUMNS.FEEDBACKS, 'id', id);
    if (!row) {
      return { success: false, error: 'Feedback not found' };
    }
    return { success: true, data: row };
  },

  listFeedbacks: function(options) {
    let rows = this.readRows(SHEETS_PROVIDER_NAMES.FEEDBACKS, SHEET_COLUMNS.FEEDBACKS)
      .sort(function(a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
    if (options && options.status) {
      rows = rows.filter(function(row) {
        return row.status === options.status;
      });
    }
    rows = rows.slice(0, (options && options.limit) || 20);
    return { success: true, data: rows };
  },

  markFeedbackReplied: function(id, adminReply) {
    const row = this.findByField(SHEETS_PROVIDER_NAMES.FEEDBACKS, SHEET_COLUMNS.FEEDBACKS, 'id', id);
    if (!row) {
      return { success: false, error: 'Feedback not found' };
    }
    return this.updateRowObject(SHEETS_PROVIDER_NAMES.FEEDBACKS, SHEET_COLUMNS.FEEDBACKS, row._rowIndex, {
      status: 'replied',
      admin_reply: adminReply,
      replied_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
};

function getDatabaseProvider() {
  return CONFIG.DATABASE_PROVIDER === 'SHEETS' ? SheetsDatabase : SupabaseDatabase;
}

function getActiveDatabase() {
  return getDatabaseProvider();
}

const Database = new Proxy({}, {
  get: function(target, prop) {
    const provider = getActiveDatabase();
    const value = provider[prop];

    if (typeof value === 'function') {
      return value.bind(provider);
    }

    return value;
  }
});
