/**
 * Gemini Business API 客户端
 * 封装与 Google Business Gemini API 的交互
 */

const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const logger = require('../utils/logger');

class GeminiClient {
  constructor(options = {}) {
    this.csesidx = options.csesidx;
    this.configId = options.configId || '6c177c69-1013-4e61-932d-19f6b2b46f61';
    this.cookies = options.cookies || '';

    // Token
    this.bearerToken = null;
    this.tokenData = null;
    this.tokenExpiresAt = 0;

    // 当前会话
    this.currentSessionId = null;
  }

  /**
   * 构建 Cookie 字符串
   */
  buildCookieString() {
    if (typeof this.cookies === 'string') {
      return this.cookies;
    }
    return Object.entries(this.cookies)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  /**
   * 使用 curl 发送请求
   */
  curlRequest(url, options = {}) {
    const method = options.method || 'GET';
    const headers = options.headers || {};
    const body = options.body;

    let cmd = `curl -s -X ${method} '${url}'`;

    for (const [key, value] of Object.entries(headers)) {
      cmd += ` -H '${key}: ${value}'`;
    }

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      cmd += ` --data-raw '${bodyStr.replace(/'/g, "'\\''")}'`;
    }

    try {
      let result = execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000
      });

      // 移除 Google XSSI 防护前缀
      if (result.startsWith(")]}")) {
        result = result.replace(/^\)\]\}'\n?/, '');
      }

      try {
        return JSON.parse(result);
      } catch {
        return result;
      }
    } catch (error) {
      throw new Error(`请求失败: ${error.message}`);
    }
  }

  /**
   * 确保 Token 有效
   */
  async ensureToken() {
    const now = Date.now();

    // Token 有效期内
    if (this.bearerToken && now < this.tokenExpiresAt - 30000) {
      return;
    }

    await this.refreshToken();
  }

  /**
   * 刷新 Token
   */
  async refreshToken() {
    const url = `https://business.gemini.google/auth/getoxsrf?csesidx=${this.csesidx}`;

    const result = this.curlRequest(url, {
      method: 'GET',
      headers: {
        'accept': '*/*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'referer': 'https://business.gemini.google/',
        'cookie': this.buildCookieString(),
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (result && result.xsrfToken) {
      this.tokenData = result;
      this.bearerToken = this._buildBearerToken(result);
      this.tokenExpiresAt = new Date(result.expirationTime).getTime();
      logger.debug('Token refreshed');
      return result;
    }

    throw new Error(`Token 刷新失败: ${JSON.stringify(result)}`);
  }

  /**
   * 构建 JWT Bearer Token
   */
  _buildBearerToken(tokenData) {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
      kid: tokenData.keyId
    };

    const now = Math.floor(Date.now() / 1000);
    const expTime = Math.floor(new Date(tokenData.expirationTime).getTime() / 1000);
    const payload = {
      iss: 'https://business.gemini.google',
      aud: 'https://biz-discoveryengine.googleapis.com',
      sub: `csesidx/${this.csesidx}`,
      iat: now,
      exp: now + Math.min(300, expTime - now),
      nbf: now
    };

    const base64urlEncode = (data) => {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    };

    const base64urlDecode = (str) => {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      return Buffer.from(base64, 'base64');
    };

    const headerB64 = base64urlEncode(header);
    const payloadB64 = base64urlEncode(payload);
    const message = `${headerB64}.${payloadB64}`;

    const key = base64urlDecode(tokenData.xsrfToken);
    const signature = crypto
      .createHmac('sha256', key)
      .update(message)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `${message}.${signature}`;
  }

  /**
   * 创建会话
   */
  async createSession(displayName = '') {
    await this.ensureToken();

    const url = 'https://biz-discoveryengine.googleapis.com/v1alpha/locations/global/widgetCreateSession';

    const body = {
      configId: this.configId,
      additionalParams: { token: '-' },
      createSessionRequest: {
        session: { name: '-', displayName }
      }
    };

    const result = this.curlRequest(url, {
      method: 'POST',
      headers: this._getHeaders(),
      body
    });

    const session = result.session || result;
    this.currentSessionId = session.name;
    return session;
  }

  /**
   * 发送消息 (同步方式，用于非流式请求)
   */
  async sendMessage(sessionName, message, options = {}) {
    await this.ensureToken();

    const url = 'https://biz-discoveryengine.googleapis.com/v1alpha/locations/global/widgetStreamAssist';

    const body = {
      configId: this.configId,
      additionalParams: { token: '-' },
      streamAssistRequest: {
        session: sessionName,
        query: {
          parts: [{ text: message }]
        },
        filter: '',
        fileIds: options.fileIds || [],
        answerGenerationMode: options.answerGenerationMode || 'NORMAL',
        toolsSpec: {
          imageGenerationSpec: {}
        },
        languageCode: options.languageCode || 'zh-CN',
        userMetadata: {
          timeZone: options.timeZone || 'Asia/Shanghai'
        },
        assistSkippingMode: 'REQUEST_ASSIST',
        assistGenerationConfig: {
          modelId: options.modelId || 'gemini-2.0-flash-exp'
        }
      }
    };

    const result = this.curlRequest(url, {
      method: 'POST',
      headers: {
        ...this._getHeaders(),
        'x-server-timeout': '1800'
      },
      body
    });

    return result;
  }

  /**
   * 发送消息 (流式方式，实时返回数据)
   */
  async sendMessageStream(sessionName, message, options = {}, onChunk) {
    await this.ensureToken();

    const url = 'https://biz-discoveryengine.googleapis.com/v1alpha/locations/global/widgetStreamAssist';

    const body = {
      configId: this.configId,
      additionalParams: { token: '-' },
      streamAssistRequest: {
        session: sessionName,
        query: {
          parts: [{ text: message }]
        },
        filter: '',
        fileIds: options.fileIds || [],
        answerGenerationMode: options.answerGenerationMode || 'NORMAL',
        toolsSpec: {
          imageGenerationSpec: {}
        },
        languageCode: options.languageCode || 'zh-CN',
        userMetadata: {
          timeZone: options.timeZone || 'Asia/Shanghai'
        },
        assistSkippingMode: 'REQUEST_ASSIST',
        assistGenerationConfig: {
          modelId: options.modelId || 'gemini-2.0-flash-exp'
        }
      }
    };

    return this.curlStreamRequest(url, {
      method: 'POST',
      headers: {
        ...this._getHeaders(),
        'x-server-timeout': '1800'
      },
      body
    }, onChunk);
  }

  /**
   * 使用 curl 发送流式请求
   * Gemini Business 返回格式: [{...},\r\n{...},\r\n{...}]
   * 数据分块到达，需要增量解析
   */
  curlStreamRequest(url, options = {}, onChunk) {
    return new Promise((resolve, reject) => {
      const method = options.method || 'GET';
      const headers = options.headers || {};
      const body = options.body;

      const args = ['-s', '-N', '-X', method, url];

      for (const [key, value] of Object.entries(headers)) {
        args.push('-H', `${key}: ${value}`);
      }

      if (body) {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        args.push('--data-raw', bodyStr);
      }

      logger.info({ url, method }, '[Stream] Starting curl request');

      const curl = spawn('curl', args);
      let buffer = '';
      const chunks = [];
      let inArray = false;
      let braceDepth = 0;
      let currentObject = '';
      let inString = false;
      let escapeNext = false;

      curl.stdout.on('data', (data) => {
        const rawData = data.toString();
        logger.info({ rawDataLength: rawData.length }, '[Stream] Received raw data');

        buffer += rawData;

        // 逐字符解析，提取完整的 JSON 对象
        while (buffer.length > 0) {
          const char = buffer[0];
          buffer = buffer.slice(1);

          // 处理转义字符
          if (escapeNext) {
            escapeNext = false;
            if (braceDepth > 0) currentObject += char;
            continue;
          }

          // 遇到反斜杠，下一个字符转义
          if (char === '\\' && inString) {
            escapeNext = true;
            if (braceDepth > 0) currentObject += char;
            continue;
          }

          // 字符串边界
          if (char === '"' && braceDepth > 0) {
            inString = !inString;
            currentObject += char;
            continue;
          }

          // 在字符串内部，直接累积
          if (inString) {
            currentObject += char;
            continue;
          }

          // --- 以下是非字符串内部的处理 ---

          // 跳过数组开始
          if (char === '[' && !inArray && braceDepth === 0) {
            inArray = true;
            continue;
          }

          // 数组结束
          if (char === ']' && inArray && braceDepth === 0) {
            break;
          }

          // 跳过对象之间的逗号和空白
          if (braceDepth === 0 && (char === ',' || char === '\r' || char === '\n' || char === ' ')) {
            continue;
          }

          // 对象开始
          if (char === '{') {
            braceDepth++;
            currentObject += char;
            continue;
          }

          // 对象结束
          if (char === '}') {
            braceDepth--;
            currentObject += char;

            if (braceDepth === 0 && currentObject.length > 0) {
              // 完整对象，解析并推送
              try {
                const parsed = JSON.parse(currentObject);
                chunks.push(parsed);
                logger.info({ chunkIndex: chunks.length }, '[Stream] Parsed complete object');

                // 提取并推送文本内容
                this._extractAndPushContent(parsed, onChunk);
              } catch (e) {
                logger.warn({ error: e.message, objectLen: currentObject.length }, '[Stream] Failed to parse object');
              }
              currentObject = '';
            }
            continue;
          }

          // 在对象内部，累积字符
          if (braceDepth > 0) {
            currentObject += char;
          }
        }
      });

      curl.stderr.on('data', (data) => {
        logger.warn({ stderr: data.toString() }, '[Stream] curl stderr');
      });

      curl.on('close', (code) => {
        logger.info({ code, totalChunks: chunks.length }, '[Stream] curl closed');

        if (code !== 0) {
          reject(new Error(`curl exited with code ${code}`));
          return;
        }

        // 处理剩余的不完整对象（如果有）
        if (currentObject.trim()) {
          try {
            const parsed = JSON.parse(currentObject);
            chunks.push(parsed);
            this._extractAndPushContent(parsed, onChunk);
          } catch (e) {
            logger.debug({ remaining: currentObject.length }, '[Stream] Incomplete object at end');
          }
        }

        resolve(chunks);
      });

      curl.on('error', (error) => {
        logger.error({ error: error.message }, '[Stream] curl error');
        reject(new Error(`curl error: ${error.message}`));
      });
    });
  }

  /**
   * 从解析的 chunk 中提取文本并推送
   */
  _extractAndPushContent(parsed, onChunk) {
    const response = parsed.streamAssistResponse;
    if (!response) {
      logger.debug({ keys: Object.keys(parsed) }, '[Stream] No streamAssistResponse');
      return;
    }

    const answer = response.answer;
    if (!answer) {
      logger.debug('[Stream] No answer in response');
      return;
    }

    logger.debug({ state: answer.state, repliesCount: answer.replies?.length }, '[Stream] Processing answer');

    if (answer.replies) {
      for (const reply of answer.replies) {
        const content = reply.groundedContent?.content;
        if (content?.text) {
          // thought 可能是 true 或 undefined/false
          const isThought = content.thought === true;
          logger.info({
            textLength: content.text.length,
            isThought,
            textPreview: content.text.substring(0, 50)
          }, '[Stream] Pushing chunk');
          onChunk({ text: content.text, thought: isThought });
        }
      }
    }
  }

  /**
   * 解析流式响应
   */
  parseResponse(chunks) {
    const result = {
      thoughts: [],
      content: '',
      state: 'UNKNOWN',
      sessionInfo: null
    };

    if (!Array.isArray(chunks)) {
      chunks = [chunks];
    }

    for (const chunk of chunks) {
      const response = chunk.streamAssistResponse;
      if (!response) continue;

      const answer = response.answer;
      if (!answer) continue;

      if (answer.state) {
        result.state = answer.state;
      }

      if (response.sessionInfo?.session) {
        result.sessionInfo = response.sessionInfo;
      }

      if (answer.replies) {
        for (const reply of answer.replies) {
          const content = reply.groundedContent?.content;
          if (!content) continue;

          if (content.thought === true) {
            result.thoughts.push(content.text);
          } else if (content.text) {
            result.content += content.text;
          }
        }
      }
    }

    return result;
  }

  /**
   * 获取会话文件
   */
  async listSessionFiles(sessionName, filter = 'file_origin_type = AI_GENERATED') {
    await this.ensureToken();

    const url = 'https://biz-discoveryengine.googleapis.com/v1alpha/locations/global/widgetListSessionFileMetadata';

    const body = {
      configId: this.configId,
      additionalParams: { token: '-' },
      listSessionFileMetadataRequest: {
        name: sessionName,
        filter
      }
    };

    const result = this.curlRequest(url, {
      method: 'POST',
      headers: this._getHeaders(),
      body
    });

    return result.listSessionFileMetadataResponse?.fileMetadata || [];
  }

  /**
   * 下载文件
   */
  async downloadFile(sessionId, fileId, projectId = '434222095683') {
    await this.ensureToken();

    const url = `https://biz-discoveryengine.googleapis.com/download/v1alpha/projects/${projectId}/locations/global/collections/default_collection/engines/agentspace-engine/sessions/${sessionId}:downloadFile?fileId=${fileId}&alt=media`;

    const result = this.curlRequest(url, {
      method: 'GET',
      headers: {
        ...this._getHeaders(),
        'x-goog-encode-response-if-executable': 'base64'
      }
    });

    return result;
  }

  /**
   * 获取通用请求头
   */
  _getHeaders() {
    return {
      'accept': '*/*',
      'authorization': `Bearer ${this.bearerToken}`,
      'content-type': 'application/json',
      'origin': 'https://business.gemini.google',
      'referer': 'https://business.gemini.google/',
      'x-client-data': 'CJqKywE=',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    };
  }
}

module.exports = GeminiClient;
