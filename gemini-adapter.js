/**
 * Gemini Business API 适配器
 * 将 Gemini Business API 转换为 Gemini 官方 API 格式
 *
 * 官方 API 格式:
 *   POST /v1beta/models/{model}:generateContent
 *   POST /v1beta/models/{model}:streamGenerateContent
 *
 * 请求格式:
 * {
 *   "contents": [
 *     { "role": "user", "parts": [{ "text": "..." }] }
 *   ],
 *   "generationConfig": {
 *     "responseModalities": ["TEXT", "IMAGE"]  // 支持图片生成
 *   }
 * }
 *
 * 响应格式 (文本):
 * {
 *   "candidates": [
 *     {
 *       "content": { "role": "model", "parts": [{ "text": "..." }] },
 *       "finishReason": "STOP"
 *     }
 *   ]
 * }
 *
 * 响应格式 (图片):
 * {
 *   "candidates": [
 *     {
 *       "content": {
 *         "role": "model",
 *         "parts": [
 *           { "text": "..." },
 *           { "inlineData": { "mimeType": "image/png", "data": "base64..." } }
 *         ]
 *       }
 *     }
 *   ]
 * }
 */

const GeminiBusinessClient = require('../gemini-business-api');
const SessionManager = require('./session-manager');
const crypto = require('crypto');

class GeminiAdapter {
  constructor(options = {}) {
    // Gemini Business 客户端
    this.client = new GeminiBusinessClient({
      csesidx: options.csesidx,
      configId: options.configId,
      cookies: options.cookies
    });

    // 会话管理器
    this.sessionManager = new SessionManager({
      storagePath: options.sessionStoragePath,
      sessionTTL: options.sessionTTL || 30 * 60 * 1000,
      maxSessions: options.maxSessions || 100
    });

    // Token 刷新相关
    this._tokenRefreshLock = false;
    this._lastTokenRefresh = 0;
    this._tokenValidDuration = 4 * 60 * 1000; // 4 分钟
  }

  /**
   * 确保 Token 有效
   */
  async _ensureToken() {
    const now = Date.now();

    if (this.client.bearerToken && (now - this._lastTokenRefresh < this._tokenValidDuration)) {
      return;
    }

    if (this._tokenRefreshLock) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return;
    }

    this._tokenRefreshLock = true;
    try {
      await this.client.getOxsrf();
      this._lastTokenRefresh = now;
      console.log('[GeminiAdapter] Token 已刷新');
    } finally {
      this._tokenRefreshLock = false;
    }
  }

  /**
   * 根据 contents 生成上下文哈希
   */
  generateContextHash(contents) {
    if (!contents || contents.length === 0) {
      return crypto.randomBytes(16).toString('hex');
    }

    const firstUserMsg = contents.find(msg => msg.role === 'user');
    if (!firstUserMsg) {
      return crypto.randomBytes(16).toString('hex');
    }

    const firstText = this._extractText(firstUserMsg.parts);
    if (!firstText) {
      return crypto.randomBytes(16).toString('hex');
    }

    const contextString = `first_user:${firstText.substring(0, 500)}`;
    return crypto.createHash('md5').update(contextString).digest('hex');
  }

  /**
   * 从 parts 中提取文本
   */
  _extractText(parts) {
    if (!parts || !Array.isArray(parts)) return '';
    return parts.filter(p => p.text).map(p => p.text).join('\n');
  }

  /**
   * 从 contents 获取最后一条消息文本
   */
  _getLastMessage(contents) {
    if (!contents || contents.length === 0) return '';
    const lastContent = contents[contents.length - 1];
    return this._extractText(lastContent.parts);
  }

  /**
   * 估算 token 数量
   */
  _estimateTokens(text) {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 检查是否请求图片生成
   */
  _isImageGenerationRequest(request) {
    const modalities = request.generationConfig?.responseModalities || [];
    return modalities.some(m => m.toUpperCase() === 'IMAGE');
  }

  /**
   * 检测 prompt 是否是图片生成请求
   */
  _detectImagePrompt(text) {
    const imageKeywords = ['画', '绘', '生成图', '图片', 'draw', 'paint', 'generate image', 'create image', 'picture of'];
    const lowerText = text.toLowerCase();
    return imageKeywords.some(kw => lowerText.includes(kw));
  }

  /**
   * 处理 generateContent 请求
   */
  async generateContent(model, request) {
    const { contents, generationConfig, thinkingConfig } = request;

    await this._ensureToken();

    const contextHash = this.generateContextHash(contents);
    let sessionInfo = this.sessionManager.getSession(contextHash);

    if (!sessionInfo) {
      const session = await this.client.createSession();
      sessionInfo = {
        sessionName: session.name,
        model: model
      };
      this.sessionManager.setSession(contextHash, sessionInfo);
      console.log(`[GeminiAdapter] 新会话: ${contextHash.substring(0, 8)}... -> ${session.name.split('/').pop()}`);
    } else {
      this.client.currentSession = { name: sessionInfo.sessionName };
      console.log(`[GeminiAdapter] 复用会话: ${contextHash.substring(0, 8)}...`);
    }

    const query = this._getLastMessage(contents);

    // 检查是否是图片生成请求
    const wantsImage = this._isImageGenerationRequest(request) || this._detectImagePrompt(query);

    // 发送请求
    const rawResponse = await this.client.streamAssist(query, {
      modelId: model || 'gemini-2.0-flash-exp'
    });

    // 解析响应
    const parsed = this.client.parseStreamResponse(rawResponse);

    // 构建响应 parts
    const responseParts = [];

    // 添加思考内容
    if (parsed.thoughts.length > 0 && thinkingConfig?.includeThoughts) {
      for (const thought of parsed.thoughts) {
        if (thought) {
          responseParts.push({ thought: true, text: thought });
        }
      }
    }

    // 添加文本回复
    if (parsed.content) {
      responseParts.push({ text: parsed.content });
    }

    // 如果是图片生成请求，尝试获取生成的图片
    if (wantsImage) {
      console.log('[GeminiAdapter] 检测到图片生成请求，尝试获取图片...');

      // 等待图片生成
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        const files = await this.client.listSessionFileMetadata(
          sessionInfo.sessionName,
          'file_origin_type = AI_GENERATED'
        );

        const fileList = files.listSessionFileMetadataResponse?.fileMetadata || [];
        console.log(`[GeminiAdapter] 找到 ${fileList.length} 个生成的文件`);

        if (fileList.length > 0) {
          // 下载最新生成的图片
          const fileInfo = fileList[0];
          const sessionId = sessionInfo.sessionName.split('/').pop();
          const imageData = await this.client.downloadFile(sessionId, fileInfo.fileId);

          if (typeof imageData === 'string') {
            // 添加图片到响应
            responseParts.push({
              inlineData: {
                mimeType: fileInfo.mimeType || 'image/png',
                data: imageData
              }
            });
            console.log(`[GeminiAdapter] 图片已添加到响应 (${imageData.length} bytes base64)`);
          }
        }
      } catch (error) {
        console.error('[GeminiAdapter] 获取图片失败:', error.message);
      }
    }

    // 计算 token
    const promptTokens = this._estimateTokens(query);
    const candidateTokens = this._estimateTokens(parsed.content);
    const thoughtTokens = parsed.thoughts.reduce((sum, t) => sum + this._estimateTokens(t), 0);

    return {
      candidates: [
        {
          content: {
            role: 'model',
            parts: responseParts
          },
          finishReason: parsed.state === 'SUCCEEDED' ? 'STOP' : 'MAX_TOKENS',
          safetyRatings: [
            { category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'NEGLIGIBLE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', probability: 'NEGLIGIBLE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'NEGLIGIBLE' }
          ]
        }
      ],
      usageMetadata: {
        promptTokenCount: promptTokens,
        candidatesTokenCount: candidateTokens + thoughtTokens,
        totalTokenCount: promptTokens + candidateTokens + thoughtTokens
      },
      modelVersion: model || 'gemini-2.0-flash-exp'
    };
  }

  /**
   * 处理 streamGenerateContent 请求
   */
  async streamGenerateContent(model, request, onChunk, onDone) {
    const { contents, generationConfig, thinkingConfig } = request;

    await this._ensureToken();

    const contextHash = this.generateContextHash(contents);
    let sessionInfo = this.sessionManager.getSession(contextHash);

    if (!sessionInfo) {
      const session = await this.client.createSession();
      sessionInfo = {
        sessionName: session.name,
        model: model
      };
      this.sessionManager.setSession(contextHash, sessionInfo);
      console.log(`[GeminiAdapter] 新会话(流式): ${contextHash.substring(0, 8)}...`);
    } else {
      this.client.currentSession = { name: sessionInfo.sessionName };
      console.log(`[GeminiAdapter] 复用会话(流式): ${contextHash.substring(0, 8)}...`);
    }

    const query = this._getLastMessage(contents);
    const promptTokens = this._estimateTokens(query);
    const wantsImage = this._isImageGenerationRequest(request) || this._detectImagePrompt(query);

    // 发送请求
    const rawResponse = await this.client.streamAssist(query, {
      modelId: model || 'gemini-2.0-flash-exp'
    });

    const parsed = this.client.parseStreamResponse(rawResponse);
    let totalCandidateTokens = 0;

    // 输出思考内容
    if (parsed.thoughts.length > 0 && thinkingConfig?.includeThoughts) {
      for (const thought of parsed.thoughts) {
        if (thought) {
          onChunk({
            candidates: [{
              content: { role: 'model', parts: [{ thought: true, text: thought }] },
              finishReason: null
            }]
          });
          totalCandidateTokens += this._estimateTokens(thought);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    }

    // 流式输出文本内容
    const content = parsed.content;
    const chunkSize = 20;

    for (let i = 0; i < content.length; i += chunkSize) {
      const textChunk = content.slice(i, i + chunkSize);
      const isLast = i + chunkSize >= content.length && !wantsImage;

      onChunk({
        candidates: [{
          content: { role: 'model', parts: [{ text: textChunk }] },
          finishReason: isLast ? 'STOP' : null,
          safetyRatings: [
            { category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'NEGLIGIBLE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', probability: 'NEGLIGIBLE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'NEGLIGIBLE' }
          ]
        }],
        usageMetadata: isLast ? {
          promptTokenCount: promptTokens,
          candidatesTokenCount: totalCandidateTokens + this._estimateTokens(content),
          totalTokenCount: promptTokens + totalCandidateTokens + this._estimateTokens(content)
        } : undefined
      });

      await new Promise(resolve => setTimeout(resolve, 15));
    }

    // 如果是图片生成，获取并发送图片
    if (wantsImage) {
      console.log('[GeminiAdapter] 流式: 等待图片生成...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        const files = await this.client.listSessionFileMetadata(
          sessionInfo.sessionName,
          'file_origin_type = AI_GENERATED'
        );

        const fileList = files.listSessionFileMetadataResponse?.fileMetadata || [];

        if (fileList.length > 0) {
          const fileInfo = fileList[0];
          const sessionId = sessionInfo.sessionName.split('/').pop();
          const imageData = await this.client.downloadFile(sessionId, fileInfo.fileId);

          if (typeof imageData === 'string') {
            // 发送图片 chunk
            onChunk({
              candidates: [{
                content: {
                  role: 'model',
                  parts: [{
                    inlineData: {
                      mimeType: fileInfo.mimeType || 'image/png',
                      data: imageData
                    }
                  }]
                },
                finishReason: 'STOP'
              }],
              usageMetadata: {
                promptTokenCount: promptTokens,
                candidatesTokenCount: totalCandidateTokens + this._estimateTokens(content),
                totalTokenCount: promptTokens + totalCandidateTokens + this._estimateTokens(content)
              }
            });
            console.log('[GeminiAdapter] 流式: 图片已发送');
          }
        }
      } catch (error) {
        console.error('[GeminiAdapter] 流式获取图片失败:', error.message);
      }
    }

    onDone();
  }

  /**
   * 列出模型
   */
  listModels() {
    return {
      models: [
        {
          name: 'models/gemini-2.0-flash-exp',
          displayName: 'Gemini 2.0 Flash Exp',
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

  /**
   * 获取会话统计
   */
  getSessionStats() {
    return this.sessionManager.getStats();
  }

  /**
   * 关闭适配器
   */
  close() {
    this.sessionManager.close();
  }
}

module.exports = GeminiAdapter;
