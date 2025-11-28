/**
 * Admin 路由汇总
 */

const providerRoutes = require('./providers');
const userRoutes = require('./users');
const statsRoutes = require('./stats');
const sessionRoutes = require('./sessions');
const logRoutes = require('./logs');

async function adminRoutes(fastify, options) {
  // 注册所有管理路由
  fastify.register(providerRoutes);
  fastify.register(userRoutes);
  fastify.register(statsRoutes);
  fastify.register(sessionRoutes);
  fastify.register(logRoutes);
}

module.exports = adminRoutes;
