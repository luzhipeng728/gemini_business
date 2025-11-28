/**
 * Provider 管理 API
 */

const { Provider, ProviderGroup } = require('../../models');

async function providerRoutes(fastify, options) {
  // 所有管理 API 需要管理员权限
  fastify.addHook('preHandler', fastify.authenticateAdmin);

  /**
   * 获取 Provider 列表
   * GET /admin/providers
   */
  fastify.get('/providers', async (request, reply) => {
    const { status, group_id, page = 1, limit = 50 } = request.query;

    const where = {};
    if (status) where.status = status;
    if (group_id) where.group_id = parseInt(group_id);

    const providers = await Provider.findAll({
      where,
      orderBy: ['status ASC', 'health_score DESC', 'id ASC'],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await Provider.count(where);

    // 隐藏敏感数据
    const safeProviders = providers.map(p => ({
      ...p,
      cookies: '[HIDDEN]',
      csesidx: p.csesidx?.substring(0, 10) + '...'
    }));

    return {
      providers: safeProviders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  });

  /**
   * 获取单个 Provider
   * GET /admin/providers/:id
   */
  fastify.get('/providers/:id', async (request, reply) => {
    const { id } = request.params;
    const provider = await Provider.findById(parseInt(id));

    if (!provider) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    return provider;
  });

  /**
   * 创建 Provider
   * POST /admin/providers
   */
  fastify.post('/providers', async (request, reply) => {
    const { name, group_id, cookies, csesidx, max_concurrent } = request.body;

    if (!cookies || !csesidx) {
      return reply.status(400).send({ error: 'cookies and csesidx are required' });
    }

    const provider = await Provider.create({
      name: name || `Provider-${Date.now()}`,
      group_id: group_id || null,
      cookies,
      csesidx,
      max_concurrent: max_concurrent || 10
    });

    return reply.status(201).send(provider);
  });

  /**
   * 批量导入 Provider
   * POST /admin/providers/batch
   */
  fastify.post('/providers/batch', async (request, reply) => {
    const { providers } = request.body;

    if (!Array.isArray(providers) || providers.length === 0) {
      return reply.status(400).send({ error: 'providers array is required' });
    }

    const results = await Provider.bulkImport(providers);
    return results;
  });

  /**
   * 更新 Provider
   * PUT /admin/providers/:id
   */
  fastify.put('/providers/:id', async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;

    const success = await Provider.update(parseInt(id), updates);

    if (!success) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    return { message: 'Provider updated' };
  });

  /**
   * 删除 Provider
   * DELETE /admin/providers/:id
   */
  fastify.delete('/providers/:id', async (request, reply) => {
    const { id } = request.params;
    const success = await Provider.delete(parseInt(id));

    if (!success) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    return { message: 'Provider deleted' };
  });

  /**
   * 激活 Provider
   * POST /admin/providers/:id/activate
   */
  fastify.post('/providers/:id/activate', async (request, reply) => {
    const { id } = request.params;
    await Provider.update(parseInt(id), {
      status: 'active',
      consecutive_failures: 0,
      health_score: 50
    });
    return { message: 'Provider activated' };
  });

  /**
   * 停用 Provider
   * POST /admin/providers/:id/deactivate
   */
  fastify.post('/providers/:id/deactivate', async (request, reply) => {
    const { id } = request.params;
    await Provider.update(parseInt(id), { status: 'inactive' });
    return { message: 'Provider deactivated' };
  });

  /**
   * 获取 Provider 统计
   * GET /admin/providers/:id/stats
   */
  fastify.get('/providers/:id/stats', async (request, reply) => {
    const { id } = request.params;
    const provider = await Provider.findById(parseInt(id));

    if (!provider) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    const successRate = provider.total_requests > 0
      ? ((provider.total_requests - provider.failed_requests) / provider.total_requests * 100).toFixed(2)
      : 100;

    return {
      id: provider.id,
      name: provider.name,
      status: provider.status,
      health_score: provider.health_score,
      current_load: provider.current_load,
      max_concurrent: provider.max_concurrent,
      load_percentage: (provider.current_load / provider.max_concurrent * 100).toFixed(1) + '%',
      total_requests: provider.total_requests,
      failed_requests: provider.failed_requests,
      success_rate: successRate + '%',
      consecutive_failures: provider.consecutive_failures,
      last_success_at: provider.last_success_at,
      last_failure_at: provider.last_failure_at
    };
  });

  // =============== Provider Groups ===============

  /**
   * 获取分组列表
   * GET /admin/provider-groups
   */
  fastify.get('/provider-groups', async (request, reply) => {
    const groups = await ProviderGroup.getGroupsWithCount();
    return { groups };
  });

  /**
   * 创建分组
   * POST /admin/provider-groups
   */
  fastify.post('/provider-groups', async (request, reply) => {
    const { name, description, region, priority } = request.body;

    if (!name) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const group = await ProviderGroup.create({
      name,
      description,
      region,
      priority: priority || 0
    });

    return reply.status(201).send(group);
  });

  /**
   * 更新分组
   * PUT /admin/provider-groups/:id
   */
  fastify.put('/provider-groups/:id', async (request, reply) => {
    const { id } = request.params;
    const success = await ProviderGroup.update(parseInt(id), request.body);

    if (!success) {
      return reply.status(404).send({ error: 'Group not found' });
    }

    return { message: 'Group updated' };
  });

  /**
   * 删除分组
   * DELETE /admin/provider-groups/:id
   */
  fastify.delete('/provider-groups/:id', async (request, reply) => {
    const { id } = request.params;
    const success = await ProviderGroup.delete(parseInt(id));

    if (!success) {
      return reply.status(404).send({ error: 'Group not found' });
    }

    return { message: 'Group deleted' };
  });
}

module.exports = providerRoutes;
