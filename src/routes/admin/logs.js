/**
 * 日志 API
 */

const { RequestLog } = require('../../models');

async function logRoutes(fastify, options) {
  fastify.addHook('preHandler', fastify.authenticateAdmin);

  /**
   * 获取请求日志
   * GET /admin/logs
   */
  fastify.get('/logs', async (request, reply) => {
    const {
      user_id,
      provider_id,
      status_code,
      has_error,
      page = 1,
      limit = 100
    } = request.query;

    const db = require('../../config/database');
    let sql = `
      SELECT rl.*, u.username, p.name as provider_name
      FROM request_logs rl
      LEFT JOIN users u ON rl.user_id = u.id
      LEFT JOIN providers p ON rl.provider_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (user_id) {
      sql += ' AND rl.user_id = ?';
      params.push(parseInt(user_id));
    }

    if (provider_id) {
      sql += ' AND rl.provider_id = ?';
      params.push(parseInt(provider_id));
    }

    if (status_code) {
      sql += ' AND rl.status_code = ?';
      params.push(parseInt(status_code));
    }

    if (has_error === 'true') {
      sql += ' AND rl.error_message IS NOT NULL';
    }

    sql += ' ORDER BY rl.created_at DESC';
    sql += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const logs = await db.query(sql, params);

    return {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    };
  });

  /**
   * 获取最近错误
   * GET /admin/logs/errors
   */
  fastify.get('/logs/errors', async (request, reply) => {
    const { limit = 50 } = request.query;
    const errors = await RequestLog.getRecentErrors(parseInt(limit));
    return { errors };
  });

  /**
   * 清理旧日志
   * POST /admin/logs/cleanup
   */
  fastify.post('/logs/cleanup', async (request, reply) => {
    const { days = 30 } = request.body;
    const deleted = await RequestLog.cleanup(parseInt(days));
    return {
      message: 'Cleanup completed',
      deleted
    };
  });
}

module.exports = logRoutes;
