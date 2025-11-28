/**
 * 路由注册
 */

const geminiRoutes = require('./gemini');
const healthRoutes = require('./health');
const adminRoutes = require('./admin');

async function registerRoutes(fastify) {
  // 健康检查（无需认证）
  fastify.register(healthRoutes);

  // Gemini API
  fastify.register(geminiRoutes);

  // 管理 API
  fastify.register(adminRoutes, { prefix: '/admin' });
}

module.exports = registerRoutes;
