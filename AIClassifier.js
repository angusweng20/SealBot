const AIClassifier = {
  CATEGORIES: ['work', 'health', 'personal', 'shopping', 'meeting', 'other'],
  
  classify: function(text, provider = 'claude') {
    if (!text || text.trim().length === 0) {
      return 'other';
    }
    
    const cacheKey = Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text + provider)
    );
    
    const cache = CacheService.getScriptCache();
    const cached = cache.get('cat_' + cacheKey);
    if (cached) {
      return cached;
    }
    
    const category = provider === 'claude' 
      ? this.classifyWithClaude(text) 
      : this.classifyWithAI(text);
    
    if (category && this.CATEGORIES.includes(category)) {
      cache.put('cat_' + cacheKey, category, 21600);
      return category;
    }
    
    return 'other';
  },
  
  classifyWithClaude: function(text) {
    const apiKey = CONFIG.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('Claude API key not configured');
      return this.classifyWithAI(text);
    }
    
    const url = 'https://api.anthropic.com/v1/messages';
    
    const payload = {
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        { 
          role: 'user', 
          content: '你是一個分類助手。請將輸入文字分類為：work, health, personal, shopping, meeting, other。僅回覆類別名稱，不要其他文字。輸入：' + text
        }
      ]
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    try {
      const response = UrlFetchApp.fetch(url, options);
      const json = JSON.parse(response.getContentText());
      
      if (json.content && json.content[0]) {
        const result = json.content[0].text.trim().toLowerCase();
        return this.CATEGORIES.includes(result) ? result : 'other';
      }
    } catch (e) {
      console.error('Claude Classification Error:', e);
    }
    
    return 'other';
  },
  
  classifyWithAI: function(text) {
    const apiKey = CONFIG.OPENAI_API_KEY;
    if (!apiKey) {
      console.log('OpenAI API key not configured');
      return 'other';
    }
    
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: '你是一個分類助手。請將輸入文字分類為：work, health, personal, shopping, meeting, other。僅回傳 JSON 格式：{"category": "類別"}' 
        },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' },
      temperature: 0
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    try {
      const response = UrlFetchApp.fetch(url, options);
      const json = JSON.parse(response.getContentText());
      
      if (json.choices && json.choices[0]) {
        const result = JSON.parse(json.choices[0].message.content);
        return result.category;
      }
    } catch (e) {
      console.error('AI Classification Error:', e);
    }
    
    return 'other';
  }
};
