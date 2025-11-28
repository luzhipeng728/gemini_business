/**
 * 统计 API
 */

const { Provider, Session, RequestLog, User, ApiKey } = require('../../models');
const { healthChecker } = require('../../core');

async function statsRoutes(fastify, options) {
  fastify.addHook('preHandler', fastify.authenticateAdmin);

  /**
   * 总览统计
   * GET /admin/stats/overview
   */
  fastify.get('/stats/overview', async (request, reply) => {
    const [
      providerStats,
      sessionStats,
      requestStats24h,
      requestStats1h,
      userCount,
      apiKeyCount
    ] = await Promise.all([
      Provider.getStats(),
      Session.getStats(),
      RequestLog.getStats({ hours: 24 }),
      RequestLog.getStats({ hours: 1 }),
      User.count(),
      ApiKey.count({ is_active: 1 })
    ]);

    return {
      providers: providerStats,
      sessions: sessionStats,
      requests: {
        last_hour: requestStats1h,
        last_24_hours: requestStats24h
      },
      users: {
        total: userCount,
        active_api_keys: apiKeyCount
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }
    };
  });

  /**
   * Provider 统计
   * GET /admin/stats/providers
   */
  fastify.get('/stats/providers', async (request, reply) => {
    const stats = await Provider.getStats();

    // 获取各状态的 Provider 列表
    const db = require('../../config/database');
    const statusBreakdown = await db.query(`
      SELECT status, COUNT(*) as count, AVG(health_score) as avg_health
      FROM providers
      GROUP BY status
    `);

    // 获取负载最高的 Provider
    const topLoaded = await db.query(`
      SELECT id, name, current_load, max_concurrent,
             (current_load / max_concurrent * 100) as load_percentage
      FROM providers
      WHERE status = 'active'
      ORDER BY load_percentage DESC
      LIMIT 10
    `);

    // 获取失败率最高的 Provider
    const topFailing = await db.query(`
      SELECT id, name, total_requests, failed_requests,
             (failed_requests / total_requests * 100) as failure_rate
      FROM providers
      WHERE total_requests > 10
      ORDER BY failure_rate DESC
      LIMIT 10
    `);

    return {
      summary: stats,
      status_breakdown: statusBreakdown,
      top_loaded: topLoaded,
      top_failing: topFailing
    };
  });

  /**
   * 请求统计
   * GET /admin/stats/requests
   */
  fastify.get('/stats/requests', async (request, reply) => {
    const { hours = 24 } = request.query;

    const [overall, hourly] = await Promise.all([
      RequestLog.getStats({ hours: parseInt(hours) }),
      RequestLog.getHourlyStats(parseInt(hours))
    ]);

    return {
      overall,
      hourly
    };
  });

  /**
   * 错误统计
   * GET /admin/stats/errors
   */
  fastify.get('/stats/errors', async (request, reply) => {
    const { limit = 50 } = request.query;

    const recentErrors = await RequestLog.getRecentErrors(parseInt(limit));

    // 按错误类型分组
    const db = require('../../config/database');
    const errorBreakdown = await db.query(`
      SELECT
        SUBSTRING_INDEX(error_message, ':', 1) as error_type,
        COUNT(*) as count
      FROM request_logs
      WHERE error_message IS NOT NULL
        AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 20
    `);

    return {
      recent_errors: recentErrors,
      error_breakdown: errorBreakdown
    };
  });

  /**
   * 系统健康状态
   * GET /admin/stats/health
   */
  fastify.get('/stats/health', async (request, reply) => {
    return healthChecker.getHealthStatus();
  });
}

module.exports = statsRoutes;
