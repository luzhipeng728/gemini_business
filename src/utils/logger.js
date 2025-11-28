/**
 * 日志工具
 * 基于 Pino，高性能 JSON 日志
 */

const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.logger.level,
  transport: config.logger.pretty ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,
  base: {
    env: config.server.env
  }
});

module.exports = logger;
