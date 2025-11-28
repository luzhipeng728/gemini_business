/**
 * 用户管理 API
 */

const { User, ApiKey } = require('../../models');

async function userRoutes(fastify, options) {
  fastify.addHook('preHandler', fastify.authenticateAdmin);

  /**
   * 获取用户列表
   * GET /admin/users
   */
  fastify.get('/users', async (request, reply) => {
    const users = await User.findAll({
      orderBy: 'id ASC'
    });
    return { users };
  });

  /**
   * 获取单个用户
   * GET /admin/users/:id
   */
  fastify.get('/users/:id', async (request, reply) => {
    const { id } = request.params;
    const user = await User.findById(parseInt(id));

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return user;
  });

  /**
   * 创建用户
   * POST /admin/users
   */
  fastify.post('/users', async (request, reply) => {
    const { username, email, password, is_admin } = request.body;

    if (!username || !password) {
      return reply.status(400).send({ error: 'username and password are required' });
    }

    // 检查用户名是否已存在
    const existing = await User.findOne({ username });
    if (existing) {
      return reply.status(409).send({ error: 'Username already exists' });
    }

    const user = await User.create({
      username,
      email,
      password,
      is_admin: is_admin || false
    });

    return reply.status(201).send(user);
  });

  /**
   * 更新用户
   * PUT /admin/users/:id
   */
  fastify.put('/users/:id', async (request, reply) => {
    const { id } = request.params;
    const { email, password, is_admin, is_active } = request.body;

    const updates = {};
    if (email !== undefined) updates.email = email;
    if (password) updates.password = password;
    if (is_admin !== undefined) updates.is_admin = is_admin;
    if (is_active !== undefined) updates.is_active = is_active;

    const success = await User.update(parseInt(id), updates);

    if (!success) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return { message: 'User updated' };
  });

  /**
   * 删除用户
   * DELETE /admin/users/:id
   */
  fastify.delete('/users/:id', async (request, reply) => {
    const { id } = request.params;
    const success = await User.delete(parseInt(id));

    if (!success) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return { message: 'User deleted' };
  });

  // =============== API Keys ===============

  /**
   * 获取用户的 API Keys
   * GET /admin/users/:id/api-keys
   */
  fastify.get('/users/:id/api-keys', async (request, reply) => {
    const { id } = request.params;
    const keys = await ApiKey.getUserKeys(parseInt(id));
    return { api_keys: keys };
  });

  /**
   * 创建 API Key
   * POST /admin/users/:id/api-keys
   */
  fastify.post('/users/:id/api-keys', async (request, reply) => {
    const { id } = request.params;
    const { name, rate_limit, daily_limit, expires_at } = request.body;

    const user = await User.findById(parseInt(id));
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const apiKey = await ApiKey.create({
      user_id: parseInt(id),
      name,
      rate_limit,
      daily_limit,
      expires_at
    });

    return reply.status(201).send(apiKey);
  });

  /**
   * 更新 API Key
   * PUT /admin/api-keys/:id
   */
  fastify.put('/api-keys/:id', async (request, reply) => {
    const { id } = request.params;
    const { name, is_active, rate_limit, daily_limit, expires_at } = request.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (is_active !== undefined) updates.is_active = is_active;
    if (rate_limit !== undefined) updates.rate_limit = rate_limit;
    if (daily_limit !== undefined) updates.daily_limit = daily_limit;
    if (expires_at !== undefined) updates.expires_at = expires_at;

    const success = await ApiKey.update(parseInt(id), updates);

    if (!success) {
      return reply.status(404).send({ error: 'API key not found' });
    }

    return { message: 'API key updated' };
  });

  /**
   * 删除 API Key
   * DELETE /admin/api-keys/:id
   */
  fastify.delete('/api-keys/:id', async (request, reply) => {
    const { id } = request.params;
    const success = await ApiKey.delete(parseInt(id));

    if (!success) {
      return reply.status(404).send({ error: 'API key not found' });
    }

    return { message: 'API key deleted' };
  });

  /**
   * 重新生成 API Key
   * POST /admin/api-keys/:id/regenerate
   */
  fastify.post('/api-keys/:id/regenerate', async (request, reply) => {
    const { id } = request.params;
    const newKey = await ApiKey.regenerate(parseInt(id));
    return { api_key: newKey };
  });
}

module.exports = userRoutes;
