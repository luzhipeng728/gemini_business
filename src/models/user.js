/**
 * User 模型
 */

const BaseModel = require('./base');
const { hashPassword, verifyPassword } = require('../utils/crypto');

class User extends BaseModel {
  static tableName = 'users';

  /**
   * 创建用户（密码哈希）
   */
  static async create(data) {
    const userData = { ...data };
    if (data.password) {
      userData.password_hash = hashPassword(data.password);
      delete userData.password;
    }
    return super.create(userData);
  }

  /**
   * 验证用户登录
   */
  static async authenticate(username, password) {
    // 直接查询用户（不通过 findAll，避免密码字段被删除）
    const db = require('../config/database');
    const pool = db.getPool();
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE username = ? AND is_active = 1 LIMIT 1',
      [username]
    );

    const user = users[0];
    if (!user) return null;

    if (verifyPassword(password, user.password_hash)) {
      // 不返回密码哈希
      delete user.password_hash;
      return user;
    }

    return null;
  }

  /**
   * 更新密码
   */
  static async updatePassword(userId, newPassword) {
    return this.update(userId, {
      password_hash: hashPassword(newPassword)
    });
  }

  /**
   * 获取用户（不含密码）
   */
  static async findById(id) {
    const user = await super.findById(id);
    if (user) {
      delete user.password_hash;
    }
    return user;
  }

  /**
   * 获取所有用户（不含密码）
   */
  static async findAll(options = {}) {
    const users = await super.findAll(options);
    return users.map(u => {
      delete u.password_hash;
      return u;
    });
  }
}

module.exports = User;
