/**
 * 配置管理
 * 从环境变量加载配置，提供默认值
 */

require('dotenv').config();

const config = {
  // 服务配置
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development'
  },

  // 数据库配置
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gemini_business',
    connectionLimit: parseInt(process.env.DB_POOL_SIZE) || 20,
    ssl: {
      rejectUnauthorized: false
    }
  },

  // 会话配置
  session: {
    ttl: parseInt(process.env.SESSION_TTL) || 3600000, // 1小时
    maxPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER) || 100,
    cleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL) || 300000 // 5分钟
  },

  // Provider 配置
  provider: {
    maxConcurrent: parseInt(process.env.PROVIDER_MAX_CONCURRENT) || 10,
    healthThreshold: parseInt(process.env.PROVIDER_HEALTH_THRESHOLD) || 50,
    cooldownDuration: parseInt(process.env.PROVIDER_COOLDOWN_DURATION) || 300000, // 5分钟
    failureThreshold: parseInt(process.env.PROVIDER_FAILURE_THRESHOLD) || 5
  },

  // 限流配置
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000 // 1分钟
  },

  // 加密配置
  crypto: {
    secretKey: process.env.CRYPTO_SECRET_KEY || 'gemini-gateway-secret-key-2024'
  },

  // 日志配置
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV !== 'production'
  },

  // 管理员配置
  admin: {
    defaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'admin123'
  }
};

// 验证必要配置
function validateConfig() {
  const required = [
    ['database.host', config.database.host],
    ['database.user', config.database.user],
    ['database.password', config.database.password]
  ];

  for (const [name, value] of required) {
    if (!value) {
      throw new Error(`Missing required config: ${name}`);
    }
  }
}

validateConfig();

module.exports = config;
