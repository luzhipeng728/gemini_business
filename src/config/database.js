/**
 * 数据库连接池管理
 * 基于 mysql2/promise，支持连接池和事务
 */

const mysql = require('mysql2/promise');
const config = require('./index');

let pool = null;

/**
 * 初始化数据库连接池
 */
async function initDatabase() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
    connectionLimit: config.database.connectionLimit,
    ssl: config.database.ssl,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  });

  // 测试连接
  try {
    const conn = await pool.getConnection();
    conn.release();
    console.log('✓ Database pool initialized');
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    throw error;
  }

  return pool;
}

/**
 * 获取连接池
 */
function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

/**
 * 执行查询
 */
async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

/**
 * 查询单行
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 执行插入，返回 insertId
 */
async function insert(sql, params = []) {
  const p = getPool();
  const [result] = await p.execute(sql, params);
  return result.insertId;
}

/**
 * 执行更新/删除，返回 affectedRows
 */
async function update(sql, params = []) {
  const p = getPool();
  const [result] = await p.execute(sql, params);
  return result.affectedRows;
}

/**
 * 事务执行
 */
async function transaction(callback) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback({
      query: (sql, params) => conn.execute(sql, params).then(r => r[0]),
      queryOne: async (sql, params) => {
        const [rows] = await conn.execute(sql, params);
        return rows[0] || null;
      },
      insert: async (sql, params) => {
        const [result] = await conn.execute(sql, params);
        return result.insertId;
      },
      update: async (sql, params) => {
        const [result] = await conn.execute(sql, params);
        return result.affectedRows;
      }
    });
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * 关闭连接池
 */
async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database pool closed');
  }
}

/**
 * 健康检查
 */
async function healthCheck() {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  initDatabase,
  getPool,
  query,
  queryOne,
  insert,
  update,
  transaction,
  closeDatabase,
  healthCheck
};
