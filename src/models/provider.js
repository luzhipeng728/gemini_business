/**
 * Provider 模型
 * 管理 Google Business API 账号
 */

const BaseModel = require('./base');
const db = require('../config/database');
const { encrypt, decrypt } = require('../utils/crypto');
const config = require('../config');

class Provider extends BaseModel {
  static tableName = 'providers';

  /**
   * 创建 Provider（加密 cookies）
   */
  static async create(data) {
    const encrypted = { ...data };
    if (data.cookies) {
      encrypted.cookies = encrypt(data.cookies);
    }
    return super.create(encrypted);
  }

  /**
   * 更新 Provider（加密 cookies）
   */
  static async update(id, data) {
    const encrypted = { ...data };
    if (data.cookies) {
      encrypted.cookies = encrypt(data.cookies);
    }
    return super.update(id, encrypted);
  }

  /**
   * 获取 Provider（解密 cookies）
   */
  static async findById(id) {
    const provider = await super.findById(id);
    if (provider && provider.cookies) {
      provider.cookies = decrypt(provider.cookies);
    }
    return provider;
  }

  /**
   * 获取可用的 Provider 列表（用于调度）
   * 按健康分和负载排序
   */
  static async getAvailableProviders(groupId = null) {
    let sql = `
      SELECT * FROM providers
      WHERE status = 'active'
        AND health_score >= ?
        AND current_load < max_concurrent
    `;
    const params = [config.provider.healthThreshold];

    if (groupId) {
      sql += ` AND group_id = ?`;
      params.push(groupId);
    }

    sql += ` ORDER BY health_score DESC, (current_load / max_concurrent) ASC LIMIT 20`;

    const providers = await db.query(sql, params);

    // 解密 cookies
    return providers.map(p => ({
      ...p,
      cookies: decrypt(p.cookies)
    }));
  }

  /**
   * 增加当前负载
   */
  static async incrementLoad(id) {
    return db.update(
      `UPDATE providers SET current_load = current_load + 1 WHERE id = ?`,
      [id]
    );
  }

  /**
   * 减少当前负载
   */
  static async decrementLoad(id) {
    return db.update(
      `UPDATE providers SET current_load = GREATEST(0, current_load - 1) WHERE id = ?`,
      [id]
    );
  }

  /**
   * 记录成功请求
   */
  static async recordSuccess(id) {
    return db.update(`
      UPDATE providers SET
        consecutive_failures = 0,
        last_success_at = NOW(),
        health_score = LEAST(100, health_score + 1),
        total_requests = total_requests + 1
      WHERE id = ?
    `, [id]);
  }

  /**
   * 记录失败请求
   */
  static async recordFailure(id, errorMessage = null) {
    const provider = await this.findById(id);
    if (!provider) return false;

    const failures = provider.consecutive_failures + 1;
    let newStatus = provider.status;
    let cooldownUntil = null;

    // 连续失败超过阈值，进入冷却
    if (failures >= config.provider.failureThreshold) {
      newStatus = 'cooling';
      cooldownUntil = new Date(Date.now() + config.provider.cooldownDuration);
    }

    // 连续失败超过阈值的两倍，标记为失败
    if (failures >= config.provider.failureThreshold * 2) {
      newStatus = 'failed';
    }

    const updates = {
      consecutive_failures: failures,
      last_failure_at: new Date(),
      health_score: Math.max(0, provider.health_score - 10),
      failed_requests: provider.failed_requests + 1,
      total_requests: provider.total_requests + 1,
      status: newStatus
    };

    if (cooldownUntil) {
      updates.cooldown_until = cooldownUntil;
    }

    return this.update(id, updates);
  }

  /**
   * 恢复冷却中的 Provider
   */
  static async recoverCoolingProviders() {
    return db.update(`
      UPDATE providers
      SET status = 'active',
          consecutive_failures = 0,
          health_score = 50
      WHERE status = 'cooling'
        AND cooldown_until <= NOW()
    `);
  }

  /**
   * 获取 Provider 统计
   */
  static async getStats() {
    const stats = await db.queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(status = 'active') as active,
        SUM(status = 'cooling') as cooling,
        SUM(status = 'failed') as failed,
        SUM(status = 'inactive') as inactive,
        SUM(current_load) as total_load,
        SUM(max_concurrent) as total_capacity,
        AVG(health_score) as avg_health
      FROM providers
    `);

    return {
      total: stats.total || 0,
      active: stats.active || 0,
      cooling: stats.cooling || 0,
      failed: stats.failed || 0,
      inactive: stats.inactive || 0,
      totalLoad: stats.total_load || 0,
      totalCapacity: stats.total_capacity || 0,
      avgHealth: Math.round(stats.avg_health || 0),
      loadPercentage: stats.total_capacity > 0
        ? Math.round((stats.total_load / stats.total_capacity) * 100)
        : 0
    };
  }

  /**
   * 批量导入 Provider
   */
  static async bulkImport(providers) {
    const results = { success: 0, failed: 0, errors: [] };

    for (const p of providers) {
      try {
        await this.create({
          name: p.name || `Provider-${Date.now()}`,
          group_id: p.group_id || null,
          cookies: p.cookies,
          csesidx: p.csesidx,
          max_concurrent: p.max_concurrent || config.provider.maxConcurrent
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({ name: p.name, error: error.message });
      }
    }

    return results;
  }
}

module.exports = Provider;
