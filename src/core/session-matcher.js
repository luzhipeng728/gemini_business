/**
 * 会话匹配器
 * 实现首尾锚定策略：前5条固定 + 最新5条动态
 */

const { Session } = require('../models');
const { generateSessionHashes } = require('../utils/hash');
const logger = require('../utils/logger');

class SessionMatcher {
  /**
   * 匹配或创建会话
   * @param {Object} options
   * @param {number} options.userId - 用户ID
   * @param {number} options.providerId - Provider ID（仅新建时使用）
   * @param {Array} options.messages - 消息数组
   * @returns {Promise<Object>} { session, isNew, matchType }
   */
  async matchOrCreate(options) {
    const { userId, providerId, messages } = options;

    // 生成首尾哈希
    const { headHash, tailHash } = generateSessionHashes(messages);

    logger.debug({
      userId,
      headHash: headHash.substring(0, 8),
      tailHash: tailHash.substring(0, 8),
      messageCount: messages.length
    }, 'Session matching');

    // 尝试匹配现有会话
    const { session, matchType } = await Session.findMatchingSession(
      userId,
      headHash,
      tailHash
    );

    if (session) {
      logger.info({
        sessionId: session.id,
        matchType,
        providerId: session.provider_id
      }, 'Session matched');

      return {
        session,
        isNew: false,
        matchType
      };
    }

    // 创建新会话
    if (!providerId) {
      throw new Error('Provider ID required for new session');
    }

    const newSession = await Session.createSession({
      providerId,
      userId,
      headHash,
      tailHash
    });

    logger.info({
      sessionId: newSession.id,
      providerId,
      headHash: headHash.substring(0, 8)
    }, 'New session created');

    return {
      session: newSession,
      isNew: true,
      matchType: 'new'
    };
  }

  /**
   * 更新会话的 Gemini Session ID
   */
  async updateGeminiSession(sessionId, geminiSessionId) {
    await Session.updateGeminiSessionId(sessionId, geminiSessionId);
  }

  /**
   * 记录消息（增加计数）
   */
  async recordMessage(sessionId) {
    await Session.incrementMessageCount(sessionId);
  }

  /**
   * 迁移会话到新 Provider
   */
  async migrateSession(sessionId, newProviderId) {
    return Session.migrateToProvider(sessionId, newProviderId);
  }

  /**
   * 清理过期会话
   */
  async cleanup() {
    const deleted = await Session.cleanupExpired();
    if (deleted > 0) {
      logger.info({ deleted }, 'Expired sessions cleaned up');
    }
    return deleted;
  }

  /**
   * 获取统计
   */
  async getStats() {
    return Session.getStats();
  }
}

module.exports = new SessionMatcher();
