/**
 * 重置数据库脚本
 * 删除所有表并重新创建
 */

const mysql = require('mysql2/promise');
const config = require('../src/config');
const { hashPassword } = require('../src/utils/crypto');
const { generateApiKey } = require('../src/utils/hash');

const DB_CONFIG = {
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl
};

const DATABASE_NAME = config.database.database;

async function resetDatabase() {
  let connection;

  try {
    console.log('Connecting to MySQL server...');
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✓ Connected');

    // 使用数据库
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${DATABASE_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.changeUser({ database: DATABASE_NAME });

    // 禁用外键检查
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

    // 删除所有表
    console.log('\nDropping existing tables...');
    const tables = ['request_logs', 'sessions', 'api_keys', 'users', 'providers', 'provider_groups', 'system_settings'];
    for (const table of tables) {
      await connection.execute(`DROP TABLE IF EXISTS ${table}`);
      console.log(`  ✓ Dropped ${table}`);
    }

    // 恢复外键检查
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\nCreating tables...\n');

    // Provider Groups
    await connection.execute(`
      CREATE TABLE provider_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        region VARCHAR(50),
        priority INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_active_priority (is_active, priority DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ provider_groups');

    // Providers
    await connection.execute(`
      CREATE TABLE providers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT,
        name VARCHAR(100) NOT NULL,
        cookies LONGTEXT NOT NULL,
        csesidx VARCHAR(500) NOT NULL,
        status ENUM('active', 'inactive', 'cooling', 'failed') DEFAULT 'active',
        health_score INT DEFAULT 100,
        current_load INT DEFAULT 0,
        max_concurrent INT DEFAULT 10,
        total_requests BIGINT DEFAULT 0,
        failed_requests BIGINT DEFAULT 0,
        consecutive_failures INT DEFAULT 0,
        last_failure_at TIMESTAMP NULL,
        last_success_at TIMESTAMP NULL,
        cooldown_until TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES provider_groups(id) ON DELETE SET NULL,
        INDEX idx_status_health (status, health_score DESC),
        INDEX idx_group_status (group_id, status),
        INDEX idx_load (status, current_load, max_concurrent)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ providers');

    // Users
    await connection.execute(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ users');

    // API Keys
    await connection.execute(`
      CREATE TABLE api_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        api_key VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(100) DEFAULT 'Default Key',
        is_active BOOLEAN DEFAULT TRUE,
        rate_limit INT DEFAULT 60,
        daily_limit INT DEFAULT 10000,
        daily_usage INT DEFAULT 0,
        last_used_at TIMESTAMP NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_api_key (api_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ api_keys');

    // Sessions
    await connection.execute(`
      CREATE TABLE sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        provider_id INT NOT NULL,
        user_id INT,
        context_hash_head VARCHAR(64) NOT NULL,
        context_hash_tail VARCHAR(64) NOT NULL,
        gemini_session_id VARCHAR(500),
        message_count INT DEFAULT 0,
        status ENUM('active', 'expired', 'migrated') DEFAULT 'active',
        expires_at TIMESTAMP NULL,
        last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_match (user_id, context_hash_head, context_hash_tail, status),
        INDEX idx_provider (provider_id, status),
        INDEX idx_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ sessions');

    // Request Logs
    await connection.execute(`
      CREATE TABLE request_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        api_key_id INT,
        provider_id INT,
        session_id INT,
        model VARCHAR(100),
        request_type VARCHAR(50),
        input_tokens INT DEFAULT 0,
        output_tokens INT DEFAULT 0,
        latency_ms INT DEFAULT 0,
        status_code INT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_time (user_id, created_at),
        INDEX idx_provider_time (provider_id, created_at),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ request_logs');

    // System Settings
    await connection.execute(`
      CREATE TABLE system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ system_settings');

    // 创建默认管理员
    console.log('\nCreating default admin user...');
    const adminPassword = hashPassword(config.admin.defaultPassword);
    const adminApiKey = generateApiKey();

    await connection.execute(
      'INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, ?)',
      ['admin', 'admin@example.com', adminPassword, true]
    );

    const [result] = await connection.execute('SELECT LAST_INSERT_ID() as id');
    const adminId = result[0].id;

    await connection.execute(
      'INSERT INTO api_keys (user_id, api_key, name) VALUES (?, ?, ?)',
      [adminId, adminApiKey, 'Admin Key']
    );

    console.log('  ✓ Admin user created');
    console.log('    Username: admin');
    console.log('    Password: ' + config.admin.defaultPassword);
    console.log('    API Key:  ' + adminApiKey);

    // 创建默认分组
    console.log('\nCreating default provider group...');
    await connection.execute(
      'INSERT INTO provider_groups (name, description, priority) VALUES (?, ?, ?)',
      ['Default', 'Default provider group', 0]
    );
    console.log('  ✓ Default group created');

    console.log('\n========================================');
    console.log('✓ Database reset completed!');
    console.log('========================================\n');

    // 显示表列表
    const [tableList] = await connection.execute('SHOW TABLES');
    console.log('Tables:');
    tableList.forEach(t => {
      const tableName = t['Tables_in_' + DATABASE_NAME] || t[Object.keys(t)[0]];
      console.log('  - ' + tableName);
    });

  } catch (error) {
    console.error('\n✗ Reset failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

resetDatabase();
