/**
 * Fastify 应用配置
 */

const fastify = require('fastify');
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const fastifyStatic = require('@fastify/static');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const databasePlugin = require('./plugins/database');
const authPlugin = require('./plugins/auth');
const registerRoutes = require('./routes');
const { AppError } = require('./utils/errors');

async function buildApp() {
  // 创建 Fastify 实例
  const app = fastify({
    logger: {
      level: config.logger.level,
      transport: config.logger.pretty ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      } : undefined
    },
    trustProxy: true
  });

  // CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-goog-api-key'],
    credentials: true
  });

  // 限流
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    errorResponseBuilder: (request, context) => ({
      error: {
        code: 429,
        message: 'Rate limit exceeded',
        retryAfter: context.ttl
      }
    })
  });

  // 静态文件（管理后台）- 必须在路由之前注册
  const adminUiPath = path.join(__dirname, '../public');
  const fs = require('fs');
  if (fs.existsSync(adminUiPath)) {
    await app.register(fastifyStatic, {
      root: adminUiPath,
      prefix: '/',
      decorateReply: true,  // 启用 reply.sendFile
      wildcard: false  // 不使用通配符，让 API 路由优先
    });

    // SPA fallback - 处理 Vue Router 路由
    app.setNotFoundHandler((request, reply) => {
      // API 路由返回 JSON 错误
      if (request.url.startsWith('/admin/') ||
          request.url.startsWith('/v1beta/') ||
          request.url.startsWith('/health') ||
          request.url.startsWith('/ready') ||
          request.url.startsWith('/status')) {
        return reply.status(404).send({
          error: { code: 404, message: 'Not found' }
        });
      }
      // 其他路由返回 index.html (SPA)
      return reply.sendFile('index.html');
    });
  } else {
    logger.warn('Admin UI not found at ' + adminUiPath);
  }

  // 数据库插件
  await app.register(databasePlugin);

  // 认证插件
  await app.register(authPlugin);

  // 注册路由
  await app.register(registerRoutes);

  // 全局错误处理
  app.setErrorHandler((error, request, reply) => {
    logger.error({
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method
    }, 'Request error');

    // 自定义错误
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.statusCode,
          message: error.message,
          type: error.code
        }
      });
    }

    // 验证错误
    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 400,
          message: 'Validation error',
          details: error.validation
        }
      });
    }

    // 其他错误
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      error: {
        code: statusCode,
        message: config.server.env === 'production'
          ? 'Internal server error'
          : error.message
      }
    });
  });

  // 404 处理 - 如果没有 admin-ui，使用简单的 JSON 404
  if (!fs.existsSync(adminUiPath)) {
    app.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        error: {
          code: 404,
          message: `Route ${request.method} ${request.url} not found`
        }
      });
    });
  }

  return app;
}

module.exports = buildApp;
