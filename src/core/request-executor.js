/**
 * 请求执行器
 * 组装完整的请求处理流程：
 * 会话匹配 → Provider 调度 → 执行请求 → 结果处理
 */

const GeminiClient = require('./gemini-client');
const sessionMatcher = require('./session-matcher');
const providerScheduler = require('./provider-scheduler');
const { Session, RequestLog } = require('../models');
const { getLastMessageText } = require('../utils/hash');
const logger = require('../utils/logger');
const { GeminiApiError, ProviderError } = require('../utils/errors');

class RequestExecutor {
  constructor() {
    // Provider -> GeminiClient 缓存
    this.clientCache = new Map();
    this.clientCacheExpiry = 5 * 60 * 1000; // 5分钟
  }

  /**
   * 获取或创建 GeminiClient
   */
  getClient(provider) {
    const cacheKey = `${provider.id}-${provider.csesidx}`;
    const cached = this.clientCache.get(cacheKey);

    if (cached && Date.now() - cached.createdAt < this.clientCacheExpiry) {
      return cached.client;
    }

    const client = new GeminiClient({
      csesidx: provider.csesidx,
      cookies: provider.cookies
    });

    this.clientCache.set(cacheKey, {
      client,
      createdAt: Date.now()
    });

    return client;
  }

  /**
   * 执行 generateContent 请求
   */
  async generateContent(options) {
    const {
      userId,
      apiKeyId,
      model,
      contents,
      generationConfig,
      thinkingConfig
    } = options;

    const startTime = Date.now();
    let providerId = null;
    let sessionId = null;

    try {
      // 1. 选择 Provider
      const provider = await providerScheduler.acquireProvider();
      providerId = provider.id;

      // 2. 匹配或创建会话
      const { session, isNew } = await sessionMatcher.matchOrCreate({
        userId,
        providerId: provider.id,
        messages: contents
      });
      sessionId = session.id;

      // 3. 获取客户端并执行请求
      const client = this.getClient(provider);
      const query = getLastMessageText(contents);

      // 如果是新会话，需要创建 Gemini 会话
      let geminiSessionId = session.gemini_session_id;
      if (!geminiSessionId) {
        const geminiSession = await client.createSession();
        geminiSessionId = geminiSession.name;
        await sessionMatcher.updateGeminiSession(session.id, geminiSessionId);
      } else {
        client.currentSessionId = geminiSessionId;
      }

      // 4. 发送消息
      const rawResponse = await client.sendMessage(geminiSessionId, query, {
        modelId: this._mapModel(model)
      });

      // 5. 解析响应
      const parsed = client.parseResponse(rawResponse);

      // 6. 检查是否需要图片
      const wantsImage = this._wantsImage(generationConfig, query);
      let imageData = null;

      if (wantsImage) {
        imageData = await this._fetchImage(client, geminiSessionId);
      }

      // 7. 构建 Gemini 官方格式响应
      const response = this._buildResponse(parsed, imageData, model, thinkingConfig);

      // 8. 记录消息
      await sessionMatcher.recordMessage(session.id);

      // 9. 释放 Provider 并记录成功
      await providerScheduler.releaseProvider(provider.id);
      await providerScheduler.recordSuccess(provider.id);

      // 10. 记录请求日志
      const latencyMs = Date.now() - startTime;
      await RequestLog.log({
        userId,
        apiKeyId,
        providerId,
        sessionId,
        model,
        requestType: 'generateContent',
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        latencyMs,
        statusCode: 200
      });

      return response;

    } catch (error) {
      // 记录失败
      const latencyMs = Date.now() - startTime;

      if (providerId) {
        await providerScheduler.releaseProvider(providerId);
        await providerScheduler.recordFailure(providerId, error.message);
      }

      await RequestLog.log({
        userId,
        apiKeyId,
        providerId,
        sessionId,
        model,
        requestType: 'generateContent',
        latencyMs,
        statusCode: 500,
        errorMessage: error.message
      });

      logger.error({ error: error.message, providerId, sessionId }, 'Request failed');
      throw new GeminiApiError(error.message, error);
    }
  }

  /**
   * 执行 streamGenerateContent 请求 (真正的流式)
   */
  async streamGenerateContent(options, onChunk, onDone) {
    const {
      userId,
      apiKeyId,
      model,
      contents,
      generationConfig,
      thinkingConfig
    } = options;

    const startTime = Date.now();
    let providerId = null;
    let sessionId = null;
    let fullContent = '';
    let thoughtContent = '';

    try {
      // 1. 选择 Provider
      const provider = await providerScheduler.acquireProvider();
      providerId = provider.id;

      // 2. 匹配或创建会话
      const { session, isNew } = await sessionMatcher.matchOrCreate({
        userId,
        providerId: provider.id,
        messages: contents
      });
      sessionId = session.id;

      // 3. 获取客户端
      const client = this.getClient(provider);
      const query = getLastMessageText(contents);

      // 创建或复用 Gemini 会话
      let geminiSessionId = session.gemini_session_id;
      if (!geminiSessionId) {
        const geminiSession = await client.createSession();
        geminiSessionId = geminiSession.name;
        await sessionMatcher.updateGeminiSession(session.id, geminiSessionId);
      }

      // 4. 使用流式方法发送消息，实时推送数据
      const streamChunkHandler = (chunk) => {
        if (chunk.thought && thinkingConfig?.includeThoughts) {
          // 思考内容
          thoughtContent += chunk.text;
          onChunk({
            candidates: [{
              content: { role: 'model', parts: [{ thought: true, text: chunk.text }] },
              finishReason: null
            }]
          });
        } else if (!chunk.thought && chunk.text) {
          // 正常文本内容
          fullContent += chunk.text;
          onChunk({
            candidates: [{
              content: { role: 'model', parts: [{ text: chunk.text }] },
              finishReason: null
            }]
          });
        }
      };

      await client.sendMessageStream(geminiSessionId, query, {
        modelId: this._mapModel(model)
      }, streamChunkHandler);

      // 5. 发送最终完成消息（带 usage 信息）
      onChunk({
        candidates: [{
          content: { role: 'model', parts: [{ text: '' }] },
          finishReason: 'STOP'
        }],
        usageMetadata: {
          promptTokenCount: this._estimateTokens(query),
          candidatesTokenCount: this._estimateTokens(fullContent) + this._estimateTokens(thoughtContent),
          totalTokenCount: this._estimateTokens(query) + this._estimateTokens(fullContent) + this._estimateTokens(thoughtContent)
        }
      });

      // 6. 检查图片
      const wantsImage = this._wantsImage(generationConfig, query);
      if (wantsImage) {
        await this._delay(2000);
        const imageData = await this._fetchImage(client, geminiSessionId);
        if (imageData) {
          onChunk({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  inlineData: {
                    mimeType: imageData.mimeType,
                    data: imageData.data
                  }
                }]
              },
              finishReason: 'STOP'
            }]
          });
        }
      }

      // 7. 完成
      await sessionMatcher.recordMessage(session.id);
      await providerScheduler.releaseProvider(provider.id);
      await providerScheduler.recordSuccess(provider.id);

      const latencyMs = Date.now() - startTime;
      await RequestLog.log({
        userId,
        apiKeyId,
        providerId,
        sessionId,
        model,
        requestType: 'streamGenerateContent',
        inputTokens: this._estimateTokens(query),
        outputTokens: this._estimateTokens(fullContent),
        latencyMs,
        statusCode: 200
      });

      onDone();

    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (providerId) {
        await providerScheduler.releaseProvider(providerId);
        await providerScheduler.recordFailure(providerId, error.message);
      }

      await RequestLog.log({
        userId,
        apiKeyId,
        providerId,
        sessionId,
        model,
        requestType: 'streamGenerateContent',
        latencyMs,
        statusCode: 500,
        errorMessage: error.message
      });

      throw new GeminiApiError(error.message, error);
    }
  }

  /**
   * 映射模型名称
   */
  _mapModel(model) {
    const modelMap = {
      'gemini-2.0-flash-exp': 'gemini-2.0-flash-exp',
      'gemini-2.5-flash': 'gemini-2.0-flash-exp',
      'gemini-3-pro-preview': 'gemini-3-pro-preview',
      'gemini-2.5-pro': 'gemini-3-pro-preview',
      'gemini-pro': 'gemini-2.0-flash-exp'
    };

    // 移除 models/ 前缀
    const cleanModel = model?.replace('models/', '') || 'gemini-2.0-flash-exp';
    return modelMap[cleanModel] || cleanModel;
  }

  /**
   * 检查是否需要图片
   */
  _wantsImage(generationConfig, query) {
    const modalities = generationConfig?.responseModalities || [];
    if (modalities.some(m => m.toUpperCase() === 'IMAGE')) {
      return true;
    }

    // 检测图片关键词
    const keywords = ['画', '绘', '生成图', '图片', 'draw', 'paint', 'generate image', 'picture'];
    return keywords.some(kw => query.toLowerCase().includes(kw));
  }

  /**
   * 获取生成的图片
   */
  async _fetchImage(client, sessionName) {
    try {
      const files = await client.listSessionFiles(sessionName);
      if (files.length === 0) return null;

      const fileInfo = files[0];
      const sessionId = sessionName.split('/').pop();
      const imageData = await client.downloadFile(sessionId, fileInfo.fileId);

      if (typeof imageData === 'string') {
        return {
          mimeType: fileInfo.mimeType || 'image/png',
          data: imageData
        };
      }

      return null;
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to fetch image');
      return null;
    }
  }

  /**
   * 构建 Gemini 官方格式响应
   */
  _buildResponse(parsed, imageData, model, thinkingConfig) {
    const parts = [];

    // 思考内容
    if (thinkingConfig?.includeThoughts && parsed.thoughts.length > 0) {
      for (const thought of parsed.thoughts) {
        parts.push({ thought: true, text: thought });
      }
    }

    // 文本内容
    if (parsed.content) {
      parts.push({ text: parsed.content });
    }

    // 图片
    if (imageData) {
      parts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.data
        }
      });
    }

    const promptTokens = this._estimateTokens(parsed.content);
    const candidateTokens = this._estimateTokens(parsed.content) +
      parsed.thoughts.reduce((sum, t) => sum + this._estimateTokens(t), 0);

    return {
      candidates: [{
        content: { role: 'model', parts },
        finishReason: parsed.state === 'SUCCEEDED' ? 'STOP' : 'MAX_TOKENS',
        safetyRatings: [
          { category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'NEGLIGIBLE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', probability: 'NEGLIGIBLE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'NEGLIGIBLE' }
        ]
      }],
      usageMetadata: {
        promptTokenCount: promptTokens,
        candidatesTokenCount: candidateTokens,
        totalTokenCount: promptTokens + candidateTokens
      },
      modelVersion: model || 'gemini-2.0-flash-exp'
    };
  }

  /**
   * 估算 token 数
   */
  _estimateTokens(text) {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 延迟
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取支持的模型列表
   */
  listModels() {
    return {
      models: [
        {
          name: 'models/gemini-2.0-flash-exp',
          displayName: 'Gemini 2.0 Flash',
          description: 'Fast model for text and image generation',
          inputTokenLimit: 1048576,
          outputTokenLimit: 8192,
          supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
        },
        {
          name: 'models/gemini-3-pro-preview',
          displayName: 'Gemini 3 Pro Preview',
          description: 'Advanced model with thinking and image generation',
          inputTokenLimit: 1048576,
          outputTokenLimit: 8192,
          supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
        },
        {
          name: 'models/gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
          description: 'Alias for gemini-2.0-flash-exp',
          inputTokenLimit: 1048576,
          outputTokenLimit: 8192,
          supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
        },
        {
          name: 'models/gemini-2.5-pro',
          displayName: 'Gemini 2.5 Pro',
          description: 'Alias for gemini-3-pro-preview',
          inputTokenLimit: 1048576,
          outputTokenLimit: 8192,
          supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
        }
      ]
    };
  }
}

module.exports = new RequestExecutor();
