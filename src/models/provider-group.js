/**
 * Provider 分组模型
 */

const BaseModel = require('./base');

class ProviderGroup extends BaseModel {
  static tableName = 'provider_groups';

  /**
   * 获取所有活跃分组
   */
  static async getActiveGroups() {
    return this.findAll({
      where: { is_active: 1 },
      orderBy: ['priority DESC', 'name ASC']
    });
  }

  /**
   * 获取分组及其 Provider 数量
   */
  static async getGroupsWithCount() {
    const db = require('../config/database');
    return db.query(`
      SELECT g.*, COUNT(p.id) as provider_count
      FROM provider_groups g
      LEFT JOIN providers p ON g.id = p.group_id AND p.status = 'active'
      GROUP BY g.id
      ORDER BY g.priority DESC, g.name ASC
    `);
  }
}

module.exports = ProviderGroup;
