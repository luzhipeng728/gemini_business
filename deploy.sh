#!/bin/bash

# Gemini API Gateway 部署脚本
# 自动编译前端并重启服务

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  Gemini API Gateway 部署脚本"
echo "========================================"

# 1. 编译前端
echo ""
echo "[1/4] 编译前端..."
cd admin-ui
npm install --silent
npm run build
cd ..
echo "✅ 前端编译完成"

# 2. 停止旧服务
echo ""
echo "[2/4] 停止旧服务..."
pkill -f "node.*gemini-api-server" 2>/dev/null || true
pkill -f "node src/server.js" 2>/dev/null || true
lsof -ti:${PORT:-3000} | xargs kill -9 2>/dev/null || true
sleep 1
echo "✅ 旧服务已停止"

# 3. 安装后端依赖
echo ""
echo "[3/4] 检查后端依赖..."
npm install --silent
echo "✅ 依赖已就绪"

# 4. 启动服务
echo ""
echo "[4/4] 启动服务..."
if [ "$1" = "--daemon" ] || [ "$1" = "-d" ]; then
    nohup npm start > logs/server.log 2>&1 &
    sleep 2
    echo "✅ 服务已在后台启动 (PID: $!)"
    echo "   日志文件: logs/server.log"
else
    echo "✅ 启动服务中..."
    npm start
fi

echo ""
echo "========================================"
echo "  部署完成！"
echo "  访问地址: http://localhost:${PORT:-3000}"
echo "========================================"
