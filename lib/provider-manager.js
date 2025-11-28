/**
 * Provider Manager
 * Manages Google Business API providers (cookies & csesidx configurations)
 * Supports load balancing, failover, and health tracking
 */

const db = require('./db');

class ProviderManager {
  constructor() {
    this.providerCache = new Map();
    this.cacheExpiry = 60000; // Cache providers for 1 minute
    this.lastCacheUpdate = 0;
  }

  /**
   * Create a new provider
   * @param {Object} data - Provider data
   * @returns {Promise<number>} - Provider ID
   */
  async createProvider(data) {
    const { name, description, cookies, csesidx, priority = 0, maxConcurrent = 10 } = data;

    const id = await db.insert(
      `INSERT INTO providers (name, description, cookies, csesidx, priority, max_concurrent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, description || null, cookies, csesidx, priority, maxConcurrent]
    );

    // Invalidate cache
    this.lastCacheUpdate = 0;

    return id;
  }

  /**
   * Update a provider
   * @param {number} id - Provider ID
   * @param {Object} data - Updated data
   * @returns {Promise<boolean>}
   */
  async updateProvider(id, data) {
    const updates = [];
    const params = [];

    const allowedFields = ['name', 'description', 'cookies', 'csesidx', 'is_active', 'priority', 'max_concurrent'];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(data[field]);
      }
    }

    if (updates.length === 0) return false;

    params.push(id);
    const affected = await db.update(
      `UPDATE providers SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Invalidate cache
    this.lastCacheUpdate = 0;

    return affected > 0;
  }

  /**
   * Delete a provider
   * @param {number} id - Provider ID
   * @returns {Promise<boolean>}
   */
  async deleteProvider(id) {
    const affected = await db.update('DELETE FROM providers WHERE id = ?', [id]);
    this.lastCacheUpdate = 0;
    return affected > 0;
  }

  /**
   * Get a provider by ID
   * @param {number} id - Provider ID
   * @returns {Promise<Object|null>}
   */
  async getProvider(id) {
    return db.queryOne('SELECT * FROM providers WHERE id = ?', [id]);
  }

  /**
   * Get all providers
   * @param {boolean} activeOnly - Only return active providers
   * @returns {Promise<Array>}
   */
  async getAllProviders(activeOnly = false) {
    let sql = 'SELECT * FROM providers';
    if (activeOnly) {
      sql += ' WHERE is_active = TRUE';
    }
    sql += ' ORDER BY priority DESC, id ASC';
    return db.query(sql);
  }

  /**
   * Get active providers (cached)
   * @returns {Promise<Array>}
   */
  async getActiveProviders() {
    const now = Date.now();

    if (now - this.lastCacheUpdate > this.cacheExpiry) {
      const providers = await this.getAllProviders(true);
      this.providerCache.clear();
      providers.forEach(p => this.providerCache.set(p.id, p));
      this.lastCacheUpdate = now;
    }

    return Array.from(this.providerCache.values());
  }

  /**
   * Select the best available provider using load balancing
   * @param {number} userId - Optional user ID for user-specific binding
   * @returns {Promise<Object|null>}
   */
  async selectProvider(userId = null) {
    // If user has specific bindings, use their default or available providers
    if (userId) {
      const userProvider = await this.getUserDefaultProvider(userId);
      if (userProvider && userProvider.is_active && userProvider.current_load < userProvider.max_concurrent) {
        return userProvider;
      }

      // Get all user's bound providers
      const boundProviders = await this.getUserProviders(userId);
      const available = boundProviders.filter(p => p.is_active && p.current_load < p.max_concurrent);

      if (available.length > 0) {
        // Select by priority, then by lowest load
        available.sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return a.current_load - b.current_load;
        });
        return available[0];
      }
    }

    // Fallback to global selection
    const providers = await this.getActiveProviders();
    const available = providers.filter(p => p.current_load < p.max_concurrent);

    if (available.length === 0) {
      // All providers are at capacity, return the one with highest capacity remaining
      providers.sort((a, b) => {
        const aRemaining = a.max_concurrent - a.current_load;
        const bRemaining = b.max_concurrent - b.current_load;
        return bRemaining - aRemaining;
      });
      return providers[0] || null;
    }

    // Sort by priority, then by load
    available.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.current_load - b.current_load;
    });

    return available[0];
  }

  /**
   * Increment provider load
   * @param {number} providerId
   */
  async incrementLoad(providerId) {
    await db.update(
      'UPDATE providers SET current_load = current_load + 1 WHERE id = ?',
      [providerId]
    );

    // Update cache
    const cached = this.providerCache.get(providerId);
    if (cached) {
      cached.current_load++;
    }
  }

  /**
   * Decrement provider load
   * @param {number} providerId
   */
  async decrementLoad(providerId) {
    await db.update(
      'UPDATE providers SET current_load = GREATEST(0, current_load - 1) WHERE id = ?',
      [providerId]
    );

    // Update cache
    const cached = this.providerCache.get(providerId);
    if (cached && cached.current_load > 0) {
      cached.current_load--;
    }
  }

  /**
   * Record a successful request
   * @param {number} providerId
   */
  async recordSuccess(providerId) {
    await db.update(
      `UPDATE providers
       SET total_requests = total_requests + 1,
           last_success_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [providerId]
    );
  }

  /**
   * Record a failed request
   * @param {number} providerId
   * @param {string} errorMessage
   */
  async recordFailure(providerId, errorMessage) {
    await db.update(
      `UPDATE providers
       SET total_requests = total_requests + 1,
           failed_requests = failed_requests + 1,
           last_error = ?,
           last_error_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [errorMessage, providerId]
    );

    // Update cache
    const cached = this.providerCache.get(providerId);
    if (cached) {
      cached.failed_requests++;
    }
  }

  /**
   * Disable a provider (e.g., after repeated failures)
   * @param {number} providerId
   * @param {string} reason
   */
  async disableProvider(providerId, reason) {
    await db.update(
      'UPDATE providers SET is_active = FALSE, last_error = ? WHERE id = ?',
      [reason, providerId]
    );

    this.providerCache.delete(providerId);
  }

  /**
   * Bind a provider to a user
   * @param {number} userId
   * @param {number} providerId
   * @param {boolean} isDefault
   */
  async bindUserProvider(userId, providerId, isDefault = false) {
    // If setting as default, first unset any existing default
    if (isDefault) {
      await db.update(
        'UPDATE user_provider_bindings SET is_default = FALSE WHERE user_id = ?',
        [userId]
      );
    }

    try {
      await db.insert(
        `INSERT INTO user_provider_bindings (user_id, provider_id, is_default)
         VALUES (?, ?, ?)`,
        [userId, providerId, isDefault]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        // Update existing binding
        await db.update(
          'UPDATE user_provider_bindings SET is_default = ? WHERE user_id = ? AND provider_id = ?',
          [isDefault, userId, providerId]
        );
      } else {
        throw err;
      }
    }
  }

  /**
   * Unbind a provider from a user
   * @param {number} userId
   * @param {number} providerId
   */
  async unbindUserProvider(userId, providerId) {
    await db.update(
      'DELETE FROM user_provider_bindings WHERE user_id = ? AND provider_id = ?',
      [userId, providerId]
    );
  }

  /**
   * Get all providers bound to a user
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getUserProviders(userId) {
    return db.query(
      `SELECT p.*, upb.is_default
       FROM providers p
       JOIN user_provider_bindings upb ON p.id = upb.provider_id
       WHERE upb.user_id = ?
       ORDER BY upb.is_default DESC, p.priority DESC`,
      [userId]
    );
  }

  /**
   * Get user's default provider
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  async getUserDefaultProvider(userId) {
    return db.queryOne(
      `SELECT p.*
       FROM providers p
       JOIN user_provider_bindings upb ON p.id = upb.provider_id
       WHERE upb.user_id = ? AND upb.is_default = TRUE`,
      [userId]
    );
  }

  /**
   * Get provider statistics
   * @param {number} providerId
   * @returns {Promise<Object>}
   */
  async getProviderStats(providerId) {
    const provider = await this.getProvider(providerId);
    if (!provider) return null;

    const successRate = provider.total_requests > 0
      ? ((provider.total_requests - provider.failed_requests) / provider.total_requests * 100).toFixed(2)
      : 100;

    return {
      id: provider.id,
      name: provider.name,
      is_active: provider.is_active,
      current_load: provider.current_load,
      max_concurrent: provider.max_concurrent,
      load_percentage: (provider.current_load / provider.max_concurrent * 100).toFixed(1),
      total_requests: provider.total_requests,
      failed_requests: provider.failed_requests,
      success_rate: successRate + '%',
      last_success_at: provider.last_success_at,
      last_error: provider.last_error,
      last_error_at: provider.last_error_at
    };
  }
}

// Export singleton instance
module.exports = new ProviderManager();
