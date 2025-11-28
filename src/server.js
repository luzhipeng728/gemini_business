/**
 * 服务启动入口
 */

const buildApp = require('./app');
const config = require('./config');
const { healthChecker, providerScheduler } = require('./core');
const logger = require('./utils/logger');

async function start() {
  let app;

  try {
    // 构建应用
    app = await buildApp();

    // 启动健康检查器
    healthChecker.start();

    // 启动 Provider 调度器
    providerScheduler.start();

    // 启动服务
    await app.listen({
      port: config.server.port,
      host: config.server.host
    });

    logger.info({
      port: config.server.port,
      env: config.server.env
    }, '🚀 Gemini API Gateway started');

    // 打印可用端点
    console.log('\n========================================');
    console.log('Available endpoints:');
    console.log('  Health:  GET  /health');
    console.log('  Status:  GET  /status');
    console.log('  Models:  GET  /v1beta/models');
    console.log('  Chat:    POST /v1beta/models/{model}:generateContent');
    console.log('  Stream:  POST /v1beta/models/{model}:streamGenerateContent');
    console.log('  Admin:   GET  /admin/stats/overview');
    console.log('========================================\n');

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to start server');
    console.error(error);
    process.exit(1);
  }

  // 优雅关闭
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down...');

    try {
      healthChecker.stop();
      providerScheduler.stop();

      if (app) {
        await app.close();
      }

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error: error.message }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// 运行
start();
