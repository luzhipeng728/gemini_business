/**
 * 数据库插件
 * 初始化数据库连接
 */

const fp = require('fastify-plugin');
const db = require('../config/database');

async function databasePlugin(fastify, options) {
  // 初始化数据库
  await db.initDatabase();

  // 装饰 fastify 实例
  fastify.decorate('db', db);

  // 关闭时清理连接
  fastify.addHook('onClose', async () => {
    await db.closeDatabase();
  });
}

module.exports = fp(databasePlugin, {
  name: 'database',
  dependencies: []
});
