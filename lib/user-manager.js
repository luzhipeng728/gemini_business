/**
 * User Manager
 * Handles user accounts and API key management
 */

const crypto = require('crypto');
const db = require('./db');

class UserManager {
  constructor() {
    // Simple password hashing (in production, use bcrypt)
    this.hashPassword = (password) => {
      return crypto.createHash('sha256').update(password).digest('hex');
    };
  }

  /**
   * Create a new user
   * @param {Object} data - User data
   * @returns {Promise<number>} - User ID
   */
  async createUser(data) {
    const { username, email, password, isAdmin = false } = data;

    const passwordHash = this.hashPassword(password);

    const id = await db.insert(
      `INSERT INTO users (username, email, password_hash, is_admin)
       VALUES (?, ?, ?, ?)`,
      [username, email || null, passwordHash, isAdmin]
    );

    return id;
  }

  /**
   * Authenticate a user
   * @param {string} username
   * @param {string} password
   * @returns {Promise<Object|null>} - User object or null if auth fails
   */
  async authenticate(username, password) {
    const passwordHash = this.hashPassword(password);

    const user = await db.queryOne(
      `SELECT id, username, email, is_admin, is_active, created_at
       FROM users
       WHERE username = ? AND password_hash = ? AND is_active = TRUE`,
      [username, passwordHash]
    );

    return user;
  }

  /**
   * Get user by ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getUser(id) {
    return db.queryOne(
      `SELECT id, username, email, is_admin, is_active, created_at, updated_at
       FROM users WHERE id = ?`,
      [id]
    );
  }

  /**
   * Get user by username
   * @param {string} username
   * @returns {Promise<Object|null>}
   */
  async getUserByUsername(username) {
    return db.queryOne(
      `SELECT id, username, email, is_admin, is_active, created_at, updated_at
       FROM users WHERE username = ?`,
      [username]
    );
  }

  /**
   * Get all users
   * @returns {Promise<Array>}
   */
  async getAllUsers() {
    return db.query(
      `SELECT id, username, email, is_admin, is_active, created_at, updated_at
       FROM users ORDER BY id`
    );
  }

  /**
   * Update user
   * @param {number} id
   * @param {Object} data
   * @returns {Promise<boolean>}
   */
  async updateUser(id, data) {
    const updates = [];
    const params = [];

    if (data.email !== undefined) {
      updates.push('email = ?');
      params.push(data.email);
    }

    if (data.password) {
      updates.push('password_hash = ?');
      params.push(this.hashPassword(data.password));
    }

    if (data.is_admin !== undefined) {
      updates.push('is_admin = ?');
      params.push(data.is_admin);
    }

    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(data.is_active);
    }

    if (updates.length === 0) return false;

    params.push(id);
    const affected = await db.update(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return affected > 0;
  }

  /**
   * Delete user
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async deleteUser(id) {
    const affected = await db.update('DELETE FROM users WHERE id = ?', [id]);
    return affected > 0;
  }

  // ==================== API Key Management ====================

  /**
   * Generate a new API key
   * @returns {string}
   */
  generateApiKey() {
    const prefix = 'gm-';
    const randomPart = crypto.randomBytes(24).toString('base64url');
    return prefix + randomPart;
  }

  /**
   * Create a new API key for a user
   * @param {number} userId
   * @param {Object} options
   * @returns {Promise<Object>} - Created API key info
   */
  async createApiKey(userId, options = {}) {
    const {
      name = 'Default Key',
      rateLimit = 60,
      dailyLimit = 1000,
      expiresAt = null
    } = options;

    const apiKey = this.generateApiKey();

    const id = await db.insert(
      `INSERT INTO api_keys (user_id, api_key, name, rate_limit, daily_limit, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, apiKey, name, rateLimit, dailyLimit, expiresAt]
    );

    return {
      id,
      user_id: userId,
      api_key: apiKey,
      name,
      rate_limit: rateLimit,
      daily_limit: dailyLimit,
      expires_at: expiresAt
    };
  }

  /**
   * Validate an API key
   * @param {string} apiKey
   * @returns {Promise<Object|null>} - API key info with user data, or null if invalid
   */
  async validateApiKey(apiKey) {
    const keyInfo = await db.queryOne(
      `SELECT ak.*, u.username, u.is_admin
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.api_key = ?
         AND ak.is_active = TRUE
         AND u.is_active = TRUE
         AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
      [apiKey]
    );

    if (!keyInfo) return null;

    // Check daily limit
    if (keyInfo.daily_usage >= keyInfo.daily_limit) {
      return { ...keyInfo, limitExceeded: true };
    }

    // Update last used timestamp
    await db.update(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = ?',
      [keyInfo.id]
    );

    return keyInfo;
  }

  /**
   * Increment daily usage for an API key
   * @param {number} apiKeyId
   */
  async incrementApiKeyUsage(apiKeyId) {
    await db.update(
      'UPDATE api_keys SET daily_usage = daily_usage + 1 WHERE id = ?',
      [apiKeyId]
    );
  }

  /**
   * Reset daily usage for all API keys (call this daily via cron)
   */
  async resetDailyUsage() {
    await db.update('UPDATE api_keys SET daily_usage = 0');
  }

  /**
   * Get all API keys for a user
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getUserApiKeys(userId) {
    return db.query(
      `SELECT id, api_key, name, is_active, rate_limit, daily_limit, daily_usage,
              last_used_at, expires_at, created_at
       FROM api_keys
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );
  }

  /**
   * Update an API key
   * @param {number} apiKeyId
   * @param {Object} data
   * @returns {Promise<boolean>}
   */
  async updateApiKey(apiKeyId, data) {
    const updates = [];
    const params = [];

    const allowedFields = ['name', 'is_active', 'rate_limit', 'daily_limit', 'expires_at'];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(data[field]);
      }
    }

    if (updates.length === 0) return false;

    params.push(apiKeyId);
    const affected = await db.update(
      `UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return affected > 0;
  }

  /**
   * Delete an API key
   * @param {number} apiKeyId
   * @returns {Promise<boolean>}
   */
  async deleteApiKey(apiKeyId) {
    const affected = await db.update('DELETE FROM api_keys WHERE id = ?', [apiKeyId]);
    return affected > 0;
  }

  /**
   * Get API key by ID
   * @param {number} apiKeyId
   * @returns {Promise<Object|null>}
   */
  async getApiKey(apiKeyId) {
    return db.queryOne(
      `SELECT * FROM api_keys WHERE id = ?`,
      [apiKeyId]
    );
  }
}

// Export singleton instance
module.exports = new UserManager();
