/**
 * CLAUDE API CLIENT
 * 使用 Anthropic Claude API 进行对话
 * 模型: claude-sonnet-4-5-20250929 (默认)
 */

const ClaudeClient = {
  // 默认模型
  DEFAULT_MODEL: 'claude-sonnet-4-5-20250929',
  
  // 可用模型
  MODELS: {
    SONNET: 'claude-sonnet-4-5-20250929',
    OPUS: 'claude-opus-4-5-20250929',
    HAIKU: 'claude-haiku-3-5-20250929'
  },

  /**
   * 发送消息给 Claude 并获取回复
   * @param {string} message - 用户消息
   * @param {Object} options - 选项
   * @param {string} options.model - 模型名称
   * @param {number} options.maxTokens - 最大 tokens
   * @param {Array} options.history - 对话历史 [{role: 'user'|'assistant', content: '...'}]
   * @returns {string} Claude 的回复
   */
  chat: function(message, options = {}) {
    const apiKey = CONFIG.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.log('Claude API key not configured');
      return '抱歉，Claude API 尚未設定。請聯絡管理員。';
    }

    const model = options.model || this.DEFAULT_MODEL;
    const maxTokens = options.maxTokens || 4096;
    const history = options.history || [];

    const url = 'https://api.anthropic.com/v1/messages';
    
    // 构建消息数组
    const messages = [
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    const payload = {
      model: model,
      max_tokens: maxTokens,
      messages: messages
    };

    const options_ = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      const response = UrlFetchApp.fetch(url, options_);
      const json = JSON.parse(response.getContentText());

      if (json.content && json.content[0]) {
        return json.content[0].text;
      }
      
      if (json.error) {
        console.error('Claude API Error:', json.error);
        return 'Claude API 發生錯誤：' + json.error.message;
      }
      
      return '無法解析 Claude 的回應';
    } catch (e) {
      console.error('Claude Request Error:', e);
      return '抱歉，發生錯誤：' + e.message;
    }
  },

  /**
   * 简单对话（无历史记录）
   * @param {string} message - 用户消息
   * @returns {string} Claude 的回复
   */
  say: function(message) {
    return this.chat(message);
  },

  /**
   * 流式对话（Google Apps Script 不支持真正的流式，
   * 此方法会返回完整响应）
   * @param {string} message - 用户消息
   * @param {Function} onChunk - 每次收到内容的回调（由于 GAS 限制，只会在最后调用一次）
   * @returns {string} Claude 的回复
   */
  stream: function(message, onChunk = null) {
    const response = this.chat(message);
    if (onChunk) {
      onChunk(response);
    }
    return response;
  }
};

// 导出（用于 Google Apps Script 模块化）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ClaudeClient };
}
