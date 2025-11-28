# Gemini Business API 网关 - 架构设计文档

## 1. 项目概述

### 1.1 目标
构建一个高并发、可扩展的 Gemini Business API 网关，支持：
- 100-1000 QPS 并发处理
- 1000+ Provider（Google Business 账号）管理
- 多租户 API Key 访问控制
- 完整的管理后台

### 1.2 技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| API 框架 | Fastify | 高性能，原生 JSON Schema 验证 |
| 数据库 | MySQL (Azure) | 现有基础设施，稳定可靠 |
| 前端框架 | Vue 3 + Vite | 轻量快速，组件化开发 |
| UI 组件 | Element Plus | 成熟的企业级组件库 |
| 容器化 | Docker Compose | 简化部署，支持多实例 |
| 日志 | Pino | Fastify 默认，高性能 JSON 日志 |

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Nginx / Traefik                            │
│                    (负载均衡 + SSL + 限流)                            │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  API Node 1  │      │  API Node 2  │      │  API Node N  │
│   (Fastify)  │      │   (Fastify)  │      │   (Fastify)  │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │
       └─────────────────────┼─────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌───────────┐  ┌───────────┐  ┌──────────────┐
       │  MySQL    │  │  Google   │  │   Admin UI   │
       │  (Azure)  │  │ Business  │  │   (Vue 3)    │
       └───────────┘  │   API     │  └──────────────┘
                      └───────────┘
```

### 2.2 请求处理流程

```
用户请求 → API Key 验证 → 限流检查 → 会话匹配 → Provider 调度 → 执行请求 → 返回响应
                │              │            │              │
                ▼              ▼            ▼              ▼
           验证失败        超限拒绝     新建/复用会话   负载均衡选择
```

## 3. 目录结构

```
gemini-api-server/
├── src/
│   ├── app.js                      # Fastify 应用入口
│   ├── server.js                   # 服务启动入口
│   │
│   ├── config/
│   │   ├── index.js                # 配置汇总
│   │   ├── database.js             # 数据库配置
│   │   └── constants.js            # 常量定义
│   │
│   ├── core/                       # 核心业务逻辑
│   │   ├── gemini-client.js        # Gemini Business API 客户端
│   │   ├── session-matcher.js      # 会话匹配器（首尾锚定）
│   │   ├── provider-scheduler.js   # Provider 智能调度
│   │   ├── health-checker.js       # 健康检查管理
│   │   └── request-executor.js     # 请求执行器
│   │
│   ├── models/                     # 数据模型
│   │   ├── base.js                 # 基础模型类
│   │   ├── provider.js             # Provider 模型
│   │   ├── provider-group.js       # Provider 分组
│   │   ├── session.js              # 会话模型
│   │   ├── user.js                 # 用户模型
│   │   ├── api-key.js              # API Key 模型
│   │   └── request-log.js          # 请求日志
│   │
│   ├── routes/                     # API 路由
│   │   ├── index.js                # 路由注册
│   │   ├── gemini.js               # Gemini API（/v1beta/...）
│   │   ├── admin/                  # 管理 API
│   │   │   ├── providers.js        # Provider 管理
│   │   │   ├── users.js            # 用户管理
│   │   │   ├── sessions.js         # 会话管理
│   │   │   ├── stats.js            # 统计数据
│   │   │   └── settings.js         # 系统设置
│   │   └── health.js               # 健康检查
│   │
│   ├── plugins/                    # Fastify 插件
│   │   ├── database.js             # 数据库连接池
│   │   ├── auth.js                 # 认证插件
│   │   └── rate-limit.js           # 限流插件
│   │
│   └── utils/
│       ├── hash.js                 # 哈希工具
│       ├── crypto.js               # 加密工具
│       ├── logger.js               # 日志配置
│       └── errors.js               # 自定义错误
│
├── admin-ui/                       # Vue 3 管理后台
│   ├── src/
│   │   ├── main.js
│   │   ├── App.vue
│   │   ├── router/
│   │   ├── stores/                 # Pinia 状态管理
│   │   ├── views/
│   │   │   ├── Dashboard.vue       # 仪表盘
│   │   │   ├── Providers.vue       # Provider 管理
│   │   │   ├── Users.vue           # 用户管理
│   │   │   ├── Sessions.vue        # 会话管理
│   │   │   ├── Logs.vue            # 日志查看
│   │   │   └── Settings.vue        # 系统设置
│   │   ├── components/
│   │   └── api/                    # API 封装
│   ├── vite.config.js
│   └── package.json
│
├── docker/
│   ├── Dockerfile                  # API 服务
│   ├── Dockerfile.admin            # 前端
│   ├── docker-compose.yml          # 开发环境
│   ├── docker-compose.prod.yml     # 生产环境
│   └── nginx.conf                  # Nginx 配置
│
├── scripts/
│   ├── setup-database.js           # 初始化数据库
│   ├── migrate.js                  # 数据库迁移
│   └── import-providers.js         # 批量导入
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── load/                       # 压力测试
│
├── .env.example
├── package.json
└── README.md
```

## 4. 数据库设计

### 4.1 ER 图

```
┌─────────────────┐     ┌─────────────────┐
│ provider_groups │     │     users       │
├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │
│ name            │     │ username        │
│ region          │     │ password_hash   │
│ priority        │     │ is_admin        │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │ 1:N                   │ 1:N
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│   providers     │     │    api_keys     │
├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │
│ group_id (FK)   │     │ user_id (FK)    │
│ name            │     │ api_key         │
│ cookies (加密)   │     │ rate_limit      │
│ status          │     │ daily_limit     │
│ health_score    │     └────────┬────────┘
└────────┬────────┘              │
         │                       │
         │ 1:N                   │
         ▼                       │
┌─────────────────┐              │
│    sessions     │◄─────────────┘
├─────────────────┤      使用 api_key 关联 user
│ id              │
│ provider_id(FK) │
│ user_id (FK)    │
│ context_hash_head│
│ context_hash_tail│
│ gemini_session_id│
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐
│  request_logs   │
├─────────────────┤
│ id              │
│ session_id (FK) │
│ provider_id(FK) │
│ latency_ms      │
│ status_code     │
└─────────────────┘
```

### 4.2 完整建表 SQL

```sql
-- Provider 分组
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Provider
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 用户
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- API Key
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 会话
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 请求日志
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 系统设置
CREATE TABLE system_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 5. 核心算法

### 5.1 会话匹配算法（首尾锚定）

```javascript
class SessionMatcher {
  /**
   * 生成会话匹配哈希
   * @param {Array} messages - 消息数组
   * @returns {Object} { headHash, tailHash }
   */
  generateHashes(messages) {
    const userMessages = messages.filter(m => m.role === 'user');

    // 取前 5 条用户消息
    const headMessages = userMessages.slice(0, 5);
    const headText = headMessages.map(m => this.extractText(m.parts)).join('|');
    const headHash = crypto.createHash('md5').update(headText).digest('hex');

    // 取最后 5 条用户消息
    const tailMessages = userMessages.slice(-5);
    const tailText = tailMessages.map(m => this.extractText(m.parts)).join('|');
    const tailHash = crypto.createHash('md5').update(tailText).digest('hex');

    return { headHash, tailHash };
  }

  /**
   * 查找匹配会话
   * 优先完全匹配，其次 head 匹配（允许 tail 变化）
   */
  async findSession(userId, headHash, tailHash) {
    // 1. 完全匹配
    let session = await Session.findOne({
      user_id: userId,
      context_hash_head: headHash,
      context_hash_tail: tailHash,
      status: 'active'
    });

    if (session) return { session, matchType: 'exact' };

    // 2. Head 匹配（同一对话，消息增加了）
    session = await Session.findOne({
      user_id: userId,
      context_hash_head: headHash,
      status: 'active'
    });

    if (session) {
      // 更新 tail hash
      await session.update({ context_hash_tail: tailHash });
      return { session, matchType: 'head' };
    }

    return { session: null, matchType: 'none' };
  }
}
```

### 5.2 Provider 调度算法

```javascript
class ProviderScheduler {
  /**
   * 选择最优 Provider
   * 策略：健康分 > 负载率 > 随机
   */
  async selectProvider(groupId = null) {
    const query = {
      status: 'active',
      health_score: { $gte: 50 },  // 健康分 >= 50
      $expr: { $lt: ['$current_load', '$max_concurrent'] }  // 有余量
    };

    if (groupId) query.group_id = groupId;

    const providers = await Provider.find(query)
      .orderBy('health_score', 'DESC')
      .orderBy('current_load / max_concurrent', 'ASC')
      .limit(10);

    if (providers.length === 0) {
      throw new Error('No available provider');
    }

    // 加权随机选择（避免热点）
    return this.weightedRandom(providers);
  }

  /**
   * 记录请求结果，更新健康分
   */
  async recordResult(providerId, success, latencyMs) {
    const provider = await Provider.findById(providerId);

    if (success) {
      await provider.update({
        consecutive_failures: 0,
        last_success_at: new Date(),
        health_score: Math.min(100, provider.health_score + 1),
        total_requests: provider.total_requests + 1
      });
    } else {
      const failures = provider.consecutive_failures + 1;
      let newStatus = provider.status;
      let cooldownUntil = null;

      // 连续失败处理
      if (failures >= 5) {
        newStatus = 'cooling';
        cooldownUntil = new Date(Date.now() + 5 * 60 * 1000); // 冷却 5 分钟
      }
      if (failures >= 10) {
        newStatus = 'failed';
      }

      await provider.update({
        consecutive_failures: failures,
        last_failure_at: new Date(),
        health_score: Math.max(0, provider.health_score - 10),
        failed_requests: provider.failed_requests + 1,
        total_requests: provider.total_requests + 1,
        status: newStatus,
        cooldown_until: cooldownUntil
      });
    }
  }
}
```

### 5.3 健康恢复机制

```javascript
class HealthChecker {
  constructor() {
    // 每分钟检查一次冷却中的 Provider
    this.interval = setInterval(() => this.checkCoolingProviders(), 60000);
  }

  async checkCoolingProviders() {
    const now = new Date();

    // 找出冷却期结束的 Provider
    const providers = await Provider.find({
      status: 'cooling',
      cooldown_until: { $lte: now }
    });

    for (const provider of providers) {
      // 恢复为 active，重置连续失败
      await provider.update({
        status: 'active',
        consecutive_failures: 0,
        health_score: 50  // 恢复时健康分设为 50
      });

      logger.info(`Provider ${provider.id} recovered from cooling`);
    }
  }
}
```

## 6. API 设计

### 6.1 Gemini 兼容 API

```
POST /v1beta/models/{model}:generateContent
POST /v1beta/models/{model}:streamGenerateContent
GET  /v1beta/models

Headers:
  x-goog-api-key: <api_key>
  或
  Authorization: Bearer <api_key>
```

### 6.2 管理 API

```
# Provider 管理
GET    /admin/providers              # 列表（分页、筛选）
POST   /admin/providers              # 创建
POST   /admin/providers/batch        # 批量导入
GET    /admin/providers/:id          # 详情
PUT    /admin/providers/:id          # 更新
DELETE /admin/providers/:id          # 删除
POST   /admin/providers/:id/activate # 激活
POST   /admin/providers/:id/deactivate # 停用

# Provider 分组
GET    /admin/provider-groups
POST   /admin/provider-groups
PUT    /admin/provider-groups/:id
DELETE /admin/provider-groups/:id

# 用户管理
GET    /admin/users
POST   /admin/users
PUT    /admin/users/:id
DELETE /admin/users/:id
GET    /admin/users/:id/api-keys
POST   /admin/users/:id/api-keys

# 统计
GET    /admin/stats/overview         # 总览
GET    /admin/stats/providers        # Provider 统计
GET    /admin/stats/requests         # 请求统计
GET    /admin/stats/errors           # 错误统计

# 日志
GET    /admin/logs                   # 请求日志

# 系统
GET    /admin/settings
PUT    /admin/settings
```

## 7. 管理后台功能

### 7.1 Dashboard
- 实时 QPS 曲线
- Provider 健康状态分布
- 今日请求量 / 错误率
- 活跃会话数

### 7.2 Provider 管理
- 列表：状态筛选、分组筛选、搜索
- 批量导入：CSV/JSON 上传
- 单个编辑：cookies、并发数、分组
- 健康监控：健康分、成功率、最后错误

### 7.3 用户管理
- 用户 CRUD
- API Key 管理：创建、删除、限额设置
- 用量统计

### 7.4 会话管理
- 活跃会话列表
- 手动清理过期会话

### 7.5 日志查看
- 请求日志搜索
- 错误日志筛选
- 导出功能

## 8. 部署架构

### 8.1 本地开发
```bash
# 直接运行
npm run dev

# 或使用 Docker
docker-compose up
```

### 8.2 生产部署
```yaml
# docker-compose.prod.yml
services:
  api:
    image: gemini-gateway:latest
    deploy:
      replicas: 3
    environment:
      - NODE_ENV=production
      - DB_HOST=xxx

  admin:
    image: gemini-gateway-admin:latest

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
```

## 9. 性能目标

| 指标 | 目标值 |
|------|--------|
| 单节点 QPS | 300-500 |
| P99 延迟 | < 200ms（不含 Gemini API） |
| 会话匹配 | < 10ms |
| Provider 选择 | < 5ms |
| 可用性 | 99.9% |

## 10. 实施计划

### Phase 1: 核心功能（本次实现）
- [x] 数据库设计
- [ ] 项目结构搭建
- [ ] 核心模块实现
- [ ] Gemini API 路由
- [ ] 基础管理 API
- [ ] 简单管理界面
- [ ] Docker 配置
- [ ] 本地测试通过

### Phase 2: 完善功能
- [ ] 完整管理后台 UI
- [ ] 批量导入工具
- [ ] 监控告警
- [ ] 压力测试

### Phase 3: 优化扩展
- [ ] Redis 缓存层
- [ ] 分布式限流
- [ ] 更多调度策略
