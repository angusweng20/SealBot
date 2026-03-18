/**
 * SUPABASE CLIENT HELPER
 * Direct REST API integration for Google Apps Script
 */

const SupabaseClient = {
  /**
   * Main fetch function for Supabase REST API
   */
  fetch: function(endpoint, method = 'GET', body = null) {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/' + endpoint;
    
    const options = {
      method: method,
      headers: {
        'apikey': CONFIG.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' || method === 'PATCH' ? 'return=representation' : 'return=minimal'
      }
    };
    
    if (body) {
      options.payload = JSON.stringify(body);
    }
    
    try {
      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();
      const content = response.getContentText();
      
      if (code >= 200 && code < 300) {
        return { success: true, data: content ? JSON.parse(content) : null };
      } else {
        console.error('Supabase Error:', code, content);
        return { success: false, error: content };
      }
    } catch (e) {
      console.error('Supabase Fetch Error:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * SELECT - Get rows from table
   */
  get: function(table, filters = {}) {
    let endpoint = table + '?';
    const filterParts = [];
    
    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        filterParts.push(key + '=' + encodeURIComponent(value.join('.')));
      } else {
        filterParts.push(key + '=' + encodeURIComponent(value));
      }
    }
    
    endpoint += filterParts.join('&');
    return this.fetch(endpoint, 'GET');
  },

  /**
   * INSERT - Add new row(s)
   */
  insert: function(table, data) {
    const rows = Array.isArray(data) ? data : [data];
    return this.fetch(table, 'POST', rows);
  },

  /**
   * UPDATE - Modify existing row
   */
  update: function(table, id, data) {
    return this.fetch(table + '?id=eq.' + id, 'PATCH', data);
  },

  /**
   * DELETE - Remove row
   */
  remove: function(table, id) {
    return this.fetch(table + '?id=eq.' + id, 'DELETE');
  },

  /**
   * Upsert - Insert or update
   */
  upsert: function(table, data, onConflict = 'id') {
    const rows = Array.isArray(data) ? data : [data];
    const url = CONFIG.SUPABASE_URL + '/rest/v1/' + table + '?on_conflict=' + onConflict;
    const options = {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      payload: JSON.stringify(rows)
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();
      const content = response.getContentText();

      if (code >= 200 && code < 300) {
        return { success: true, data: content ? JSON.parse(content) : null };
      }

      console.error('Supabase Upsert Error:', code, content);
      return { success: false, error: content };
    } catch (e) {
      console.error('Supabase Upsert Error:', e);
      return { success: false, error: e.message };
    }
  }
};

// ==========================================
// Database Layer using Supabase
// ==========================================

const SupabaseDatabase = {
  /**
   * Initialize - check/create tables
   */
  init: function() {
    // Check if tables exist by trying to query them
    const result = SupabaseClient.get('reminders', { limit: 1 });
    if (!result.success) {
      console.log('Tables not initialized. Please run SQL setup.');
      return false;
    }
    return true;
  },

  /**
   * Add a new reminder
   */
  addReminder: function(reminderData) {
    const row = {
      line_user_id: reminderData.targetId,
      creator_line_user_id: reminderData.creatorLineUserId || reminderData.targetId,
      content: reminderData.content,
      category: reminderData.category || 'other',
      scheduled_at: reminderData.nextRun.toISOString(),
      frequency: FREQ_MAP[reminderData.freq] || 'ONCE',
      run_count: reminderData.runCount || 0,
      max_runs: reminderData.maxRuns || null,
      plan_code: reminderData.planCode || 'LITE',
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    return SupabaseClient.insert('reminders', row);
  },

  /**
   * Count active reminders for a target
   */
  getActiveReminderCount: function(ownerLineUserId) {
    const result = SupabaseClient.get('reminders', {
      'creator_line_user_id': 'eq.' + ownerLineUserId,
      'status': 'eq.pending'
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to count reminders', count: 0 };
    }

    return { success: true, count: result.data.length };
  },

  /**
   * Get or create a managed user record
   */
  ensureManagedUser: function(userData) {
    const lineUserId = userData.lineUserId;
    const existing = SupabaseClient.get('users', {
      'line_user_id': 'eq.' + lineUserId,
      limit: 1
    });

    if (existing.success && existing.data && existing.data.length > 0) {
      const current = existing.data[0];
      const patch = {
        display_name: userData.displayName || current.display_name || null,
        status: current.status || 'active',
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const updated = SupabaseClient.update('users', current.id, patch);
      if (!updated.success) {
        return { success: false, error: updated.error };
      }

      return {
        success: true,
        data: Object.assign({}, current, patch)
      };
    }

    const row = {
      line_user_id: lineUserId,
      display_name: userData.displayName || null,
      plan_code: userData.planCode || CONFIG.MANAGED_DEFAULT_PLAN || 'LITE',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    };

    return SupabaseClient.insert('users', row);
  },

  /**
   * Resolve managed user plan by LINE user id
   */
  getManagedPlanByLineUserId: function(lineUserId, displayName) {
    const existing = SupabaseClient.get('users', {
      'line_user_id': 'eq.' + lineUserId,
      limit: 1
    });

    if (existing.success && existing.data && existing.data.length > 0) {
      return { success: true, planCode: (existing.data[0].plan_code || 'LITE').toUpperCase(), data: existing.data[0] };
    }

    const created = this.ensureManagedUser({
      lineUserId: lineUserId,
      displayName: displayName,
      planCode: CONFIG.MANAGED_DEFAULT_PLAN || 'LITE'
    });

    if (!created.success || !created.data || created.data.length === 0) {
      return { success: false, error: (created && created.error) || 'Failed to create managed user' };
    }

    const row = Array.isArray(created.data) ? created.data[0] : created.data;
    return { success: true, planCode: (row.plan_code || 'LITE').toUpperCase(), data: row };
  },

  /**
   * Set managed user plan
   */
  setManagedUserPlan: function(lineUserId, planCode) {
    const normalizedPlan = (planCode || 'LITE').toUpperCase();
    const existing = SupabaseClient.get('users', {
      'line_user_id': 'eq.' + lineUserId,
      limit: 1
    });

    if (existing.success && existing.data && existing.data.length > 0) {
      return SupabaseClient.update('users', existing.data[0].id, {
        plan_code: normalizedPlan,
        updated_at: new Date().toISOString()
      });
    }

    return this.ensureManagedUser({
      lineUserId: lineUserId,
      planCode: normalizedPlan
    });
  },

  /**
   * List managed users
   */
  listManagedUsers: function(limit) {
    const result = SupabaseClient.get('users', {
      order: 'updated_at.desc',
      limit: limit || 20
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to list users', data: [] };
    }

    return { success: true, data: result.data };
  },

  /**
   * Get due reminders for trigger processing
   */
  getDueReminders: function() {
    return SupabaseClient.get('reminders', {
      'status': 'eq.pending',
      'scheduled_at': 'lte.' + new Date().toISOString()
    });
  },

  /**
   * Get active reminders for a user
   */
  getActiveRemindersForUser: function(targetId) {
    const result = SupabaseClient.get('reminders', {
      'line_user_id': 'eq.' + targetId,
      'status': 'eq.pending',
      'order': 'scheduled_at.asc'
    });
    
    if (!result.success || !result.data) {
      return [];
    }
    
    return result.data.map(r => ({
      id: r.id,
      rowIndex: r.id,
      runTime: new Date(r.scheduled_at),
      content: r.content,
      freq: FREQ_MAP_REVERSE[r.frequency] || '單次',
      category: r.category
    }));
  },

  /**
   * Get all pending reminders (for trigger)
   */
  getAllRemindersRaw: function() {
    const result = SupabaseClient.get('reminders', {
      'status': 'eq.pending',
      'order': 'scheduled_at.asc'
    });
    
    if (!result.success || !result.data) {
      return [];
    }
    
    // Return in same format as original
    return result.data.map(r => [
      r.status,
      new Date(r.scheduled_at),
      FREQ_MAP_REVERSE[r.frequency] || '單次',
      r.content,
      r.line_user_id,
      'USER',
      r.id // row index equivalent
    ]);
  },

  /**
   * Cancel a reminder
   */
  cancelReminder: function(id) {
    if (String(id).includes('-')) {
      return SupabaseClient.update('reminders', id, { status: 'cancelled' });
    }

    const result = SupabaseClient.get('reminders', {
      order: 'created_at.asc',
      limit: 1,
      offset: Number(id) - 1
    });

    if (result.success && result.data && result.data.length > 0) {
      return SupabaseClient.update('reminders', result.data[0].id, { status: 'cancelled' });
    }

    return { success: false, error: 'Reminder not found' };
  },

  /**
   * Update reminder after trigger fires
   */
  updateReminderAfterRun: function(id, freqCode, nextRun, runCount, maxRuns) {
    const nextRunCount = Number(runCount || 0) + 1;
    const reachedRunLimit = maxRuns && maxRuns > 0 && nextRunCount >= maxRuns;

    if (freqCode === 'ONCE' || !freqCode || reachedRunLimit) {
      return SupabaseClient.update('reminders', id, {
        status: 'completed',
        run_count: nextRunCount,
        updated_at: new Date().toISOString()
      });
    } else {
      return SupabaseClient.update('reminders', id, { 
        run_count: nextRunCount,
        scheduled_at: nextRun.toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  },

  /**
   * Postpone a reminder
   */
  postponeReminder: function(id, minutes = 10) {
    const current = SupabaseClient.get('reminders', { 'id': 'eq.' + id });
    if (!current.success || !current.data || current.data.length === 0) {
      return { success: false, error: 'Reminder not found' };
    }
    
    const reminder = current.data[0];
    const newTime = new Date(reminder.scheduled_at);
    newTime.setMinutes(newTime.getMinutes() + minutes);
    
    return SupabaseClient.update('reminders', id, {
      scheduled_at: newTime.toISOString(),
      updated_at: new Date().toISOString()
    });
  },

  /**
   * Complete a reminder
   */
  completeReminder: function(id) {
    return SupabaseClient.update('reminders', id, {
      status: 'completed',
      updated_at: new Date().toISOString()
    });
  },

  /**
   * Add an idea/note
   */
  addIdea: function(ideaData) {
    const row = {
      line_user_id: ideaData.userId,
      content: ideaData.content,
      category: ideaData.category || 'other',
      source: ideaData.source || 'LINE',
      created_at: new Date().toISOString()
    };
    
    return SupabaseClient.insert('ideas', row);
  },

  /**
   * List idea records for export
   */
  listIdeasByUser: function(lineUserId, options = {}) {
    const filters = {
      'line_user_id': 'eq.' + lineUserId,
      order: 'created_at.desc'
    };

    if (options.limit) {
      filters.limit = options.limit;
    }

    const result = SupabaseClient.get('ideas', filters);
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to list ideas', data: [] };
    }

    return { success: true, data: result.data };
  },

  /**
   * Log export generation
   */
  addExportLog: function(exportData) {
    const row = {
      line_user_id: exportData.lineUserId,
      format: exportData.format,
      record_count: exportData.recordCount || 0,
      file_name: exportData.fileName || null,
      file_url: exportData.fileUrl || null,
      status: exportData.status || 'completed',
      created_at: new Date().toISOString()
    };

    return SupabaseClient.insert('exports', row);
  },

  /**
   * List export logs
   */
  listExports: function(limit) {
    const result = SupabaseClient.get('exports', {
      order: 'created_at.desc',
      limit: limit || 20
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to list exports', data: [] };
    }

    return { success: true, data: result.data };
  },

  /**
   * Add a new feedback item
   */
  addFeedback: function(feedbackData) {
    const row = {
      line_user_id: feedbackData.userId,
      target_id: feedbackData.targetId || feedbackData.userId,
      source_type: feedbackData.sourceType || 'user',
      message: feedbackData.message,
      status: feedbackData.status || 'new',
      created_at: new Date().toISOString()
    };

    return SupabaseClient.insert('feedbacks', row);
  },

  /**
   * Get one feedback item by id
   */
  getFeedback: function(id) {
    const result = SupabaseClient.get('feedbacks', { 'id': 'eq.' + id, limit: 1 });
    if (!result.success || !result.data || result.data.length === 0) {
      return { success: false, error: 'Feedback not found' };
    }

    return { success: true, data: result.data[0] };
  },

  /**
   * List feedback items for admin review
   */
  listFeedbacks: function(options = {}) {
    const filters = {
      order: 'created_at.desc',
      limit: options.limit || 20
    };

    if (options.status) {
      filters.status = 'eq.' + options.status;
    }

    const result = SupabaseClient.get('feedbacks', filters);
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to list feedbacks', data: [] };
    }

    return { success: true, data: result.data };
  },

  /**
   * Mark feedback as replied
   */
  markFeedbackReplied: function(id, adminReply) {
    return SupabaseClient.update('feedbacks', id, {
      status: 'replied',
      admin_reply: adminReply,
      replied_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
};
