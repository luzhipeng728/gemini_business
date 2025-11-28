/**
 * 基础模型类
 * 提供通用的 CRUD 操作
 */

const db = require('../config/database');

class BaseModel {
  static tableName = '';
  static primaryKey = 'id';

  /**
   * 查询所有记录
   */
  static async findAll(options = {}) {
    const { where = {}, orderBy, limit, offset } = options;

    let sql = `SELECT * FROM ${this.tableName}`;
    const params = [];

    // WHERE 条件
    const conditions = [];
    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else if (typeof value === 'object' && value.$in) {
        const placeholders = value.$in.map(() => '?').join(',');
        conditions.push(`${key} IN (${placeholders})`);
        params.push(...value.$in);
      } else if (typeof value === 'object' && value.$gte !== undefined) {
        conditions.push(`${key} >= ?`);
        params.push(value.$gte);
      } else if (typeof value === 'object' && value.$lte !== undefined) {
        conditions.push(`${key} <= ?`);
        params.push(value.$lte);
      } else if (typeof value === 'object' && value.$like !== undefined) {
        conditions.push(`${key} LIKE ?`);
        params.push(value.$like);
      } else {
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    // ORDER BY
    if (orderBy) {
      const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
      sql += ` ORDER BY ${orders.join(', ')}`;
    }

    // LIMIT & OFFSET - 直接拼接数字（MySQL LIMIT 不支持占位符）
    if (limit) {
      sql += ` LIMIT ${parseInt(limit, 10)}`;
    }
    if (offset) {
      sql += ` OFFSET ${parseInt(offset, 10)}`;
    }

    return db.query(sql, params);
  }

  /**
   * 查询单条记录
   */
  static async findOne(where = {}) {
    const results = await this.findAll({ where, limit: 1 });
    return results[0] || null;
  }

  /**
   * 根据主键查询
   */
  static async findById(id) {
    return this.findOne({ [this.primaryKey]: id });
  }

  /**
   * 计数
   */
  static async count(where = {}) {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params = [];

    const conditions = [];
    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else {
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await db.queryOne(sql, params);
    return result ? result.count : 0;
  }

  /**
   * 创建记录
   */
  static async create(data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');

    const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
    const id = await db.insert(sql, values);

    return this.findById(id);
  }

  /**
   * 更新记录
   */
  static async update(id, data) {
    const keys = Object.keys(data);
    if (keys.length === 0) return false;

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), id];

    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${this.primaryKey} = ?`;
    const affected = await db.update(sql, values);

    return affected > 0;
  }

  /**
   * 删除记录
   */
  static async delete(id) {
    const sql = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
    const affected = await db.update(sql, [id]);
    return affected > 0;
  }

  /**
   * 批量插入
   */
  static async bulkCreate(dataArray) {
    if (!dataArray || dataArray.length === 0) return [];

    const keys = Object.keys(dataArray[0]);
    const placeholders = `(${keys.map(() => '?').join(', ')})`;
    const allPlaceholders = dataArray.map(() => placeholders).join(', ');
    const allValues = dataArray.flatMap(d => Object.values(d));

    const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES ${allPlaceholders}`;
    await db.insert(sql, allValues);

    return dataArray.length;
  }

  /**
   * 条件更新
   */
  static async updateWhere(where, data) {
    const dataKeys = Object.keys(data);
    if (dataKeys.length === 0) return 0;

    const setClause = dataKeys.map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data)];

    let sql = `UPDATE ${this.tableName} SET ${setClause}`;

    const conditions = [];
    for (const [key, value] of Object.entries(where)) {
      conditions.push(`${key} = ?`);
      values.push(value);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    return db.update(sql, values);
  }

  /**
   * 条件删除
   */
  static async deleteWhere(where) {
    const conditions = [];
    const values = [];

    for (const [key, value] of Object.entries(where)) {
      if (typeof value === 'object' && value.$lte !== undefined) {
        conditions.push(`${key} <= ?`);
        values.push(value.$lte);
      } else {
        conditions.push(`${key} = ?`);
        values.push(value);
      }
    }

    let sql = `DELETE FROM ${this.tableName}`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    return db.update(sql, values);
  }
}

module.exports = BaseModel;
