/**
 * 认证插件
 * API Key 验证
 */

const fp = require('fastify-plugin');
const { ApiKey } = require('../models');
const { AuthenticationError, RateLimitError } = require('../utils/errors');

async function authPlugin(fastify, options) {
  // 装饰请求对象
  fastify.decorateRequest('user', null);
  fastify.decorateRequest('apiKey', null);

  /**
   * API Key 认证钩子
   */
  fastify.decorate('authenticate', async function (request, reply) {
    // 从 header 或 query 获取 API Key
    let apiKey = request.headers['x-goog-api-key'];

    if (!apiKey && request.headers.authorization) {
      const auth = request.headers.authorization;
      if (auth.startsWith('Bearer ')) {
        apiKey = auth.slice(7);
      }
    }

    if (!apiKey && request.query.key) {
      apiKey = request.query.key;
    }

    if (!apiKey) {
      throw new AuthenticationError('API key required');
    }

    // 验证 API Key
    const keyInfo = await ApiKey.validate(apiKey);

    if (!keyInfo) {
      throw new AuthenticationError('Invalid API key');
    }

    if (keyInfo.limitExceeded) {
      throw new RateLimitError('Daily limit exceeded');
    }

    // 增加使用量
    await ApiKey.incrementUsage(keyInfo.id);

    // 设置请求上下文
    request.user = {
      id: keyInfo.user_id,
      username: keyInfo.username,
      isAdmin: keyInfo.is_admin
    };
    request.apiKey = {
      id: keyInfo.id,
      name: keyInfo.name
    };
  });

  /**
   * 管理员认证钩子
   */
  fastify.decorate('authenticateAdmin', async function (request, reply) {
    // 检查 Basic Auth
    const auth = request.headers.authorization;

    if (auth && auth.startsWith('Basic ')) {
      const base64 = auth.slice(6);
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      const [username, password] = decoded.split(':');

      const { User } = require('../models');
      const user = await User.authenticate(username, password);

      if (user && user.is_admin) {
        request.user = user;
        return;
      }
    }

    // 检查 Bearer Token (API Key)
    if (auth && auth.startsWith('Bearer ')) {
      const apiKey = auth.slice(7);
      const keyInfo = await ApiKey.validate(apiKey);

      if (keyInfo && keyInfo.is_admin) {
        request.user = {
          id: keyInfo.user_id,
          username: keyInfo.username,
          isAdmin: true
        };
        request.apiKey = { id: keyInfo.id };
        return;
      }
    }

    throw new AuthenticationError('Admin access required');
  });
}

module.exports = fp(authPlugin, {
  name: 'auth',
  dependencies: []
});
