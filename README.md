# Gemini Business API Gateway

将 Google Business Gemini API 转换为 Gemini 官方 API 格式的网关服务，支持多 Provider 负载均衡、会话管理和流式输出。

## 功能特性

- **Gemini 官方 API 兼容** - 支持 `generateContent` 和 `streamGenerateContent` 接口
- **多 Provider 支持** - 支持添加多个 Gemini Business 账号，自动负载均衡
- **会话管理** - 智能会话匹配和复用（基于 MD5 哈希）
- **真正的流式输出** - 实时 SSE 响应
- **思考链支持** - 可选输出模型思考过程
- **管理后台** - Vue 3 构建的现代化管理界面
- **用户管理** - 支持多用户和 API Key 管理
- **请求日志** - 完整的请求日志记录

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库连接等信息
```

### 3. 初始化数据库

```bash
npm run setup-db
```

### 4. 启动服务

```bash
npm start
```

服务默认运行在 `http://localhost:3000`

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_HOST` | 数据库主机 | localhost |
| `DB_PORT` | 数据库端口 | 3306 |
| `DB_USER` | 数据库用户 | root |
| `DB_PASSWORD` | 数据库密码 | - |
| `DB_NAME` | 数据库名称 | gemini_business |
| `PORT` | 服务端口 | 3000 |
| `NODE_ENV` | 运行环境 | development |
| `CRYPTO_SECRET_KEY` | 加密密钥（至少32字符） | - |

### 添加 Provider

1. 访问管理后台 `http://localhost:3000/`
2. 进入「服务商管理」页面
3. 点击「添加服务商」
4. 填写以下信息：
   - **名称**: 自定义名称
   - **csesidx**: 从 Gemini Business Cookie 获取
   - **Cookies**: JSON 格式

#### 获取 Cookies

1. 登录 [Gemini Business](https://business.gemini.google)
2. 打开浏览器开发者工具 (F12)
3. 切换到 Application → Cookies
4. 复制以下 Cookie 值并以 JSON 格式填写：

```json
{
  "NID": "xxx...",
  "__Secure-C_SES": "CSE.xxx...",
  "__Host-C_OSES": "COS.xxx..."
}
```

## API 使用

### 认证方式

使用 `x-goog-api-key` Header 传递 API Key：

```bash
curl -H "x-goog-api-key: YOUR_API_KEY" http://localhost:3000/v1beta/models
```

### 生成内容

```bash
curl -X POST http://localhost:3000/v1beta/models/gemini-2.0-flash:generateContent \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -d '{
    "contents": [{
      "parts": [{"text": "Hello, who are you?"}]
    }]
  }'
```

### 流式生成

```bash
curl -X POST "http://localhost:3000/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -d '{
    "contents": [{
      "parts": [{"text": "Write a short poem"}]
    }]
  }'
```

### 多轮对话

```bash
curl -X POST http://localhost:3000/v1beta/models/gemini-2.0-flash:generateContent \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -d '{
    "contents": [
      {"role": "user", "parts": [{"text": "我叫小明"}]},
      {"role": "model", "parts": [{"text": "你好小明！"}]},
      {"role": "user", "parts": [{"text": "我叫什么名字？"}]}
    ]
  }'
```

## 支持的模型

| 模型名称 | 说明 |
|---------|------|
| `gemini-2.0-flash-exp` | 快速模型 |
| `gemini-3-pro-preview` | 高级模型，支持思考链 |
| `gemini-2.5-flash` | 别名 → gemini-2.0-flash-exp |
| `gemini-2.5-pro` | 别名 → gemini-3-pro-preview |

## 项目结构

```
├── src/
│   ├── core/           # 核心业务逻辑
│   │   ├── gemini-client.js    # Gemini API 客户端
│   │   ├── request-executor.js # 请求执行器
│   │   ├── session-matcher.js  # 会话匹配
│   │   └── provider-scheduler.js # Provider 调度
│   ├── models/         # 数据模型
│   ├── routes/         # API 路由
│   ├── plugins/        # Fastify 插件
│   └── utils/          # 工具函数
├── admin-ui/           # Vue 3 管理后台
├── tests/              # 测试文件
└── scripts/            # 脚本文件
```

## 技术栈

- **后端**: Node.js + Fastify
- **数据库**: MySQL
- **前端**: Vue 3 + Vite + TailwindCSS
- **认证**: Basic Auth + API Key

## License

MIT
