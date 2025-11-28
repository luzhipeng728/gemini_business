/**
 * MySQL-based Session Manager
 * Manages Gemini API sessions with context hash matching
 * Supports user-provider-session binding
 */

const crypto = require('crypto');
const db = require('./db');

class SessionManagerMySQL {
  constructor(options = {}) {
    this.sessionTTL = options.sessionTTL || 3600000; // 1 hour default
    this.maxSessionsPerUser = options.maxSessionsPerUser || 100;
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes

    // Start cleanup timer
    this.cleanupTimer = null;
  }

  /**
   * Start the cleanup timer
   */
  startCleanup() {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions().catch(err => {
        console.error('Session cleanup error:', err.message);
      });
    }, this.cleanupInterval);

    console.log('✓ Session cleanup timer started');
  }

  /**
   * Stop the cleanup timer
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Generate context hash from messages
   * Uses MD5 of the first user message for consistent session matching
   * @param {Array} messages - Gemini format messages array
   * @returns {string} - MD5 hash
   */
  generateContextHash(messages) {
    // Find the first user message
    const firstUserMessage = messages.find(m => m.role === 'user');

    if (!firstUserMessage) {
      // Fallback to random hash if no user message
      return crypto.randomBytes(16).toString('hex');
    }

    // Extract text from parts
    let textContent = '';
    if (firstUserMessage.parts) {
      for (const part of firstUserMessage.parts) {
        if (part.text) {
          textContent += part.text;
        }
      }
    }

    // Generate MD5 hash
    return crypto.createHash('md5').update(textContent).digest('hex');
  }

  /**
   * Get or create a session based on context hash
   * @param {Object} options
   * @returns {Promise<Object>} - Session object
   */
  async getOrCreateSession(options) {
    const {
      providerId,
      userId = null,
      messages,
      contextHash = null
    } = options;

    const hash = contextHash || this.generateContextHash(messages);

    // Try to find existing session
    let session = await this.findSession(providerId, userId, hash);

    if (session) {
      // Update last accessed time
      await this.touchSession(session.id);
      return {
        session,
        isNew: false
      };
    }

    // Create new session
    session = await this.createSession({
      providerId,
      userId,
      contextHash: hash,
      conversationHistory: messages
    });

    return {
      session,
      isNew: true
    };
  }

  /**
   * Find an existing session
   * @param {number} providerId
   * @param {number|null} userId
   * @param {string} contextHash
   * @returns {Promise<Object|null>}
   */
  async findSession(providerId, userId, contextHash) {
    let sql = `
      SELECT * FROM sessions
      WHERE provider_id = ?
        AND context_hash = ?
        AND is_active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
    `;
    const params = [providerId, contextHash];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    sql += ' ORDER BY last_accessed_at DESC LIMIT 1';

    return db.queryOne(sql, params);
  }

  /**
   * Create a new session
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async createSession(data) {
    const {
      providerId,
      userId = null,
      contextHash,
      geminiSessionId = null,
      conversationHistory = []
    } = data;

    // Check session limit for user
    if (userId) {
      const count = await this.getUserSessionCount(userId);
      if (count >= this.maxSessionsPerUser) {
        // Delete oldest session
        await this.deleteOldestUserSession(userId);
      }
    }

    const expiresAt = new Date(Date.now() + this.sessionTTL);

    const id = await db.insert(
      `INSERT INTO sessions
       (provider_id, user_id, context_hash, gemini_session_id, conversation_history, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        providerId,
        userId,
        contextHash,
        geminiSessionId,
        JSON.stringify(conversationHistory),
        expiresAt
      ]
    );

    return {
      id,
      provider_id: providerId,
      user_id: userId,
      context_hash: contextHash,
      gemini_session_id: geminiSessionId,
      conversation_history: conversationHistory,
      message_count: 0,
      is_active: true,
      expires_at: expiresAt
    };
  }

  /**
   * Update session with Gemini session ID
   * @param {number} sessionId
   * @param {string} geminiSessionId
   */
  async updateGeminiSessionId(sessionId, geminiSessionId) {
    await db.update(
      'UPDATE sessions SET gemini_session_id = ? WHERE id = ?',
      [geminiSessionId, sessionId]
    );
  }

  /**
   * Update session conversation history
   * @param {number} sessionId
   * @param {Array} history
   */
  async updateConversationHistory(sessionId, history) {
    await db.update(
      `UPDATE sessions
       SET conversation_history = ?,
           message_count = ?,
           last_accessed_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(history), history.length, sessionId]
    );
  }

  /**
   * Add a message to session history
   * @param {number} sessionId
   * @param {Object} message
   */
  async addMessage(sessionId, message) {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const history = session.conversation_history || [];
    history.push(message);

    await this.updateConversationHistory(sessionId, history);
  }

  /**
   * Touch a session (update last accessed time)
   * @param {number} sessionId
   */
  async touchSession(sessionId) {
    const newExpiresAt = new Date(Date.now() + this.sessionTTL);
    await db.update(
      'UPDATE sessions SET last_accessed_at = NOW(), expires_at = ? WHERE id = ?',
      [newExpiresAt, sessionId]
    );
  }

  /**
   * Get a session by ID
   * @param {number} sessionId
   * @returns {Promise<Object|null>}
   */
  async getSession(sessionId) {
    const session = await db.queryOne('SELECT * FROM sessions WHERE id = ?', [sessionId]);

    if (session && session.conversation_history) {
      // Parse JSON if stored as string
      if (typeof session.conversation_history === 'string') {
        session.conversation_history = JSON.parse(session.conversation_history);
      }
    }

    return session;
  }

  /**
   * Deactivate a session
   * @param {number} sessionId
   */
  async deactivateSession(sessionId) {
    await db.update('UPDATE sessions SET is_active = FALSE WHERE id = ?', [sessionId]);
  }

  /**
   * Delete a session
   * @param {number} sessionId
   */
  async deleteSession(sessionId) {
    await db.update('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }

  /**
   * Get user's session count
   * @param {number} userId
   * @returns {Promise<number>}
   */
  async getUserSessionCount(userId) {
    const result = await db.queryOne(
      'SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );
    return result ? result.count : 0;
  }

  /**
   * Delete oldest session for a user
   * @param {number} userId
   */
  async deleteOldestUserSession(userId) {
    const oldest = await db.queryOne(
      `SELECT id FROM sessions
       WHERE user_id = ? AND is_active = TRUE
       ORDER BY last_accessed_at ASC LIMIT 1`,
      [userId]
    );

    if (oldest) {
      await this.deleteSession(oldest.id);
    }
  }

  /**
   * Get all sessions for a user
   * @param {number} userId
   * @param {boolean} activeOnly
   * @returns {Promise<Array>}
   */
  async getUserSessions(userId, activeOnly = true) {
    let sql = 'SELECT * FROM sessions WHERE user_id = ?';
    if (activeOnly) {
      sql += ' AND is_active = TRUE';
    }
    sql += ' ORDER BY last_accessed_at DESC';

    return db.query(sql, [userId]);
  }

  /**
   * Get all sessions for a provider
   * @param {number} providerId
   * @returns {Promise<Array>}
   */
  async getProviderSessions(providerId) {
    return db.query(
      `SELECT * FROM sessions
       WHERE provider_id = ? AND is_active = TRUE
       ORDER BY last_accessed_at DESC`,
      [providerId]
    );
  }

  /**
   * Cleanup expired sessions
   * @returns {Promise<number>} - Number of deleted sessions
   */
  async cleanupExpiredSessions() {
    const result = await db.update(
      'DELETE FROM sessions WHERE expires_at < NOW() OR is_active = FALSE'
    );

    if (result > 0) {
      console.log(`Cleaned up ${result} expired sessions`);
    }

    return result;
  }

  /**
   * Get session statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const [activeCount] = await db.query(
      'SELECT COUNT(*) as count FROM sessions WHERE is_active = TRUE'
    );

    const [totalCount] = await db.query('SELECT COUNT(*) as count FROM sessions');

    const [avgMessages] = await db.query(
      'SELECT AVG(message_count) as avg FROM sessions WHERE is_active = TRUE'
    );

    return {
      active_sessions: activeCount.count,
      total_sessions: totalCount.count,
      average_messages: Math.round((avgMessages.avg || 0) * 100) / 100
    };
  }
}

// Export class for instantiation with custom options
module.exports = SessionManagerMySQL;
