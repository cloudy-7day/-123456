#!/bin/zsh
set -e
cd "${0:A:h}"
if command -v node >/dev/null 2>&1; then
  SHADOW_NODE="$(command -v node)"
else
  SHADOW_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$SHADOW_NODE" ]]; then
  print '请安装 Node.js 24，或将 node 加入 PATH。'
  exit 1
fi
if [[ -z "$SHADOW_ENV_FILE" && -f ../huawei-agent/.env.local ]]; then
  export SHADOW_ENV_FILE="${PWD:h}/huawei-agent/.env.local"
fi
print '打开 http://127.0.0.1:8790/scenario/ 使用影子版本。按 Ctrl+C 停止。'
exec "$SHADOW_NODE" server.mjs
