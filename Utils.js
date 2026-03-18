/**
 * UTILITIES & HELPERS
 */

// ==========================================
// 1. Messaging Helpers
// ==========================================

function replyText(replyToken, text) {
  replyMessage(replyToken, [{ type: 'text', text: text }]);
}

function replyMessage(replyToken, messages) {
  try {
    const payload = {
      replyToken: replyToken,
      messages: messages
    };
    
    const options = {
      'method': 'post',
      'headers': {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.CHANNEL_ACCESS_TOKEN
      },
      'payload': JSON.stringify(payload)
    };
    
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', options);
    return { success: true };
  } catch (e) {
    console.error('Reply Error:', e);
    return { success: false, error: e.message };
  }
}

function pushMessage(to, messages) {
   try {
    const payload = {
      to: to,
      messages: messages
    };
    
    const options = {
      'method': 'post',
      'headers': {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.CHANNEL_ACCESS_TOKEN
      },
      'payload': JSON.stringify(payload)
    };
    
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', options);
    return { success: true };
  } catch (e) {
    console.error('Push Error:', e);
    return { success: false, error: e.message };
  }
}

function splitTextIntoLineMessages(text, maxLength) {
  const limit = maxLength || 4500;
  if (!text) {
    return [];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt <= 0) {
      splitAt = limit;
    }
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).replace(/^\n+/, '');
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks.map(chunk => ({ type: 'text', text: chunk }));
}

function getUserProfile(userId) {
  try {
    const response = UrlFetchApp.fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      'headers': { 'Authorization': 'Bearer ' + CONFIG.CHANNEL_ACCESS_TOKEN }
    });
    return JSON.parse(response.getContentText());
  } catch (e) { return { displayName: 'Unknown User' }; }
}


// ==========================================
// 2. Parsing Logic (Enhanced)
// ==========================================

function normalizeChineseTime(text) {
  // Simple mapping handling
  let s = text;
  s = s.replace(/點半/g, '點30');
  const map = {'零':0, '一':1, '二':2, '兩':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9};
  
  // Standardize numbers
  s = s.replace(/([二三四五])十([一二三四五六七八九])/g, (m, p1, p2) => map[p1] + "" + map[p2]);
  s = s.replace(/([二三四五])十/g, (m, p1) => map[p1] + "0");
  s = s.replace(/十([一二三四五六七八九])/g, (m, p1) => "1" + map[p1]);
  s = s.replace(/十/g, "10");
  s = s.replace(/[零一二兩三四五六七八九]/g, (char) => map[char]);
  
  // Standardize keywords
  s = s.replace(/日/g, '日'); 
  s = s.replace(/號/g, '日'); 
  s = s.replace(/週/g, '禮拜'); 
  s = s.replace(/星期/g, '禮拜');
  
  return s;
}

/**
 * Parses time input and returns { nextRun: Date, frequency: 'ONCE'|'DAILY'|'WEEKLY'|'MONTHLY' }
 */
function parseTimeInput(input) {
  let normalized = normalizeChineseTime(input);
  const now = new Date();
  let nextRun = new Date();
  
  // Helper to adjust hour based on period
  const getHour = (h, period) => {
    let hour = parseInt(h);
    if (period) {
      if ((period === '下午' || period === '晚上') && hour < 12) hour += 12;
      else if (period === '凌晨' && hour === 12) hour = 0;
      else if (period === '中午' && hour === 12) hour = 12;
    }
    return hour;
  };

  // 1. Daily: "每天 9:00", "每天晚上9點"
  let match = normalized.match(/每天\s*(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})[:：點](\d{1,2})?/);
  if (match) {
    const period = match[1];
    const hour = getHour(match[2], period);
    const minute = match[3] ? parseInt(match[3]) : 0;
    
    nextRun.setHours(hour, minute, 0, 0);
    if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
    return { nextRun, frequency: 'DAILY' };
  }

  // 2. Weekly: "每週五 9:00", "每週五晚上9點"
  match = normalized.match(/每(週|禮拜)(\d)\s*(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})[:：點](\d{1,2})?/);
  if (match) {
    const targetDay = parseInt(match[2]) === 7 ? 0 : parseInt(match[2]);
    const period = match[3];
    const hour = getHour(match[4], period);
    const minute = match[5] ? parseInt(match[5]) : 0;
    
    nextRun.setHours(hour, minute, 0, 0);
    
    let dayDiff = targetDay - now.getDay();
    if (dayDiff < 0 || (dayDiff === 0 && nextRun <= now)) {
      dayDiff += 7;
    }
    nextRun.setDate(now.getDate() + dayDiff);
    return { nextRun, frequency: 'WEEKLY' };
  }

  // 3. Monthly: "每月 5號 9:00"
  match = normalized.match(/每月\s*(\d{1,2})[號日]\s*(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})[:：點](\d{1,2})?/);
  if (match) {
    nextRun.setDate(parseInt(match[1]));
    
    const period = match[2];
    const hour = getHour(match[3], period);
    const minute = match[4] ? parseInt(match[4]) : 0;
    
    nextRun.setHours(hour, minute, 0, 0);
    if (nextRun <= now) nextRun.setMonth(nextRun.getMonth() + 1);
    return { nextRun, frequency: 'MONTHLY' };
  }

  // 4. One-time Parsing
  let timeMatch = normalized.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})[:：點](\d{1,2})?/);
  let hour = 9, minute = 0;
  
  if (timeMatch) {
    hour = getHour(timeMatch[2], timeMatch[1]);
    minute = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
    nextRun.setHours(hour, minute, 0, 0);
  } else {
    nextRun.setHours(9, 0, 0, 0); 
  }

  // Extract Date part
  if (normalized.includes('大後天')) { 
     nextRun.setDate(now.getDate() + 3); 
  } else if (normalized.includes('後天')) { 
     nextRun.setDate(now.getDate() + 2); 
  } else if (normalized.includes('明天')) { 
     nextRun.setDate(now.getDate() + 1); 
  } else if (normalized.includes('今天')) {
     // do nothing to date
  } else {
    // Specific Date: "5月20日", "下禮拜三"
    let weekMatch = normalized.match(/下(週|禮拜)(\d)/);
    if (weekMatch) {
      const targetWD = parseInt(weekMatch[2]) === 7 ? 0 : parseInt(weekMatch[2]);
      nextRun.setDate(now.getDate() + 7);
      let currentWD = nextRun.getDay();
      let diff = targetWD - currentWD;
      nextRun.setDate(nextRun.getDate() + diff);
    } 
    else {
      let dateMatch = normalized.match(/(\d{1,2})月(\d{1,2})[號日]/);
      if (dateMatch) {
        nextRun.setMonth(parseInt(dateMatch[1]) - 1);
        nextRun.setDate(parseInt(dateMatch[2]));
        if (nextRun < now) nextRun.setFullYear(nextRun.getFullYear() + 1);
      } else {
        if (input.match(/(\d{1,2})[:：點]/) && !input.match(/月|週|禮拜|天|號/)) {
            let tempRun = new Date(); // now
            tempRun.setHours(hour, minute, 0, 0);
            if (tempRun <= now) {
                tempRun.setDate(tempRun.getDate() + 1);
            }
            nextRun = tempRun;
        } else {
             if (!timeMatch && !input.match(/明天|後天/)) return null; 
        }
      }
    }
  }

  return { nextRun, frequency: 'ONCE' };
}

function extractContent(text) {
  let s = text;
  
  // Helper Regex Part
  const num = '[0-9一二兩三四五六七八九十]+';
  
  // 1. Recurrent Patterns (Daily/Weekly/Monthly)
  // Concatenate strings to avoid Template Literal issues
  const p1 = '每(天|週|禮拜|月)(' + num + ')?\\s*(凌晨|早上|上午|中午|下午|晚上)?\\s*(' + num + ')[:：點](' + num + '(分)?|半)?';
  const reRecurrent = new RegExp(p1, 'g');
  s = s.replace(reRecurrent, '');
  
  // 2. Relative Days + Time
  const p2 = '(今天|明天|後天|大後天)\\s*(凌晨|早上|上午|中午|下午|晚上)?\\s*(' + num + ')[:：點](' + num + '(分)?|半)?';
  const reRelative = new RegExp(p2, 'g');
  s = s.replace(reRelative, '');
  
  // 3. Just Time (if leftovers)
  const p3 = '(凌晨|早上|上午|中午|下午|晚上)\\s*(' + num + ')[:：點](' + num + '(分)?|半)?';
  const reTime = new RegExp(p3, 'g');
  s = s.replace(reTime, '');
  
  // 4. Specific Dates
  // "5月20號", "五月五日"
  const p4 = num + '月' + num + '[號日]';
  const reDate = new RegExp(p4, 'g');
  s = s.replace(reDate, '');
  
  // 5. Standalone Minutes (Fix for "十四分", "十五分")
  // Sometimes users say "9點 十四分" or just "十四分" if implied
  // We need to be careful not to delete "十分滿意" (very satisfied)
  // But usually in reminder context "num + 分" is time.
  // Let's match if it's strictly num + 分
  const p5 = '(' + num + ')分'; 
  const reMinute = new RegExp(p5, 'g');
  s = s.replace(reMinute, '');

  // 6. Standalone Time (e.g. "3點", "10:30" without period)
  const p6 = '(' + num + ')[:：點](' + num + '(分)?|半)?';
  const reStandaloneTime = new RegExp(p6, 'g');
  s = s.replace(reStandaloneTime, '');
  
  // Clean up
  return s.replace(/\s+/g, ' ').trim();
}


// ==========================================
// 3. Flex Message Builders
// ==========================================

function createHelpFlex() {
  const capabilities = getAvailableCapabilities();
  const buttons = [
    createButton("🔔 新增提醒 (要記得)", "要記得")
  ];

  if (capabilities.ideaCapture) {
    buttons.push(createButton("📝 記錄想法 (要記錄)", "要記錄"));
  }

  if (capabilities.exportRecords) {
    buttons.push(createButton("📦 匯出記錄", "匯出記錄 markdown"));
  }

  if (capabilities.feedback) {
    buttons.push(createButton("💬 提供反饋 (要反饋)", "要反饋"));
  }

  buttons.push(createButton("👀 查詢/取消", "查詢"));
  buttons.push(createButton("❓ 說明", "help"));

  return {
    "type": "bubble",
    "size": "giga",
    "header": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        { "type": "text", "text": `🤖 ${CONFIG.BOT_NAME}`, "weight": "bold", "size": "xl", "color": "#ffffff" }
      ],
      "backgroundColor": "#2c3e50",
      "paddingAll": "20px"
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "請選擇功能：",
          "weight": "bold",
          "size": "md",
          "margin": "md"
        },
      ].concat(buttons),
      "spacing": "md",
      "paddingAll": "20px"
    }
  };
}

function createButton(label, text) {
  return {
    "type": "button",
    "action": {
      "type": "message",
      "label": label,
      "text": text
    },
    "style": "secondary",
    "height": "sm"
  };
}

const CATEGORY_COLORS = {
  'work': '#3498db',
  'health': '#27ae60',
  'personal': '#9b59b6',
  'shopping': '#f39c12',
  'meeting': '#e74c3c',
  'other': '#95a5a6'
};

const CATEGORY_ICONS = {
  'work': '💼',
  'health': '🏥',
  'personal': '👤',
  'shopping': '🛒',
  'meeting': '📅',
  'other': '📌'
};

function getCategoryInfo(category) {
  return {
    color: CATEGORY_COLORS[category] || CATEGORY_COLORS['other'],
    icon: CATEGORY_ICONS[category] || CATEGORY_ICONS['other']
  };
}

function createReminderListFlex(reminders) {
  if (!reminders || reminders.length === 0) {
      return { type: "text", text: "目前沒有待辦事項喔！✨" };
  }

  const bubbles = reminders.map(r => {
    const catInfo = getCategoryInfo(r.category || 'other');
    return {
      "type": "bubble",
      "size": "micro",
      "header": {
        "type": "box",
        "layout": "vertical",
        "backgroundColor": catInfo.color,
        "contents": [
          { "type": "text", "text": r.dateStr, "color": "#ffffff", "size": "xs" }
        ]
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          { "type": "text", "text": `${catInfo.icon} ${r.content}`, "weight": "bold", "wrap": true, "size": "sm" }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "horizontal",
        "contents": [
             {
                "type": "button",
                "action": {
                  "type": "message",
                  "label": "完成",
                  "text": `完成 #${r.id}` 
                },
                "height": "sm",
                "style": "link",
                "color": "#27ae60"
             },
             {
                "type": "button",
                "action": {
                  "type": "message",
                  "label": "延後",
                  "text": `延後 #${r.id}` 
                },
                "height": "sm",
                "style": "link",
                "color": "#f39c12"
             },
             {
                "type": "button",
                "action": {
                  "type": "message",
                  "label": "取消",
                  "text": `取消 #${r.id}` 
                },
                "height": "sm",
                "style": "link",
                "color": "#e74c3c"
             }
        ]
      }
    };
  });

  return {
    "type": "carousel",
    "contents": bubbles
  };
}

function createConfirmFlex(details) {
    const catInfo = getCategoryInfo(details.category || 'other');
    const extraDetails = [];
    if (details.maxRuns && details.maxRuns > 0 && details.freq !== '單次') {
      extraDetails.push({
        "type": "text",
        "text": `🔢 單一事件提醒上限：${details.maxRuns} 次`,
        "size": "sm"
      });
    }
    if (details.planCode) {
      extraDetails.push({
        "type": "text",
        "text": `🪪 方案：${details.planCode}`,
        "size": "sm"
      });
    }

    return {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          { "type": "text", "text": "✅ 提醒已設定", "weight": "bold", "size": "xl", "color": "#27ae60" },
          { "type": "separator", "margin": "md" },
          { "type": "box", "layout": "vertical", "margin": "md", "spacing": "sm", "contents": [
              { "type": "text", "text": `📅 時間：${details.timeStr}`, "size": "sm" },
              { "type": "text", "text": `🔁 頻率：${details.freq}`, "size": "sm" },
              { "type": "text", "text": `${catInfo.icon} 分類：${details.category}`, "size": "sm", "color": catInfo.color },
              { "type": "text", "text": `👤 對象：${details.targetName}`, "size": "sm" },
              { "type": "text", "text": `📝 內容：${details.content}`, "size": "sm", "wrap": true }
            ].concat(extraDetails)
          }
        ]
      }
    };
}

function createTriggerFlex(content, timeStr) {
    return {
      "type": "bubble",
      "size": "mega",
      "header": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          { "type": "text", "text": "🔔 提醒時間到！", "weight": "bold", "color": "#ffffff", "size": "lg" }
        ],
        "backgroundColor": "#e74c3c", // Red for urgency
        "paddingAll": "15px"
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          { "type": "text", "text": content, "weight": "bold", "size": "xl", "wrap": true, "color": "#2c3e50" },
          { "type": "separator", "margin": "lg" },
          { "type": "box", "layout": "baseline", "margin": "md", "contents": [
              { "type": "icon", "url": "https://scdn.line-apps.com/n/channel_devcenter/img/fx/time.png", "size": "sm", "offsetTop": "xs" },
              { "type": "text", "text": timeStr, "size": "sm", "color": "#7f8c8d", "margin": "md" }
            ]
          }
        ],
        "paddingAll": "20px"
      }
    };
}
