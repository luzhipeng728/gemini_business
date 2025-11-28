/**
 * 哈希工具
 * 用于会话匹配和 API Key 生成
 */

const crypto = require('crypto');

/**
 * 生成 MD5 哈希
 */
function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * 生成 SHA256 哈希
 */
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * 生成随机 API Key
 */
function generateApiKey(prefix = 'gm-') {
  const randomPart = crypto.randomBytes(24).toString('base64url');
  return prefix + randomPart;
}

/**
 * 生成随机字符串
 */
function randomString(length = 32) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

/**
 * 从消息内容提取文本
 */
function extractTextFromParts(parts) {
  if (!parts || !Array.isArray(parts)) return '';
  return parts
    .filter(p => p.text)
    .map(p => p.text)
    .join('\n');
}

/**
 * 生成会话匹配哈希（首尾锚定策略）
 * @param {Array} messages - Gemini 格式消息数组
 * @returns {Object} { headHash, tailHash }
 */
function generateSessionHashes(messages) {
  if (!messages || messages.length === 0) {
    const random = randomString(32);
    return { headHash: md5(random), tailHash: md5(random) };
  }

  // 只取用户消息
  const userMessages = messages.filter(m => m.role === 'user');

  if (userMessages.length === 0) {
    const random = randomString(32);
    return { headHash: md5(random), tailHash: md5(random) };
  }

  // 前 5 条用户消息
  const headMessages = userMessages.slice(0, 5);
  const headText = headMessages
    .map(m => extractTextFromParts(m.parts))
    .join('|||');
  const headHash = md5(headText);

  // 后 5 条用户消息
  const tailMessages = userMessages.slice(-5);
  const tailText = tailMessages
    .map(m => extractTextFromParts(m.parts))
    .join('|||');
  const tailHash = md5(tailText);

  return { headHash, tailHash };
}

/**
 * 获取最后一条消息文本
 */
function getLastMessageText(messages) {
  if (!messages || messages.length === 0) return '';
  const lastMsg = messages[messages.length - 1];
  return extractTextFromParts(lastMsg.parts);
}

module.exports = {
  md5,
  sha256,
  generateApiKey,
  randomString,
  extractTextFromParts,
  generateSessionHashes,
  getLastMessageText
};
