/**
 * 会话管理 API
 */

const { Session } = require('../../models');

async function sessionRoutes(fastify, options) {
  fastify.addHook('preHandler', fastify.authenticateAdmin);

  /**
   * 获取会话列表
   * GET /admin/sessions
   */
  fastify.get('/sessions', async (request, reply) => {
    const { status = 'active', user_id, provider_id, page = 1, limit = 50 } = request.query;

    const db = require('../../config/database');
    let sql = `
      SELECT s.*, p.name as provider_name, u.username
      FROM sessions s
      LEFT JOIN providers p ON s.provider_id = p.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }

    if (user_id) {
      sql += ' AND s.user_id = ?';
      params.push(parseInt(user_id));
    }

    if (provider_id) {
      sql += ' AND s.provider_id = ?';
      params.push(parseInt(provider_id));
    }

    sql += ' ORDER BY s.last_accessed_at DESC';
    sql += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const sessions = await db.query(sql, params);

    // 获取总数
    const [{ count }] = await db.query(`
      SELECT COUNT(*) as count FROM sessions WHERE status = ?
    `, [status || 'active']);

    return {
      sessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      }
    };
  });

  /**
   * 获取单个会话
   * GET /admin/sessions/:id
   */
  fastify.get('/sessions/:id', async (request, reply) => {
    const { id } = request.params;
    const session = await Session.findById(parseInt(id));

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return session;
  });

  /**
   * 删除会话
   * DELETE /admin/sessions/:id
   */
  fastify.delete('/sessions/:id', async (request, reply) => {
    const { id } = request.params;
    const success = await Session.delete(parseInt(id));

    if (!success) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return { message: 'Session deleted' };
  });

  /**
   * 清理过期会话
   * POST /admin/sessions/cleanup
   */
  fastify.post('/sessions/cleanup', async (request, reply) => {
    const deleted = await Session.cleanupExpired();
    return {
      message: 'Cleanup completed',
      deleted
    };
  });

  /**
   * 获取会话统计
   * GET /admin/sessions/stats
   */
  fastify.get('/sessions/stats', async (request, reply) => {
    const stats = await Session.getStats();
    return stats;
  });
}

module.exports = sessionRoutes;
