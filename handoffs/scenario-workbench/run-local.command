#!/bin/zsh
set -e
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 22 或更新版本。'
  exit 1
fi
exec node server/index.mjs
