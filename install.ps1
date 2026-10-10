# dsh-custom-prompt-injection · 安装（Windows 包装器）
# 逻辑都在 install.mjs 里；本文件只负责找到 node，并把参数原样转过去。
# 用法： .\install.ps1  [--dry-run] [--list] [--home <路径>] [--profile <名>] [--all]
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host '[X] 没有找到 node。DSH 自带 node，把它加入 PATH 后重试；或直接指定 node 的完整路径运行：' -ForegroundColor Red
  Write-Host ('    <node 完整路径> "' + $here + '\install.mjs"')
  exit 1
}
& $node.Source (Join-Path $here 'install.mjs') @args
exit $LASTEXITCODE
