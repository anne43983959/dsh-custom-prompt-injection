#!/bin/sh
# dsh-custom-prompt-injection · 卸载（macOS / Linux 包装器）
# 逻辑都在 uninstall.mjs 里；本文件只负责找到 node，并把参数原样转过去。
set -e
here=$(cd "$(dirname "$0")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  echo "[X] 没有找到 node。DSH 自带 node，把它加入 PATH 后重试。"
  exit 1
fi
exec node "$here/uninstall.mjs" "$@"
