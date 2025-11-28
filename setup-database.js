/**
 * Database Setup Script
 * Creates gemini_business database and all required tables
 */

const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_HOST?.includes('azure') ? { rejectUnauthorized: false } : undefined
};

const DATABASE_NAME = 'gemini_business';

async function setupDatabase() {
  let connection;

  try {
    // Connect without database first
    console.log('Connecting to MySQL server...');
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✓ Connected to MySQL server');

    // Create database
    console.log(`Creating database ${DATABASE_NAME}...`);
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${DATABASE_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✓ Database ${DATABASE_NAME} created/exists`);

    // Switch to the database
    await connection.changeUser({ database: DATABASE_NAME });
    console.log(`✓ Switched to database ${DATABASE_NAME}`);

    // Create tables one by one
    console.log('\nCreating tables...\n');

    // 1. Users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ Table users created');

    // 2. API Keys table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        api_key VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(100) DEFAULT 'Default Key',
        is_active BOOLEAN DEFAULT TRUE,
        rate_limit INT DEFAULT 60,
        daily_limit INT DEFAULT 1000,
        daily_usage INT DEFAULT 0,
        last_used_at TIMESTAMP NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_api_key (api_key),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ Table api_keys created');

    // 3. Providers table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS providers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        cookies LONGTEXT NOT NULL,
        csesidx VARCHAR(500) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        priority INT DEFAULT 0,
        max_concurrent INT DEFAULT 10,
        current_load INT DEFAULT 0,
        total_requests BIGINT DEFAULT 0,
        failed_requests BIGINT DEFAULT 0,
        last_error TEXT,
        last_error_at TIMESTAMP NULL,
        last_success_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_is_active (is_active),
        INDEX idx_priority (priority)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ Table providers created');

    // 4. User-Provider bindings
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_provider_bindings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        provider_id INT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_provider (user_id, provider_id),
        INDEX idx_user_id (user_id),
        INDEX idx_provider_id (provider_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ Table user_provider_bindings created');

    // 5. Sessions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        provider_id INT NOT NULL,
        user_id INT,
        context_hash VARCHAR(64) NOT NULL,
        gemini_session_id VARCHAR(500),
        conversation_history JSON,
        message_count INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_context_hash (context_hash),
        INDEX idx_provider_user (provider_id, user_id),
        INDEX idx_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ Table sessions created');

    // 6. Request logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        api_key_id INT,
        provider_id INT,
        session_id INT,
        model VARCHAR(100),
        request_type VARCHAR(50) DEFAULT 'other',
        input_tokens INT DEFAULT 0,
        output_tokens INT DEFAULT 0,
        latency_ms INT DEFAULT 0,
        status_code INT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at),
        INDEX idx_provider_id (provider_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ Table request_logs created');

    // 7. System settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_setting_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ Table system_settings created');

    // Insert initial data
    console.log('\nInserting initial data...\n');

    // Default admin user (password: admin123)
    try {
      await connection.execute(`
        INSERT INTO users (username, email, password_hash, is_admin)
        VALUES ('admin', 'admin@example.com', '$2b$10$rQZ8K.tVJxrLK6xR5YvZxeJJKqWvZ5cZW5.X5YvZxeJJKqWvZ5cZW', TRUE)
      `);
      console.log('  ✓ Admin user created');
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        console.log('  - Admin user already exists');
      } else {
        throw err;
      }
    }

    // System settings
    const settings = [
      ['session_ttl', '3600000', 'Session TTL in milliseconds (default: 1 hour)'],
      ['max_sessions_per_user', '100', 'Maximum sessions per user'],
      ['default_rate_limit', '60', 'Default rate limit per minute'],
      ['default_daily_limit', '1000', 'Default daily request limit'],
      ['cleanup_interval', '300000', 'Session cleanup interval in ms (default: 5 min)']
    ];

    for (const [key, value, desc] of settings) {
      try {
        await connection.execute(
          'INSERT INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
          [key, value, desc]
        );
      } catch (err) {
        // Ignore duplicates
      }
    }
    console.log('  ✓ System settings initialized');

    console.log('\n========================================');
    console.log('✓ Database setup completed successfully!');
    console.log('========================================\n');

    // Show table summary
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('Created tables:');
    tables.forEach(t => {
      const tableName = Object.values(t)[0];
      console.log(`  - ${tableName}`);
    });

  } catch (error) {
    console.error('Database setup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\nConnection closed.');
    }
  }
}

// Run setup
setupDatabase();
