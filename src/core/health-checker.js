/**
 * 健康检查管理器
 * 定时清理过期会话、恢复冷却 Provider
 */

const { Provider, Session, RequestLog, ApiKey } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');

class HealthChecker {
  constructor() {
    this.timers = [];
  }

  /**
   * 启动所有定时任务
   */
  start() {
    // 会话清理（每5分钟）
    this.timers.push(setInterval(async () => {
      try {
        const deleted = await Session.cleanupExpired();
        if (deleted > 0) {
          logger.info({ deleted }, 'Expired sessions cleaned');
        }
      } catch (error) {
        logger.error({ error: error.message }, 'Session cleanup failed');
      }
    }, config.session.cleanupInterval));

    // Provider 恢复（每分钟）
    this.timers.push(setInterval(async () => {
      try {
        const recovered = await Provider.recoverCoolingProviders();
        if (recovered > 0) {
          logger.info({ recovered }, 'Providers recovered');
        }
      } catch (error) {
        logger.error({ error: error.message }, 'Provider recovery failed');
      }
    }, 60000));

    // 日志清理（每天凌晨）
    this.scheduleDaily(3, 0, async () => {
      try {
        const deleted = await RequestLog.cleanup(30);
        logger.info({ deleted }, 'Old logs cleaned');
      } catch (error) {
        logger.error({ error: error.message }, 'Log cleanup failed');
      }
    });

    // API Key 日使用量重置（每天凌晨）
    this.scheduleDaily(0, 0, async () => {
      try {
        await ApiKey.resetDailyUsage();
        logger.info('Daily API key usage reset');
      } catch (error) {
        logger.error({ error: error.message }, 'API key reset failed');
      }
    });

    logger.info('Health checker started');
  }

  /**
   * 调度每日任务
   */
  scheduleDaily(hour, minute, callback) {
    const now = new Date();
    let next = new Date(now);
    next.setHours(hour, minute, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    const delay = next - now;

    setTimeout(() => {
      callback();
      // 设置每24小时执行
      this.timers.push(setInterval(callback, 24 * 60 * 60 * 1000));
    }, delay);
  }

  /**
   * 停止所有定时任务
   */
  stop() {
    for (const timer of this.timers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
    this.timers = [];
    logger.info('Health checker stopped');
  }

  /**
   * 获取系统健康状态
   */
  async getHealthStatus() {
    const db = require('../config/database');

    const [providerStats, sessionStats, requestStats] = await Promise.all([
      Provider.getStats(),
      Session.getStats(),
      RequestLog.getStats({ hours: 1 })
    ]);

    const dbHealthy = await db.healthCheck();

    return {
      status: dbHealthy && providerStats.active > 0 ? 'healthy' : 'degraded',
      database: dbHealthy ? 'connected' : 'disconnected',
      providers: providerStats,
      sessions: sessionStats,
      requests: requestStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new HealthChecker();
