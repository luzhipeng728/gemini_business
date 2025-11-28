/**
 * 会话管理器
 * 使用 MD5 哈希映射用户上下文到 Gemini Business Session
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SessionManager {
  constructor(options = {}) {
    // 会话存储路径
    this.storagePath = options.storagePath || path.join(__dirname, '.sessions');

    // 内存缓存: MD5 -> SessionInfo
    this.sessions = new Map();

    // 会话过期时间 (默认 30 分钟)
    this.sessionTTL = options.sessionTTL || 30 * 60 * 1000;

    // 最大会话数
    this.maxSessions = options.maxSessions || 100;

    // 初始化存储目录
    this._initStorage();

    // 加载已有会话
    this._loadSessions();

    // 定期清理过期会话
    this._startCleanupTimer();
  }

  /**
   * 根据消息内容生成上下文 MD5
   * @param {Array} messages - OpenAI 格式的消息数组
   * @returns {string} MD5 哈希值
   */
  generateContextHash(messages) {
    if (!messages || messages.length === 0) {
      return crypto.randomBytes(16).toString('hex');
    }

    // 提取所有消息内容构建上下文指纹
    // 策略：使用前 N 条消息的内容来生成哈希，确保同一对话链能匹配
    const contextParts = [];

    // 取前 5 条消息作为上下文指纹（排除最后一条，因为那是新消息）
    const contextMessages = messages.slice(0, Math.min(5, messages.length - 1));

    for (const msg of contextMessages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
      contextParts.push(`${msg.role}:${content}`);
    }

    // 如果没有历史消息，使用随机值（新对话）
    if (contextParts.length === 0) {
      return crypto.randomBytes(16).toString('hex');
    }

    const contextString = contextParts.join('|');
    return crypto.createHash('md5').update(contextString).digest('hex');
  }

  /**
   * 获取或创建会话
   * @param {string} contextHash - 上下文哈希
   * @returns {Object|null} 会话信息
   */
  getSession(contextHash) {
    const session = this.sessions.get(contextHash);

    if (session) {
      // 检查是否过期
      if (Date.now() - session.lastAccess > this.sessionTTL) {
        this.sessions.delete(contextHash);
        this._saveSession(contextHash, null);
        return null;
      }

      // 更新访问时间
      session.lastAccess = Date.now();
      return session;
    }

    return null;
  }

  /**
   * 保存会话
   * @param {string} contextHash - 上下文哈希
   * @param {Object} sessionInfo - 会话信息
   */
  setSession(contextHash, sessionInfo) {
    // 检查是否需要清理旧会话
    if (this.sessions.size >= this.maxSessions) {
      this._evictOldestSession();
    }

    const session = {
      ...sessionInfo,
      contextHash,
      createdAt: sessionInfo.createdAt || Date.now(),
      lastAccess: Date.now()
    };

    this.sessions.set(contextHash, session);
    this._saveSession(contextHash, session);
  }

  /**
   * 删除会话
   * @param {string} contextHash - 上下文哈希
   */
  deleteSession(contextHash) {
    this.sessions.delete(contextHash);
    this._saveSession(contextHash, null);
  }

  /**
   * 获取所有会话统计
   */
  getStats() {
    const now = Date.now();
    let activeCount = 0;
    let expiredCount = 0;

    for (const [, session] of this.sessions) {
      if (now - session.lastAccess > this.sessionTTL) {
        expiredCount++;
      } else {
        activeCount++;
      }
    }

    return {
      total: this.sessions.size,
      active: activeCount,
      expired: expiredCount,
      maxSessions: this.maxSessions,
      sessionTTL: this.sessionTTL
    };
  }

  /**
   * 初始化存储目录
   */
  _initStorage() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * 加载已有会话
   */
  _loadSessions() {
    try {
      const indexPath = path.join(this.storagePath, 'sessions.json');
      if (fs.existsSync(indexPath)) {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        const now = Date.now();

        for (const [hash, session] of Object.entries(data)) {
          // 只加载未过期的会话
          if (now - session.lastAccess < this.sessionTTL) {
            this.sessions.set(hash, session);
          }
        }

        console.log(`[SessionManager] 已加载 ${this.sessions.size} 个会话`);
      }
    } catch (error) {
      console.error('[SessionManager] 加载会话失败:', error.message);
    }
  }

  /**
   * 保存会话到磁盘
   */
  _saveSession(contextHash, session) {
    try {
      const indexPath = path.join(this.storagePath, 'sessions.json');
      let data = {};

      if (fs.existsSync(indexPath)) {
        data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      }

      if (session) {
        data[contextHash] = session;
      } else {
        delete data[contextHash];
      }

      fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[SessionManager] 保存会话失败:', error.message);
    }
  }

  /**
   * 淘汰最旧的会话
   */
  _evictOldestSession() {
    let oldestHash = null;
    let oldestTime = Infinity;

    for (const [hash, session] of this.sessions) {
      if (session.lastAccess < oldestTime) {
        oldestTime = session.lastAccess;
        oldestHash = hash;
      }
    }

    if (oldestHash) {
      console.log(`[SessionManager] 淘汰会话: ${oldestHash}`);
      this.deleteSession(oldestHash);
    }
  }

  /**
   * 启动定期清理定时器
   */
  _startCleanupTimer() {
    // 每 5 分钟清理一次过期会话
    setInterval(() => {
      const now = Date.now();
      const toDelete = [];

      for (const [hash, session] of this.sessions) {
        if (now - session.lastAccess > this.sessionTTL) {
          toDelete.push(hash);
        }
      }

      for (const hash of toDelete) {
        this.deleteSession(hash);
      }

      if (toDelete.length > 0) {
        console.log(`[SessionManager] 清理了 ${toDelete.length} 个过期会话`);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * 关闭会话管理器
   */
  close() {
    // 保存所有会话
    try {
      const indexPath = path.join(this.storagePath, 'sessions.json');
      const data = Object.fromEntries(this.sessions);
      fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
      console.log('[SessionManager] 会话已保存');
    } catch (error) {
      console.error('[SessionManager] 关闭时保存失败:', error.message);
    }
  }
}

module.exports = SessionManager;
