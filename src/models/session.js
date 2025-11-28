/**
 * Session 模型
 * 管理 Gemini API 会话
 */

const BaseModel = require('./base');
const db = require('../config/database');
const config = require('../config');

class Session extends BaseModel {
  static tableName = 'sessions';

  /**
   * 查找匹配的会话（首尾锚定策略）
   * @param {number} userId - 用户ID
   * @param {string} headHash - 前5条消息哈希
   * @param {string} tailHash - 后5条消息哈希
   */
  static async findMatchingSession(userId, headHash, tailHash) {
    // 1. 尝试完全匹配
    let session = await db.queryOne(`
      SELECT s.*, p.status as provider_status
      FROM sessions s
      JOIN providers p ON s.provider_id = p.id
      WHERE s.user_id = ?
        AND s.context_hash_head = ?
        AND s.context_hash_tail = ?
        AND s.status = 'active'
        AND p.status = 'active'
      ORDER BY s.last_accessed_at DESC
      LIMIT 1
    `, [userId, headHash, tailHash]);

    if (session) {
      return { session, matchType: 'exact' };
    }

    // 2. 尝试 head 匹配（同一对话，消息增加了）
    session = await db.queryOne(`
      SELECT s.*, p.status as provider_status
      FROM sessions s
      JOIN providers p ON s.provider_id = p.id
      WHERE s.user_id = ?
        AND s.context_hash_head = ?
        AND s.status = 'active'
        AND p.status = 'active'
      ORDER BY s.last_accessed_at DESC
      LIMIT 1
    `, [userId, headHash]);

    if (session) {
      // 更新 tail hash
      await this.update(session.id, {
        context_hash_tail: tailHash,
        last_accessed_at: new Date()
      });
      return { session, matchType: 'head' };
    }

    return { session: null, matchType: 'none' };
  }

  /**
   * 创建新会话
   */
  static async createSession(data) {
    const {
      providerId,
      userId,
      headHash,
      tailHash,
      geminiSessionId = null
    } = data;

    // 检查用户会话数量限制
    if (userId) {
      const count = await this.count({
        user_id: userId,
        status: 'active'
      });

      if (count >= config.session.maxPerUser) {
        // 删除最旧的会话
        await db.update(`
          DELETE FROM sessions
          WHERE user_id = ? AND status = 'active'
          ORDER BY last_accessed_at ASC
          LIMIT 1
        `, [userId]);
      }
    }

    const expiresAt = new Date(Date.now() + config.session.ttl);

    return this.create({
      provider_id: providerId,
      user_id: userId,
      context_hash_head: headHash,
      context_hash_tail: tailHash,
      gemini_session_id: geminiSessionId,
      expires_at: expiresAt,
      status: 'active'
    });
  }

  /**
   * 更新 Gemini Session ID
   */
  static async updateGeminiSessionId(id, geminiSessionId) {
    return this.update(id, {
      gemini_session_id: geminiSessionId,
      last_accessed_at: new Date()
    });
  }

  /**
   * 增加消息计数
   */
  static async incrementMessageCount(id) {
    return db.update(`
      UPDATE sessions
      SET message_count = message_count + 1,
          last_accessed_at = NOW(),
          expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
      WHERE id = ?
    `, [config.session.ttl / 1000, id]);
  }

  /**
   * 触摸会话（延长过期时间）
   */
  static async touch(id) {
    const expiresAt = new Date(Date.now() + config.session.ttl);
    return this.update(id, {
      last_accessed_at: new Date(),
      expires_at: expiresAt
    });
  }

  /**
   * 迁移会话到新 Provider
   */
  static async migrateToProvider(sessionId, newProviderId) {
    // 标记旧会话为已迁移
    await this.update(sessionId, { status: 'migrated' });

    // 获取旧会话信息
    const oldSession = await this.findById(sessionId);
    if (!oldSession) return null;

    // 创建新会话
    return this.createSession({
      providerId: newProviderId,
      userId: oldSession.user_id,
      headHash: oldSession.context_hash_head,
      tailHash: oldSession.context_hash_tail
    });
  }

  /**
   * 清理过期会话
   */
  static async cleanupExpired() {
    return db.update(`
      DELETE FROM sessions
      WHERE expires_at < NOW()
        OR status IN ('expired', 'migrated')
    `);
  }

  /**
   * 获取会话统计
   */
  static async getStats() {
    const stats = await db.queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(status = 'active') as active,
        SUM(status = 'expired') as expired,
        SUM(status = 'migrated') as migrated,
        AVG(message_count) as avg_messages
      FROM sessions
    `);

    return {
      total: stats.total || 0,
      active: stats.active || 0,
      expired: stats.expired || 0,
      migrated: stats.migrated || 0,
      avgMessages: Math.round(stats.avg_messages || 0)
    };
  }

  /**
   * 获取用户的活跃会话
   */
  static async getUserSessions(userId) {
    return db.query(`
      SELECT s.*, p.name as provider_name
      FROM sessions s
      JOIN providers p ON s.provider_id = p.id
      WHERE s.user_id = ? AND s.status = 'active'
      ORDER BY s.last_accessed_at DESC
    `, [userId]);
  }
}

module.exports = Session;
