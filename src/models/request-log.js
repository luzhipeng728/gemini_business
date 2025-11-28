/**
 * Request Log 模型
 */

const BaseModel = require('./base');
const db = require('../config/database');

class RequestLog extends BaseModel {
  static tableName = 'request_logs';

  /**
   * 记录请求
   */
  static async log(data) {
    return this.create({
      user_id: data.userId,
      api_key_id: data.apiKeyId,
      provider_id: data.providerId,
      session_id: data.sessionId,
      model: data.model,
      request_type: data.requestType || 'generateContent',
      input_tokens: data.inputTokens || 0,
      output_tokens: data.outputTokens || 0,
      latency_ms: data.latencyMs || 0,
      status_code: data.statusCode || 200,
      error_message: data.errorMessage || null
    });
  }

  /**
   * 获取请求统计
   */
  static async getStats(options = {}) {
    const { hours = 24, userId = null, providerId = null } = options;

    let sql = `
      SELECT
        COUNT(*) as total_requests,
        SUM(status_code >= 200 AND status_code < 300) as success_count,
        SUM(status_code >= 400) as error_count,
        AVG(latency_ms) as avg_latency,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens
      FROM request_logs
      WHERE created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
    `;
    const params = [hours];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    if (providerId) {
      sql += ' AND provider_id = ?';
      params.push(providerId);
    }

    const stats = await db.queryOne(sql, params);

    return {
      totalRequests: stats.total_requests || 0,
      successCount: stats.success_count || 0,
      errorCount: stats.error_count || 0,
      successRate: stats.total_requests > 0
        ? ((stats.success_count / stats.total_requests) * 100).toFixed(2) + '%'
        : '100%',
      avgLatency: Math.round(stats.avg_latency || 0),
      totalInputTokens: stats.total_input_tokens || 0,
      totalOutputTokens: stats.total_output_tokens || 0
    };
  }

  /**
   * 获取每小时请求量
   */
  static async getHourlyStats(hours = 24) {
    return db.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') as hour,
        COUNT(*) as requests,
        SUM(status_code >= 400) as errors,
        AVG(latency_ms) as avg_latency
      FROM request_logs
      WHERE created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY hour
      ORDER BY hour
    `, [hours]);
  }

  /**
   * 获取最近的错误日志
   */
  static async getRecentErrors(limit = 20) {
    return db.query(`
      SELECT rl.*, u.username, p.name as provider_name
      FROM request_logs rl
      LEFT JOIN users u ON rl.user_id = u.id
      LEFT JOIN providers p ON rl.provider_id = p.id
      WHERE rl.error_message IS NOT NULL
      ORDER BY rl.created_at DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * 清理旧日志
   */
  static async cleanup(days = 30) {
    return db.update(`
      DELETE FROM request_logs
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [days]);
  }
}

module.exports = RequestLog;
