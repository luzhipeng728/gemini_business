/**
 * Gemini API 路由
 * 实现 Gemini 官方 API 格式
 */

const { requestExecutor } = require('../core');

async function geminiRoutes(fastify, options) {
  // 所有 Gemini API 需要认证
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * 列出模型
   * GET /v1beta/models
   */
  fastify.get('/v1beta/models', async (request, reply) => {
    return requestExecutor.listModels();
  });

  /**
   * 获取模型信息
   * GET /v1beta/models/:model
   */
  fastify.get('/v1beta/models/:model', async (request, reply) => {
    const { model } = request.params;
    const models = requestExecutor.listModels().models;
    const found = models.find(m => m.name === `models/${model}` || m.name === model);

    if (!found) {
      return reply.status(404).send({
        error: { code: 404, message: `Model ${model} not found` }
      });
    }

    return found;
  });

  /**
   * 生成内容 (两种 URL 格式)
   * POST /v1beta/models/:model:generateContent
   * POST /v1beta/models/:model/generateContent
   */
  const handleGenerateContent = async (request, reply) => {
    let model = request.params.model;

    // 处理 :generateContent 后缀
    if (model.endsWith(':generateContent')) {
      model = model.replace(':generateContent', '');
    }

    const { contents, generationConfig, thinkingConfig } = request.body;

    const result = await requestExecutor.generateContent({
      userId: request.user.id,
      apiKeyId: request.apiKey.id,
      model,
      contents,
      generationConfig,
      thinkingConfig
    });

    return result;
  };

  // 使用通配符匹配两种格式
  fastify.post('/v1beta/models/:model/generateContent', handleGenerateContent);

  /**
   * 流式生成内容 (两种 URL 格式)
   * POST /v1beta/models/:model:streamGenerateContent
   * POST /v1beta/models/:model/streamGenerateContent
   */
  const handleStreamGenerateContent = async (request, reply) => {
    let model = request.params.model;

    // 处理 :streamGenerateContent 后缀
    if (model.endsWith(':streamGenerateContent')) {
      model = model.replace(':streamGenerateContent', '');
    }

    const { contents, generationConfig, thinkingConfig } = request.body;

    // 设置 SSE 响应头
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const onChunk = (chunk) => {
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    };

    const onDone = () => {
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    };

    try {
      await requestExecutor.streamGenerateContent({
        userId: request.user.id,
        apiKeyId: request.apiKey.id,
        model,
        contents,
        generationConfig,
        thinkingConfig
      }, onChunk, onDone);
    } catch (error) {
      reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      reply.raw.end();
    }

    return reply;
  };

  fastify.post('/v1beta/models/:model/streamGenerateContent', handleStreamGenerateContent);

  /**
   * 通用路由处理 :action 格式
   * POST /v1beta/models/*
   */
  fastify.post('/v1beta/models/*', async (request, reply) => {
    const path = request.params['*'];

    // 解析 model:action 格式
    const colonMatch = path.match(/^(.+):(.+)$/);
    if (!colonMatch) {
      return reply.status(404).send({
        error: { code: 404, message: 'Invalid path format' }
      });
    }

    const [, model, action] = colonMatch;
    request.params.model = model;

    if (action === 'generateContent') {
      return handleGenerateContent(request, reply);
    } else if (action === 'streamGenerateContent') {
      return handleStreamGenerateContent(request, reply);
    } else {
      return reply.status(404).send({
        error: { code: 404, message: `Unknown action: ${action}` }
      });
    }
  });
}

module.exports = geminiRoutes;
