/**
 * Provider 调度器
 * 负载均衡 + 健康检查 + 故障转移
 */

const { Provider } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');

class ProviderScheduler {
  constructor() {
    // 恢复定时器
    this.recoveryTimer = null;
  }

  /**
   * 启动调度器
   */
  start() {
    // 每分钟检查冷却中的 Provider
    this.recoveryTimer = setInterval(async () => {
      try {
        const recovered = await Provider.recoverCoolingProviders();
        if (recovered > 0) {
          logger.info({ count: recovered }, 'Providers recovered from cooling');
        }
      } catch (error) {
        logger.error({ error: error.message }, 'Provider recovery check failed');
      }
    }, 60000);

    logger.info('Provider scheduler started');
  }

  /**
   * 停止调度器
   */
  stop() {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    logger.info('Provider scheduler stopped');
  }

  /**
   * 选择最优 Provider
   * @param {Object} options
   * @param {number} options.groupId - 可选的分组ID
   * @param {number} options.excludeId - 排除的 Provider ID
   * @returns {Promise<Object>} Provider
   */
  async selectProvider(options = {}) {
    const { groupId = null, excludeId = null } = options;

    const providers = await Provider.getAvailableProviders(groupId);

    // 过滤排除的 Provider
    let candidates = providers;
    if (excludeId) {
      candidates = providers.filter(p => p.id !== excludeId);
    }

    if (candidates.length === 0) {
      throw new Error('No available provider');
    }

    // 加权随机选择（避免热点）
    const selected = this.weightedRandom(candidates);

    logger.debug({
      providerId: selected.id,
      healthScore: selected.health_score,
      load: `${selected.current_load}/${selected.max_concurrent}`
    }, 'Provider selected');

    return selected;
  }

  /**
   * 加权随机选择
   * 权重 = 健康分 * (1 - 负载率)
   */
  weightedRandom(providers) {
    const weights = providers.map(p => {
      const loadRatio = p.current_load / p.max_concurrent;
      return p.health_score * (1 - loadRatio);
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < providers.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return providers[i];
      }
    }

    return providers[0];
  }

  /**
   * 获取 Provider 并增加负载
   */
  async acquireProvider(options = {}) {
    const provider = await this.selectProvider(options);
    await Provider.incrementLoad(provider.id);
    return provider;
  }

  /**
   * 释放 Provider（减少负载）
   */
  async releaseProvider(providerId) {
    await Provider.decrementLoad(providerId);
  }

  /**
   * 记录成功
   */
  async recordSuccess(providerId) {
    await Provider.recordSuccess(providerId);
  }

  /**
   * 记录失败
   */
  async recordFailure(providerId, errorMessage) {
    await Provider.recordFailure(providerId, errorMessage);
    logger.warn({ providerId, error: errorMessage }, 'Provider request failed');
  }

  /**
   * 执行带重试的操作
   * @param {Function} operation - 异步操作
   * @param {Object} options - 选项
   * @returns {Promise<Object>} { result, provider }
   */
  async executeWithRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      groupId = null,
      onProviderChange = null
    } = options;

    let lastError = null;
    let excludeIds = new Set();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // 选择 Provider
      const provider = await this.acquireProvider({
        groupId,
        excludeId: excludeIds.size > 0 ? Array.from(excludeIds) : null
      });

      try {
        // 执行操作
        const result = await operation(provider);

        // 成功，记录并返回
        await this.recordSuccess(provider.id);
        await this.releaseProvider(provider.id);

        return { result, provider };

      } catch (error) {
        lastError = error;
        logger.warn({
          providerId: provider.id,
          attempt,
          error: error.message
        }, 'Operation failed, retrying');

        // 记录失败并释放
        await this.recordFailure(provider.id, error.message);
        await this.releaseProvider(provider.id);

        // 排除这个 Provider
        excludeIds.add(provider.id);

        // 通知 Provider 变更
        if (onProviderChange) {
          onProviderChange(provider.id, error);
        }
      }
    }

    throw lastError || new Error('All providers failed');
  }

  /**
   * 获取统计
   */
  async getStats() {
    return Provider.getStats();
  }
}

module.exports = new ProviderScheduler();
