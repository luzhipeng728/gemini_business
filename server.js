/**
 * Gemini Business API 兼容服务器
 * 提供 Gemini 官方 API 格式的 REST 接口
 *
 * 端点:
 *   POST /v1beta/models/{model}:generateContent
 *   POST /v1beta/models/{model}:streamGenerateContent
 *   GET  /v1beta/models
 *   GET  /v1beta/models/{model}
 */

const http = require('http');
const url = require('url');
const GeminiAdapter = require('./gemini-adapter');

class GeminiAPIServer {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';

    // API Key 验证
    this.apiKeys = options.apiKeys || [];

    // 创建适配器
    this.adapter = new GeminiAdapter({
      csesidx: options.csesidx,
      configId: options.configId,
      cookies: options.cookies,
      sessionTTL: options.sessionTTL,
      maxSessions: options.maxSessions
    });

    // 模型别名映射
    this.modelAliases = {
      'gemini-2.5-flash': 'gemini-2.0-flash-exp',
      'gemini-2.5-pro': 'gemini-3-pro-preview',
      'gemini-1.5-flash': 'gemini-2.0-flash-exp',
      'gemini-1.5-pro': 'gemini-3-pro-preview',
      'gemini-pro': 'gemini-3-pro-preview',
      'gemini-flash': 'gemini-2.0-flash-exp'
    };

    this.server = null;
  }

  /**
   * 验证 API Key
   * 支持两种方式: x-goog-api-key header 或 URL 参数 key
   */
  _validateApiKey(req, query) {
    if (this.apiKeys.length === 0) {
      return true;
    }

    // 检查 header
    const headerKey = req.headers['x-goog-api-key'];
    if (headerKey && this.apiKeys.includes(headerKey)) {
      return true;
    }

    // 检查 URL 参数
    if (query.key && this.apiKeys.includes(query.key)) {
      return true;
    }

    // 检查 Authorization header (Bearer token)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (this.apiKeys.includes(token)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 解析请求体
   */
  async _parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * 发送 JSON 响应
   */
  _sendJson(res, data, status = 200) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key, Authorization'
    });
    res.end(JSON.stringify(data));
  }

  /**
   * 发送 Gemini 格式的错误响应
   */
  _sendError(res, message, status = 400, code = 'INVALID_ARGUMENT') {
    this._sendJson(res, {
      error: {
        code: status,
        message: message,
        status: code
      }
    }, status);
  }

  /**
   * 解析模型名称
   * 支持: gemini-2.0-flash-exp, models/gemini-2.0-flash-exp
   */
  _parseModelName(modelPath) {
    let model = modelPath;

    // 移除 models/ 前缀
    if (model.startsWith('models/')) {
      model = model.slice(7);
    }

    // 移除 :generateContent 或 :streamGenerateContent 后缀
    model = model.split(':')[0];

    // 应用别名映射
    return this.modelAliases[model] || model;
  }

  /**
   * 处理 generateContent 请求
   */
  async _handleGenerateContent(req, res, model) {
    try {
      const body = await this._parseBody(req);

      if (!body.contents || !Array.isArray(body.contents)) {
        return this._sendError(res, 'contents is required and must be an array');
      }

      const response = await this.adapter.generateContent(model, body);
      this._sendJson(res, response);
    } catch (error) {
      console.error('[Server] generateContent 错误:', error);
      this._sendError(res, error.message, 500, 'INTERNAL');
    }
  }

  /**
   * 处理 streamGenerateContent 请求
   */
  async _handleStreamGenerateContent(req, res, model) {
    try {
      const body = await this._parseBody(req);

      if (!body.contents || !Array.isArray(body.contents)) {
        return this._sendError(res, 'contents is required and must be an array');
      }

      // 设置 SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      await this.adapter.streamGenerateContent(
        model,
        body,
        (chunk) => {
          // Gemini 流式格式: data: {...}\n\n
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        },
        () => {
          res.end();
        }
      );
    } catch (error) {
      console.error('[Server] streamGenerateContent 错误:', error);
      // 如果 headers 还没发送，发送错误
      if (!res.headersSent) {
        this._sendError(res, error.message, 500, 'INTERNAL');
      } else {
        res.end();
      }
    }
  }

  /**
   * 处理模型列表请求
   */
  _handleListModels(req, res) {
    const models = this.adapter.listModels();
    this._sendJson(res, models);
  }

  /**
   * 处理单个模型信息请求
   */
  _handleGetModel(req, res, model) {
    const models = this.adapter.listModels();
    const modelInfo = models.models.find(m =>
      m.name === `models/${model}` || m.name.endsWith(`/${model}`)
    );

    if (modelInfo) {
      this._sendJson(res, modelInfo);
    } else {
      this._sendError(res, `Model not found: ${model}`, 404, 'NOT_FOUND');
    }
  }

  /**
   * 处理健康检查
   */
  _handleHealth(req, res) {
    const stats = this.adapter.getSessionStats();
    this._sendJson(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      sessions: stats
    });
  }

  /**
   * 路由处理
   */
  async _handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;
    const method = req.method;

    // CORS 预检
    if (method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key, Authorization',
        'Access-Control-Max-Age': '86400'
      });
      return res.end();
    }

    // API Key 验证（健康检查和根路径除外）
    if (pathname !== '/health' && pathname !== '/') {
      if (!this._validateApiKey(req, query)) {
        return this._sendError(res, 'Invalid API key', 401, 'UNAUTHENTICATED');
      }
    }

    try {
      // 匹配路由
      // POST /v1beta/models/{model}:generateContent
      const generateMatch = pathname.match(/^\/v1beta\/models\/(.+):generateContent$/);
      if (generateMatch && method === 'POST') {
        const model = this._parseModelName(generateMatch[1]);
        return await this._handleGenerateContent(req, res, model);
      }

      // POST /v1beta/models/{model}:streamGenerateContent
      const streamMatch = pathname.match(/^\/v1beta\/models\/(.+):streamGenerateContent$/);
      if (streamMatch && method === 'POST') {
        const model = this._parseModelName(streamMatch[1]);
        return await this._handleStreamGenerateContent(req, res, model);
      }

      // GET /v1beta/models
      if (pathname === '/v1beta/models' && method === 'GET') {
        return this._handleListModels(req, res);
      }

      // GET /v1beta/models/{model}
      const modelMatch = pathname.match(/^\/v1beta\/models\/([^:]+)$/);
      if (modelMatch && method === 'GET') {
        const model = this._parseModelName(modelMatch[1]);
        return this._handleGetModel(req, res, model);
      }

      // 健康检查
      if (pathname === '/health' && method === 'GET') {
        return this._handleHealth(req, res);
      }

      // 根路径 - 返回 API 信息
      if (pathname === '/' && method === 'GET') {
        return this._sendJson(res, {
          name: 'Gemini Business API Server',
          version: '1.0.0',
          description: 'Gemini API compatible reverse proxy',
          endpoints: {
            generateContent: 'POST /v1beta/models/{model}:generateContent',
            streamGenerateContent: 'POST /v1beta/models/{model}:streamGenerateContent',
            listModels: 'GET /v1beta/models',
            getModel: 'GET /v1beta/models/{model}',
            health: 'GET /health'
          },
          models: [
            'gemini-2.0-flash-exp',
            'gemini-3-pro-preview',
            'gemini-2.5-flash (alias)',
            'gemini-2.5-pro (alias)'
          ]
        });
      }

      // 404
      this._sendError(res, `Not found: ${pathname}`, 404, 'NOT_FOUND');

    } catch (error) {
      console.error('[Server] 请求处理错误:', error);
      this._sendError(res, error.message, 500, 'INTERNAL');
    }
  }

  /**
   * 启动服务器
   */
  start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this._handleRequest(req, res);
      });

      this.server.listen(this.port, this.host, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║        Gemini Business API Server (Gemini 官方格式)          ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log(`  🚀 服务器已启动: http://${this.host}:${this.port}`);
        console.log('');
        console.log('  📡 API 端点 (Gemini 官方格式):');
        console.log(`     POST http://localhost:${this.port}/v1beta/models/{model}:generateContent`);
        console.log(`     POST http://localhost:${this.port}/v1beta/models/{model}:streamGenerateContent`);
        console.log(`     GET  http://localhost:${this.port}/v1beta/models`);
        console.log('');
        console.log('  🤖 支持的模型:');
        console.log('     - gemini-2.0-flash-exp (快速模型)');
        console.log('     - gemini-3-pro-preview (高级模型，支持思考)');
        console.log('     - gemini-2.5-flash, gemini-2.5-pro (别名)');
        console.log('');
        console.log('  💡 使用示例:');
        console.log(`     curl "http://localhost:${this.port}/v1beta/models/gemini-2.0-flash-exp:generateContent" \\`);
        console.log('       -H "Content-Type: application/json" \\');
        console.log('       -H "x-goog-api-key: YOUR_API_KEY" \\');
        console.log('       -d \'{"contents": [{"parts": [{"text": "Hello"}]}]}\'');
        console.log('');
        resolve();
      });
    });
  }

  /**
   * 停止服务器
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.adapter.close();
        this.server.close(() => {
          console.log('[Server] 服务器已停止');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = GeminiAPIServer;
