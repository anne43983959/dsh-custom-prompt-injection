#!/bin/sh
# dsh-custom-prompt-injection · 安装（macOS / Linux 包装器）
# 逻辑都在 install.mjs 里；本文件只负责找到 node，并把参数原样转过去。
# 用法： ./install.sh  [--dry-run] [--list] [--home <路径>] [--profile <名>] [--all]
set -e
here=$(cd "$(dirname "$0")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  echo "[X] 没有找到 node。DSH 自带 node，把它加入 PATH 后重试；或直接指定完整路径："
  echo "    <node 完整路径> \"$here/install.mjs\""
  exit 1
fi
exec node "$here/install.mjs" "$@"
