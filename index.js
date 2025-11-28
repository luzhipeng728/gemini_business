/**
 * Gemini Business API Server 入口
 * 提供 Gemini 官方 API 格式的逆向代理
 *
 * 使用方法:
 *   node index.js
 *
 * 环境变量:
 *   PORT          - 服务器端口 (默认 3000)
 *   API_KEYS      - API 密钥列表，逗号分隔 (可选，不设置则开放访问)
 *   CSESIDX       - Gemini Business csesidx
 *   CONFIG_ID     - Gemini Business configId
 *   NID_COOKIE    - NID Cookie
 *   SES_COOKIE    - __Secure-C_SES Cookie
 *   OSES_COOKIE   - __Host-C_OSES Cookie
 *   SESSION_TTL   - 会话过期时间 (毫秒，默认 30 分钟)
 *   MAX_SESSIONS  - 最大会话数 (默认 100)
 */

const GeminiAPIServer = require('./server');

// 配置
const config = {
  port: parseInt(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',

  // API Keys (可选)
  apiKeys: process.env.API_KEYS
    ? process.env.API_KEYS.split(',').map(k => k.trim())
    : [],

  // Gemini Business 配置
  csesidx: process.env.CSESIDX || '1585284838',
  configId: process.env.CONFIG_ID || '6c177c69-1013-4e61-932d-19f6b2b46f61',

  // Cookies (从浏览器获取)
  cookies: {
    NID: process.env.NID_COOKIE || '526=lW-N_PZXUSCuQyVXBIHomWSP5Ds9nLSsV8OCojybTiySJkAto1toT8vV3f1t0APfSbFmqlwA08bprwlnXweBXvVUA_GnNC19P-4pgxjAbtgDG4IBPM0QHEEBYA29HkPuqrfOSt4Cg47Dzlm83DUYj2g2Q5v1wuXbMaCvM33MU-vdEQEl_ZSRierM7dov642nlweErCpI',
    '__Secure-C_SES': process.env.SES_COOKIE || 'CSE.ARsLs034fkMCkvW9ZNepYaIO49gcd34QFfbQ5e3oJgDF7WB_6ihvE1Z27Iio6GxKyzWqMA3EKpMYw1COE9vXUI0JAvuy-j-YApSHsmy4Lpg0PKveoqg6DXkoWccalD7pYlIIfDw6w3Kxz6FJ3UE9GxB3z2dI8D0eH7L7YGuFin-TvKUgEPQCgZ7muqzbd5XJymv9Ln4RRcc8Dw4BuztLlGwU629dQ2xCi0_MbrQn_YQZXkZeb-9-Tf9AEHzKfW1ta7JCRoUuxi126_mdxzrPI23hnSvRcwb0VqLT-7B3cp5CrgLERI--VMdOsz8kcZZvVZxFqlJWAwcgEirA1rXcEMy4vYHVkIw_jB55Dp0O0yLi0wUybP4of_37UnUXYUKFaaogbl-xVUEJ3cPfNIYuNQTqKWiAZBJYuZ5tdocQ_4JECu-5HOHBP6bMin-ys3mxbso1K4OvqwleVBbm',
    '__Host-C_OSES': process.env.OSES_COOKIE || 'COS.AQH81rg6q8PTjo7wJpXU5Rkobmy35EKHj1bsR3uByaujS90FW9qZXlbEU20VK13j2Upjzdb8DZcjjGi42fR49V6DGKq2kvUTmlmfSSZaYaj0dOV5Y-U318zplfEfRwywTpmpLAB00eJjihAm'
  },

  // 会话配置
  sessionTTL: parseInt(process.env.SESSION_TTL) || 30 * 60 * 1000,
  maxSessions: parseInt(process.env.MAX_SESSIONS) || 100
};

// 创建并启动服务器
const server = new GeminiAPIServer(config);

server.start().then(() => {
  if (config.apiKeys.length > 0) {
    console.log(`  🔐 API 密钥保护已启用 (${config.apiKeys.length} 个密钥)`);
    console.log('     支持: x-goog-api-key header, ?key=xxx URL参数, Bearer token');
  } else {
    console.log('  ⚠️  未配置 API 密钥，API 开放访问');
    console.log('     设置 API_KEYS 环境变量可启用密钥验证');
  }
  console.log('');
  console.log('  📖 与官方 SDK 兼容:');
  console.log('     const genAI = new GoogleGenerativeAI("your-key");');
  console.log(`     // 将 baseUrl 指向 http://localhost:${config.port}`);
  console.log('');
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n正在关闭服务器...');
  await server.stop();
  process.exit(0);
});
