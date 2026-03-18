function debugMention() {
  // 1. 設定您的 User ID (從 Google Sheet 'Members' 複製 'U' 開頭的那串 ID)
  // 如果您不知道，可以在這裡填入您的 ID
  const targetUserId = 'YOUR_USER_ID_HERE'; 
  
  // 2. 設定您的 Channel Access Token
  const token = PropertiesService.getScriptProperties().getProperty('CHANNEL_ACCESS_TOKEN');
  
  if (!targetUserId || targetUserId === 'YOUR_USER_ID_HERE') {
    Logger.log('❌ 請先在此檔案第 4 行填入您的 User ID');
    return;
  }
  
  // 3. 建構測試訊息
  // 測試情境：直接對這個 ID 發送一個帶有標記的訊息
  // 注意：如果是 1對1 聊天可能有字串顯示問題，但在 API 層面我們測試 "Push" 是否成功
  
  const text = "Hello @User !";
  // Index: "Hello " is 6 chars. "@" is at index 6. 
  // "User" is length 4. 
  // Total length of mention: 1 ("@") + 4 ("User") = 5.
  
  const mentionObj = {
    index: 6,
    length: 5,
    userId: targetUserId
  };
  
  const payload = {
    to: targetUserId,
    messages: [{
      type: 'text',
      text: text,
      mention: {
        mentionees: [mentionObj]
      }
    }]
  };
  
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  Logger.log('🚀 Sending payload: ' + JSON.stringify(payload));
  
  try {
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', options);
    Logger.log('✅ Response Code: ' + response.getResponseCode());
    Logger.log('✅ Response Body: ' + response.getContentText());
  } catch (e) {
    Logger.log('❌ Error: ' + e.toString());
  }
}
