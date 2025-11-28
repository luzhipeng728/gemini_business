/**
 * API Key 模型
 */

const BaseModel = require('./base');
const db = require('../config/database');
const { generateApiKey } = require('../utils/hash');

class ApiKey extends BaseModel {
  static tableName = 'api_keys';

  /**
   * 创建 API Key
   */
  static async create(data) {
    const keyData = {
      user_id: data.user_id,
      api_key: data.api_key || generateApiKey(),
      name: data.name || 'Default Key',
      rate_limit: data.rate_limit || 60,
      daily_limit: data.daily_limit || 10000,
      expires_at: data.expires_at || null
    };

    return super.create(keyData);
  }

  /**
   * 验证 API Key
   */
  static async validate(apiKey) {
    const keyInfo = await db.queryOne(`
      SELECT ak.*, u.username, u.is_admin, u.is_active as user_active
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.api_key = ?
        AND ak.is_active = 1
        AND u.is_active = 1
        AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
    `, [apiKey]);

    if (!keyInfo) return null;

    // 检查日限额
    if (keyInfo.daily_usage >= keyInfo.daily_limit) {
      return { ...keyInfo, limitExceeded: true };
    }

    // 更新最后使用时间
    await db.update(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = ?',
      [keyInfo.id]
    );

    return keyInfo;
  }

  /**
   * 增加日使用量
   */
  static async incrementUsage(id) {
    return db.update(
      'UPDATE api_keys SET daily_usage = daily_usage + 1 WHERE id = ?',
      [id]
    );
  }

  /**
   * 重置所有日使用量（每日定时任务）
   */
  static async resetDailyUsage() {
    return db.update('UPDATE api_keys SET daily_usage = 0');
  }

  /**
   * 获取用户的 API Keys
   */
  static async getUserKeys(userId) {
    return this.findAll({
      where: { user_id: userId },
      orderBy: 'created_at DESC'
    });
  }

  /**
   * 重新生成 API Key
   */
  static async regenerate(id) {
    const newKey = generateApiKey();
    await this.update(id, { api_key: newKey });
    return newKey;
  }
}

module.exports = ApiKey;
