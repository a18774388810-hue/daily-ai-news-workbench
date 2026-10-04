#!/bin/bash
# 每日 AI 要闻工作台 · 一键启动（macOS / Linux）
# 双击运行，或在终端执行 ./start-workbench.command
# 可用 PORT=9999 ./start-workbench.command 改端口

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

pause_exit() {
  echo
  echo "按回车键关闭窗口..."
  read -r _
  exit "${1:-1}"
}

echo "================================"
echo " 每日 AI 要闻工作台 · 一键启动"
echo "================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js。"
  echo
  echo "请先安装 Node.js 20 或更高版本："
  echo "  https://nodejs.org/"
  echo
  echo "安装完成后重新双击本文件即可。"
  pause_exit
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[错误] 当前 Node.js 版本为 $(node -v 2>/dev/null)，需要 20 或更高。"
  echo "请到 https://nodejs.org/ 安装新版后重试。"
  pause_exit
fi
echo "[1/3] Node.js $(node -v) 检查通过"

if [ ! -d node_modules ]; then
  echo "[2/3] 首次运行，正在安装依赖（可能需要 1-2 分钟）..."
  if ! npm install; then
    echo
    echo "[错误] 依赖安装失败。请检查网络后重试。"
    pause_exit
  fi
else
  echo "[2/3] 依赖已存在，跳过安装"
fi

echo "[3/3] 正在构建前端..."
if ! npm run build; then
  echo
  echo "[错误] 构建失败。"
  pause_exit
fi

PORT="${PORT:-8787}"
URL="http://localhost:${PORT}"

echo
echo "================================"
echo " 启动成功，即将自动打开浏览器"
echo " 地址：${URL}"
echo
echo " 停止服务：关闭这个窗口，或按 Ctrl + C"
echo "================================"
echo

(
  sleep 3
  if command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL"
  fi
) &

PORT="$PORT" npm start
