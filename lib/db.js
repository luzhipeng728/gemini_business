/**
 * MySQL Database Connection Pool Manager
 * Provides connection pool and common database operations
 */

const mysql = require('mysql2/promise');

// Default database configuration
const DEFAULT_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gemini_business',
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

let pool = null;

/**
 * Initialize database connection pool
 * @param {Object} config - Optional custom configuration
 * @returns {Promise<mysql.Pool>}
 */
async function initPool(config = {}) {
  if (pool) {
    return pool;
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  pool = mysql.createPool(finalConfig);

  // Test connection
  try {
    const conn = await pool.getConnection();
    console.log('✓ Database pool initialized successfully');
    conn.release();
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    throw error;
  }

  return pool;
}

/**
 * Get the connection pool (initialize if needed)
 * @returns {Promise<mysql.Pool>}
 */
async function getPool() {
  if (!pool) {
    await initPool();
  }
  return pool;
}

/**
 * Execute a query with parameters
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>}
 */
async function query(sql, params = []) {
  const p = await getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

/**
 * Execute an insert and return the inserted ID
 * @param {string} sql - INSERT SQL
 * @param {Array} params - Query parameters
 * @returns {Promise<number>} - Inserted ID
 */
async function insert(sql, params = []) {
  const p = await getPool();
  const [result] = await p.execute(sql, params);
  return result.insertId;
}

/**
 * Execute an update/delete and return affected rows
 * @param {string} sql - UPDATE/DELETE SQL
 * @param {Array} params - Query parameters
 * @returns {Promise<number>} - Affected rows
 */
async function update(sql, params = []) {
  const p = await getPool();
  const [result] = await p.execute(sql, params);
  return result.affectedRows;
}

/**
 * Get a single row
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>}
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute multiple queries in a transaction
 * @param {Function} callback - Async function that receives connection
 * @returns {Promise<any>}
 */
async function transaction(callback) {
  const p = await getPool();
  const conn = await p.getConnection();

  try {
    await conn.beginTransaction();
    const result = await callback(conn);
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
 * Close the connection pool
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database pool closed');
  }
}

/**
 * Health check for database connection
 * @returns {Promise<boolean>}
 */
async function healthCheck() {
  try {
    await query('SELECT 1');
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  initPool,
  getPool,
  query,
  queryOne,
  insert,
  update,
  transaction,
  closePool,
  healthCheck
};
