/**
 * 健康检查路由
 */

const { healthChecker } = require('../core');
const db = require('../config/database');

async function healthRoutes(fastify, options) {
  /**
   * 基础健康检查
   * GET /health
   */
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  /**
   * 就绪检查（含数据库）
   * GET /ready
   */
  fastify.get('/ready', async (request, reply) => {
    const dbHealthy = await db.healthCheck();

    if (!dbHealthy) {
      return reply.status(503).send({
        status: 'error',
        database: 'disconnected'
      });
    }

    return {
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString()
    };
  });

  /**
   * 详细状态
   * GET /status
   */
  fastify.get('/status', async (request, reply) => {
    const status = await healthChecker.getHealthStatus();
    return status;
  });
}

module.exports = healthRoutes;
