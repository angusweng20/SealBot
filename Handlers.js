/**
 * HANDLERS & LOGIC
 */

function handleMessage(event) {
  const userId = event.source.userId;
  const sourceType = event.source.type;
  const targetId = (sourceType === 'group') ? event.source.groupId : 
                   (sourceType === 'room') ? event.source.roomId : userId;
  
  const userMsg = event.message.text.trim();
  const replyToken = event.replyToken;
  
  // Cache for State Management
  const cache = CacheService.getScriptCache();
  const stateKey = `state_${userId}`; 
  const dataKey = `data_${userId}`; 
  const isHelpCommand = userMsg.match(/^(說明|help|功能)$/i);
  const isIdeaCommand = userMsg.match(/^要記錄\s*/i);
  const isReminderCommand = userMsg.startsWith('要記得');
  const isFeedbackCommand = userMsg.match(/^要反饋\s*/i);
  const isExportCommand = userMsg.match(/^匯出記錄(?:\s+(csv|markdown|md))?$/i);
  const isQueryCommand = userMsg.match(/^(查詢|查詢提醒)$/);
  const capabilities = getAvailableCapabilities();

  if (userMsg.match(/^取消$/)) {
    cache.remove(stateKey);
    cache.remove(dataKey);
    replyText(replyToken, "已取消目前的設定 👌");
    return;
  }
  
  // 2. Cancellation by ID (Special Syntax: "取消 #123")
  const cancelMatch = userMsg.match(/^取消\s*#([^\s]+)$/);
  if (cancelMatch) {
     const rowId = cancelMatch[1];
     const success = Database.cancelReminder(rowId);
     if (success) {
       replyText(replyToken, `✅ 提醒 #${rowId} 已刪除！`);
     } else {
       replyText(replyToken, `❌ 找不到或無法刪除該提醒 #${rowId}`);
     }
     return;
  }

  // 2b. Postpone reminder ("延後 #xxx" or "延後 #xxx 10分鐘")
  const postponeMatch = userMsg.match(/^延後\s*#([^\s]+)(?:\s+(\d+)\s*分鐘?)?$/);
  if (postponeMatch) {
    const reminderId = postponeMatch[1];
    const minutes = parseInt(postponeMatch[2]) || 10;
    const result = Database.postponeReminder(reminderId, minutes);
    if (result.success) {
      replyText(replyToken, `⏰ 提醒 #${reminderId} 已延後 ${minutes} 分鐘！`);
    } else {
      replyText(replyToken, `❌ 無法延後提醒 #${reminderId}`);
    }
    return;
  }

  // 2c. Complete reminder ("完成 #xxx")
  const completeMatch = userMsg.match(/^完成\s*#([^\s]+)$/);
  if (completeMatch) {
    const reminderId = completeMatch[1];
    const result = Database.completeReminder(reminderId);
    if (result.success) {
      replyText(replyToken, `✅ 提醒 #${reminderId} 已標記完成！`);
    } else {
      replyText(replyToken, `❌ 無法完成提醒 #${reminderId}`);
    }
    return;
  }

  const currentState = cache.get(stateKey);
  if (currentState && (isHelpCommand || isIdeaCommand || isReminderCommand || isFeedbackCommand || isExportCommand || isQueryCommand)) {
    cache.remove(stateKey);
    cache.remove(dataKey);
  }
  if (currentState && !isHelpCommand && !isIdeaCommand && !isReminderCommand && !isFeedbackCommand && !isExportCommand && !isQueryCommand) {
    processStateFlow(currentState, userId, targetId, sourceType, userMsg, replyToken, cache, stateKey, dataKey);
    return;
  }

  if (isHelpCommand) {
    const flex = createHelpFlex();
    replyMessage(replyToken, [ { type: "flex", altText: "使用說明", contents: flex } ]);
  
  } else if (isIdeaCommand) {
    if (!capabilities.ideaCapture) {
      replyText(replyToken, getFeatureUnavailableMessage('ideaCapture'));
      return;
    }

    const planResult = Database.getManagedPlanByLineUserId(userId);
    const planCode = planResult && planResult.success ? planResult.planCode : CONFIG.MANAGED_DEFAULT_PLAN;
    if (planCode !== 'PRO') {
      replyText(
        replyToken,
        "要記錄目前是 Pro 版功能。\n\n升級後你就可以持續記錄靈感，並快速匯出成 Markdown 或 CSV。"
      );
      return;
    }

    const content = userMsg.replace(/^要記錄\s*/i, '').trim();
    if (content.length === 0) {
      replyText(replyToken, "收到，要記錄什麼呢？\n例如：要記錄 重新設計 Dashboard 導覽列");
      return;
    }
    const category = AIClassifier.classify(content);
    
    const result = saveIdeaCapture(content, userId, category);
    if (result.success && result.githubSuccess) {
      const catIcon = CATEGORY_ICONS[category] || CATEGORY_ICONS['other'];
      replyText(replyToken, `📝 已收下！\n\n「${content}」\n\n${catIcon} 分類：${category}\n📁 已存入 ${CONFIG.GITHUB_REPO}/${getCategoryFolder(category)}\n⏳ 回到電腦後 AI 會自動幫你整理歸檔`);
    } else if (result.success) {
      const catIcon = CATEGORY_ICONS[category] || CATEGORY_ICONS['other'];
      replyText(replyToken, `📝 已收下！\n\n「${content}」\n\n${catIcon} 分類：${category}\n☁️ 已存入資料庫\n⚠️ GitHub 同步失敗：${result.githubError}`);
    } else {
      replyText(replyToken, `❌ capture 儲存失敗：${result.error}`);
    }

  } else if (isFeedbackCommand) {
    if (!capabilities.feedback) {
      replyText(replyToken, getFeatureUnavailableMessage('feedback'));
      return;
    }

    const content = userMsg.replace(/^要反饋\s*/i, '').trim();
    if (content.length === 0) {
      replyText(replyToken, "收到，你想反饋什麼呢？\n例如：要反饋 查詢提醒時希望能用分類篩選");
      return;
    }

    const result = saveFeedbackCapture(content, userId, targetId, sourceType);
    if (result.success) {
      replyText(
        replyToken,
        `謝謝你的反饋，我有收到。\n\n「${content}」\n\n我會把這則意見加入後續規劃；如果有進一步更新，也會盡量回覆你。`
      );
    } else {
      replyText(replyToken, `❌ 反饋儲存失敗：${result.error}`);
    }

  } else if (isExportCommand) {
    if (!capabilities.exportRecords) {
      replyText(replyToken, getFeatureUnavailableMessage('exportRecords'));
      return;
    }

    const formatMatch = userMsg.match(/^匯出記錄(?:\s+(csv|markdown|md))?$/i);
    const requestedFormat = formatMatch && formatMatch[1] ? formatMatch[1].toLowerCase() : 'markdown';
    const format = requestedFormat === 'csv' ? 'csv' : 'markdown';
    exportRecordsForUser(replyToken, userId, format);

  } else if (isReminderCommand) {
    const initData = {
        targetId: targetId,
        targetType: (sourceType === 'group') ? 'GROUP' : 'USER'
    };
    cache.put(dataKey, JSON.stringify(initData), 600);

    let restText = userMsg.substring(3).trim();

    if (restText.length > 0) {
       cache.put(stateKey, 'WAITING_INFO', 600);
       processStateFlow('WAITING_INFO', userId, targetId, sourceType, restText, replyToken, cache, stateKey, dataKey);
       return; 
    }

    cache.put(stateKey, 'WAITING_INFO', 600); 
    replyText(replyToken, "收到！請告訴我「時間」與「要記得的事」！\n(例如：明天下午兩點 開會、每週五交週報)");
  
  } else if (isQueryCommand) {
    doQuery(targetId, replyToken);
  } else {
    replyText(replyToken, buildDefaultCommandPrompt());
  }
}

function processStateFlow(state, userId, targetId, sourceType, input, replyToken, cache, stateKey, dataKey) {
  let cachedData = JSON.parse(cache.get(dataKey));
  if (!cachedData) cachedData = {};

  if (state === 'WAITING_INFO') {
    // Try to parse Time AND Content
    const timeObj = parseTimeInput(input);
    const content = extractContent(input);
    
    // Case 1: Time found
    if (timeObj) {
        // If content is empty (e.g. user just said "明天 9點"), ask for content
        if (!content || content.length === 0) {
            cachedData.timeObj = timeObj; // Store temp
            cache.put(dataKey, JSON.stringify(cachedData), 600);
            cache.put(stateKey, 'WAITING_CONTENT_ONLY', 600);
            replyText(replyToken, `時間是 ${Utilities.formatDate(timeObj.nextRun, "GMT+8", "HH:mm")}，那內容是什麼呢？`);
            return;
        }

        // Time AND Content found -> Save directly!
        saveReminder(userId, cachedData, content, timeObj, replyToken, cache, stateKey, dataKey);
    } 
    // Case 2: Time NOT found, assume input is Content
    else {
        cachedData.content = input;
        cache.put(dataKey, JSON.stringify(cachedData), 600);
        cache.put(stateKey, 'WAITING_TIME_ONLY', 600);
        
        replyText(replyToken, `了解「${input}」👌 那時間呢？\n(例如：明天下午兩點)`);
    }

  } else if (state === 'WAITING_CONTENT_ONLY') {
      // User already provided time, now providing content
      const content = input;
      const timeObj = cachedData.timeObj; // Retrieve saved time
      
      // Need to re-hydrate Date object from JSON
      timeObj.nextRun = new Date(timeObj.nextRun);

      saveReminder(userId, cachedData, content, timeObj, replyToken, cache, stateKey, dataKey);

  } else if (state === 'WAITING_TIME_ONLY') {
    // User already provided content, now providing time
    const timeObj = parseTimeInput(input);
    if (!timeObj) {
      replyText(replyToken, "時間格式好像怪怪的 😵 請再試一次\n範例：明天早上9點、每週一 10:00");
      return;
    }
    
    // Retrieve saved content
    const content = cachedData.content;

    saveReminder(userId, cachedData, content, timeObj, replyToken, cache, stateKey, dataKey);
  }
}

function saveReminder(userId, cachedData, content, timeObj, replyToken, cache, stateKey, dataKey) {
    const freqChinese = FREQ_MAP_REVERSE[timeObj.frequency] || '單次';
    const capabilities = getAvailableCapabilities();
    const profile = getUserProfile(userId);
    const creatorName = profile.displayName || '未知';
    const planResult = capabilities.managedPlans
      ? Database.getManagedPlanByLineUserId(userId, creatorName)
      : { success: true, planCode: 'OSS' };
    const planCode = planResult && planResult.success ? planResult.planCode : CONFIG.MANAGED_DEFAULT_PLAN;
    const planLimits = getPlanLimits(planCode);
    const maxRuns = capabilities.planLimits
      ? (timeObj.frequency === 'ONCE' ? 1 : planLimits.maxRunsPerRecurringReminder)
      : (timeObj.frequency === 'ONCE' ? 1 : 0);

    if (capabilities.planLimits && planLimits.maxActiveReminders > 0) {
      const activeCountResult = Database.getActiveReminderCount(userId);
      if (!activeCountResult.success) {
        cache.remove(stateKey);
        cache.remove(dataKey);
        replyText(replyToken, "❌ 目前無法確認提醒額度，請稍後再試一次。");
        return;
      }

      if (activeCountResult.count >= planLimits.maxActiveReminders) {
        cache.remove(stateKey);
        cache.remove(dataKey);
        replyText(
          replyToken,
          `你目前的 ${planLimits.plan} 方案提醒事項已達上限 (${planLimits.maxActiveReminders} 筆)。\n\n你可以先完成或取消部分提醒，再新增新的提醒。`
        );
        return;
      }
    }

    const targetName = (cachedData.targetType === 'GROUP') ? '此群組' : creatorName;
    const category = AIClassifier.classify(content);
    const result = Database.addReminder({
       status: 'pending',
       nextRun: timeObj.nextRun,
       freq: freqChinese, 
       content: content,
       targetId: cachedData.targetId,
       targetType: cachedData.targetType,
       creatorId: userId,
       creatorLineUserId: userId,
       category: category,
       runCount: 0,
       maxRuns: maxRuns,
       planCode: capabilities.planLimits ? planLimits.plan : 'OSS'
    });

    if (!result || !result.success) {
      cache.remove(stateKey);
      cache.remove(dataKey);
      replyText(replyToken, "❌ 提醒儲存失敗，請稍後再試一次。");
      return;
    }
    
    cache.remove(stateKey);
    cache.remove(dataKey);
    
    const timeStr = Utilities.formatDate(timeObj.nextRun, "GMT+8", "yyyy-MM-dd HH:mm");
    const flex = createConfirmFlex({
        timeStr: timeStr,
        freq: freqChinese,
        targetName: targetName,
        content: content,
        category: category,
        maxRuns: maxRuns,
        planCode: capabilities.planLimits ? planLimits.plan : ''
    });
    
    replyMessage(replyToken, [ { type: "flex", altText: "設定完成", contents: flex } ]);
}

function doQuery(targetId, replyToken) {
  const reminders = Database.getActiveRemindersForUser(targetId);
  
  if (reminders.length === 0) {
      replyText(replyToken, "目前沒有待辦事項喔！✨");
      return;
  }
  
  // Convert to View Models
  const viewModels = reminders.map(r => ({
      id: r.id,
      content: r.content,
      category: r.category || 'other',
      dateStr: Utilities.formatDate(r.runTime, "GMT+8", "MM/dd HH:mm") + (r.freq !== '單次' ? ` (${r.freq})` : '')
  }));
  
  const flex = createReminderListFlex(viewModels);
  replyMessage(replyToken, [ { type: "flex", altText: "待辦清單", contents: flex } ]);
}

function getCategoryFolder(category) {
  const folders = {
    'work': 'Work',
    'health': 'Health',
    'personal': 'Personal',
    'shopping': 'Inbox',
    'meeting': 'Work',
    'other': 'Inbox'
  };
  return folders[category] || 'Inbox';
}

/**
 * IDEA CAPTURE: Save idea to GitHub Crab-Notes-DB with AI category
 */
function saveIdeaCapture(content, userId, category) {
  const dbResult = Database.addIdea({
    userId: userId,
    content: content,
    category: category || 'other',
    source: 'LINE'
  });

  if (!dbResult || !dbResult.success) {
    return { success: false, error: 'Supabase ideas write failed' };
  }

  try {
    const token = CONFIG.GITHUB_TOKEN;
    if (!token) {
      return { success: true, githubSuccess: false, githubError: 'GITHUB_TOKEN 尚未設定' };
    }

    const now = new Date();
    const tz = 'GMT+8';
    const dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const timeStr = Utilities.formatDate(now, tz, 'HHmmss');
    const shortTitle = content.substring(0, 20).replace(/[\s\/\\:*?"<>|]/g, '-');
    const filename = `${dateStr}-${timeStr}-${shortTitle}.md`;
    
    const folder = getCategoryFolder(category || 'other');
    const filePath = `${folder}/${filename}`;

    const obsidianTags = ['inbox', category || 'other'];
    if (category === 'work') obsidianTags.push('工作');
    else if (category === 'health') obsidianTags.push('健康');
    else if (category === 'personal') obsidianTags.push('個人');

    const markdownContent = [
      '---',
      `title: "${content.substring(0, 50)}"`,
      'status: "inbox"',
      'progress: 0',
      `priority: "${category === 'work' ? 'High' : 'Medium'}"`,
      `capturedAt: "${Utilities.formatDate(now, tz, "yyyy-MM-dd'T'HH:mm:ssXXX")}"`,
      'source: "LINE Bot"',
      `tags: [${obsidianTags.map(t => `"${t}"`).join(', ')}]`,
      '---',
      '',
      `# ${content}`,
      '',
      `> 💬 透過 LINE 於 ${Utilities.formatDate(now, tz, 'yyyy/MM/dd HH:mm')} 捕獲`,
      `> 🏷️ 分類: ${category || 'other'}`,
      ''
    ].join('\n');

    const apiUrl = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${filePath}`;
    const payload = {
      message: `📥 New ${category} idea from LINE: ${content.substring(0, 50)}`,
      content: Utilities.base64Encode(markdownContent, Utilities.Charset.UTF_8)
    };

    const response = UrlFetchApp.fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    if (code === 201) {
      return { success: true, githubSuccess: true };
    } else {
      const body = JSON.parse(response.getContentText());
      const detail = body.message || `HTTP ${code}`;
      return { success: true, githubSuccess: false, githubError: `${detail} (${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO})` };
    }
  } catch (e) {
    return { success: true, githubSuccess: false, githubError: e.message };
  }
}

function saveFeedbackCapture(content, userId, targetId, sourceType) {
  return Database.addFeedback({
    userId: userId,
    targetId: targetId,
    sourceType: sourceType,
    message: content,
    status: 'new'
  });
}

function exportRecordsForUser(replyToken, userId, format) {
  const planResult = Database.getManagedPlanByLineUserId(userId);
  const planCode = planResult && planResult.success ? planResult.planCode : CONFIG.MANAGED_DEFAULT_PLAN;
  if (planCode !== 'PRO') {
    replyText(
      replyToken,
      "匯出記錄目前是 Pro 版功能。\n\n等你升級後，就可以把所有記錄快速整理成 Markdown 或 CSV。"
    );
    return;
  }

  const recordsResult = Database.listIdeasByUser(userId, { limit: 500 });
  if (!recordsResult.success) {
    replyText(replyToken, "❌ 目前無法匯出記錄，請稍後再試一次。");
    return;
  }

  if (!recordsResult.data || recordsResult.data.length === 0) {
    replyText(replyToken, "目前還沒有可匯出的記錄。");
    return;
  }

  const exportedText = format === 'csv'
    ? buildIdeasCsv(recordsResult.data)
    : buildIdeasMarkdown(recordsResult.data);
  const exportResult = createIdeaExportFile(userId, format, exportedText, recordsResult.data.length);

  if (exportResult.success) {
    const lines = [
      `已為你整理好 ${recordsResult.data.length} 筆記錄。`,
      `格式：${format === 'csv' ? 'CSV' : 'Markdown'}`,
      `檔名：${exportResult.fileName}`,
      '',
      `下載連結：${exportResult.fileUrl}`
    ];
    replyText(replyToken, lines.join('\n'));
    return;
  }

  const intro = format === 'csv'
    ? `目前無法建立檔案，先直接提供 CSV 內容，共 ${recordsResult.data.length} 筆：`
    : `目前無法建立檔案，先直接提供 Markdown 內容，共 ${recordsResult.data.length} 筆：`;

  const messages = [{ type: 'text', text: intro }].concat(splitTextIntoLineMessages(exportedText, 4200));
  replyMessage(replyToken, messages.slice(0, 5));
}

function buildIdeasMarkdown(items) {
  return items.map(item => {
    const createdAt = item.created_at || '';
    const category = item.category || 'other';
    return [
      `## ${item.content}`,
      `- category: ${category}`,
      `- created_at: ${createdAt}`,
      `- source: ${item.source || 'LINE'}`,
      ''
    ].join('\n');
  }).join('\n');
}

function buildIdeasCsv(items) {
  const escapeCsv = function(value) {
    const text = value == null ? '' : String(value);
    return '"' + text.replace(/"/g, '""') + '"';
  };

  const header = ['content', 'category', 'source', 'created_at'].map(escapeCsv).join(',');
  const rows = items.map(item => {
    return [
      escapeCsv(item.content),
      escapeCsv(item.category || 'other'),
      escapeCsv(item.source || 'LINE'),
      escapeCsv(item.created_at || '')
    ].join(',');
  });

  return [header].concat(rows).join('\n');
}

function createIdeaExportFile(userId, format, content, recordCount) {
  const now = new Date();
  const timestamp = Utilities.formatDate(now, "GMT+8", "yyyyMMdd-HHmmss");
  const extension = format === 'csv' ? 'csv' : 'md';
  const fileName = `records-${timestamp}.${extension}`;
  const mimeType = format === 'csv'
    ? MimeType.CSV
    : MimeType.PLAIN_TEXT;

  try {
    const file = createExportDriveFile(fileName, content, mimeType);
    const fileUrl = file.getUrl();
    file.setDescription(`LINE records export for ${userId}`);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingError) {
      console.error('Drive sharing setup failed:', sharingError);
    }

    try {
      Database.addExportLog({
        lineUserId: userId,
        format: format,
        recordCount: recordCount,
        fileName: fileName,
        fileUrl: fileUrl,
        status: 'completed'
      });
    } catch (logError) {
      console.error('Export log failed:', logError);
    }

    return {
      success: true,
      fileName: fileName,
      fileUrl: fileUrl,
      fileId: file.getId()
    };
  } catch (e) {
    console.error('Export file creation failed:', e);
    return { success: false, error: e.message };
  }
}

function createExportDriveFile(fileName, content, mimeType) {
  const folderId = CONFIG.EXPORT_FOLDER_ID;
  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    return folder.createFile(fileName, content, mimeType);
  }

  return DriveApp.createFile(fileName, content, mimeType);
}

function replyToFeedback(feedbackId, responseText) {
  if (!feedbackId || !responseText) {
    throw new Error('請提供 feedbackId 與 responseText');
  }

  const feedback = Database.getFeedback(feedbackId);
  if (!feedback.success || !feedback.data) {
    throw new Error('找不到該反饋資料');
  }

  const row = feedback.data;
  const replyMessageText = `收到你的反饋真的很感謝。\n\n你提到：${row.message}\n\n我的回覆：${responseText}`;

  const pushResult = pushMessage(row.line_user_id, [{ type: 'text', text: replyMessageText }]);
  if (!pushResult || !pushResult.success) {
    throw new Error('LINE 回覆送出失敗：' + ((pushResult && pushResult.error) || 'unknown error'));
  }

  return Database.markFeedbackReplied(feedbackId, responseText);
}

function listRecentFeedbacks(status, limit) {
  const result = Database.listFeedbacks({
    status: status || 'new',
    limit: limit || 10
  });

  if (!result.success) {
    throw new Error('無法取得反饋列表：' + result.error);
  }

  if (!result.data || result.data.length === 0) {
    return '目前沒有符合條件的反饋。';
  }

  return result.data.map((item, index) => {
    return [
      `${index + 1}. #${item.id}`,
      `狀態：${item.status}`,
      `來源：${item.source_type || 'user'}`,
      `建立時間：${item.created_at}`,
      `內容：${item.message}`
    ].join('\n');
  }).join('\n\n');
}

function getFeedbackDetails(feedbackId) {
  const result = Database.getFeedback(feedbackId);
  if (!result.success) {
    throw new Error('找不到該反饋資料');
  }

  const item = result.data;
  return [
    `ID：${item.id}`,
    `狀態：${item.status}`,
    `LINE User ID：${item.line_user_id}`,
    `Target ID：${item.target_id || ''}`,
    `來源：${item.source_type || 'user'}`,
    `建立時間：${item.created_at}`,
    `內容：${item.message}`,
    `管理員回覆：${item.admin_reply || ''}`
  ].join('\n');
}

function getManagedUserPlan(lineUserId) {
  if (!getAvailableCapabilities().managedPlans) {
    return '目前這個版本沒有代管方案資訊。';
  }

  const result = Database.getManagedPlanByLineUserId(lineUserId);
  if (!result.success) {
    throw new Error('無法取得使用者方案：' + result.error);
  }

  return [
    `LINE User ID：${lineUserId}`,
    `Plan：${result.planCode}`,
    `狀態：${(result.data && result.data.status) || ''}`,
    `顯示名稱：${(result.data && result.data.display_name) || ''}`
  ].join('\n');
}

function setManagedUserPlan(lineUserId, planCode) {
  if (!getAvailableCapabilities().managedPlans) {
    throw new Error('目前這個版本不支援方案管理');
  }

  if (!lineUserId || !planCode) {
    throw new Error('請提供 lineUserId 與 planCode');
  }

  const result = Database.setManagedUserPlan(lineUserId, planCode);
  if (!result.success) {
    throw new Error('更新使用者方案失敗：' + result.error);
  }

  return `已將 ${lineUserId} 的方案更新為 ${(planCode || '').toUpperCase()}`;
}

function getFeatureUnavailableMessage(featureKey) {
  const messages = {
    ideaCapture: isSheetsProvider()
      ? "這個開源版目前只提供提醒功能。\n\n如果你想用「要記錄」，可以改用代管版，或自行擴充這份專案。 "
      : "這個版本目前只提供提醒功能。\n\n如果你想用「要記錄」，請使用代管版。",
    feedback: isSheetsProvider()
      ? "這個開源版目前沒有內建反饋功能。\n\n如果你想直接傳反饋給我，請使用代管版。"
      : "這個版本目前沒有內建反饋功能。\n\n如果你想直接傳反饋給我，請使用代管版。",
    exportRecords: isSheetsProvider()
      ? "這個開源版目前沒有記錄匯出功能。\n\n如果你想用「匯出記錄」，可以改用代管版，或自行擴充這份專案。"
      : "這個版本目前沒有記錄匯出功能。\n\n如果你想用「匯出記錄」，請使用代管版。"
  };

  return messages[featureKey] || "這個版本目前沒有這個功能。";
}

function buildDefaultCommandPrompt() {
  const capabilities = getAvailableCapabilities();
  const lines = [
    "你可以這樣使用：",
    "要記得 明天 9點 開會",
    "查詢"
  ];

  if (capabilities.ideaCapture) {
    lines.push("要記錄 這個想法很棒");
  }

  if (capabilities.exportRecords) {
    lines.push("匯出記錄 markdown");
  }

  if (capabilities.feedback) {
    lines.push("要反饋 我希望查詢可以加上分類");
  }

  return lines.join('\n');
}
