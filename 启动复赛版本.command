#!/bin/zsh
set -e
APP_ROOT="${0:A:h}"
cd "$APP_ROOT"
if ! command -v node >/dev/null 2>&1; then
  BUNDLED_NODE_DIR="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [[ -x "$BUNDLED_NODE_DIR/node" ]]; then
    export PATH="$BUNDLED_NODE_DIR:$PATH"
  else
    print '请先安装 Node.js 24，再运行此文件。'
    read '?按回车退出'
    exit 1
  fi
fi
if [[ ! -d node_modules || ! -f public/scenario/index.html ]]; then
  print '首次运行请在此文件夹执行 pnpm install --frozen-lockfile 和 pnpm build。'
  read '?按回车退出'
  exit 1
fi
print '工作台地址：http://127.0.0.1:8792/scenario/'
print '服务保持在此窗口运行；Ctrl+C 停止。若地址已被占用，请使用已运行的工作台。'
node server.mjs
