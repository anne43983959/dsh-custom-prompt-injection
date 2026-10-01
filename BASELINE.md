# 基线（2026-09-30 22:20:06）

> 本文件记录「动态挂载 + 候选切换（测试功能）」开发前的可回滚基线。
> ⚠️ **该轮开发已于 2026-10-01 全部回退**（分域 / 右键菜单 / 候选切换均已移除，默认注入改为 V3），
> 本文件仅作**历史与回滚参照**保留；当前现场状态见 `README.md` 与 `HARNESS_PLUGIN.md` 的变更节。

## 快照

| 项 | 值 |
|---|---|
| 快照目录 | `%APPDATA%\in.dsh-plug.dsh-launcher\.sandbox\cpi-baseline-20260930-222006\plugin-snapshot` |
| 文件数 / 体积 | 31 个文件 / 310,269 B（不含 node_modules 与 .git） |
| 校验清单 | 同目录 `MANIFEST.sha256`（31 行 sha256 + 字节 + 相对路径） |
| 运行态 | 同目录 `runtime\{state.json, ledger.jsonl}`（切换前的开关状态与判定台账） |
| 回滚脚本 | 同目录 `rollback.ps1`（`-WhatIf` 可预演；回滚前会先把当前状态另存到 `pre-rollback-<时间戳>`） |

## 本次开发改了哪些文件

| 文件 | 改前 | 改后 | 说明 |
|---|---|---|---|
| `index.js` | 37,897 B | 42,941 B | 候选注册表 + `text` 函数化 + `/prompt` 路由 + 台账加 `promptRev`/`promptRevSha` |
| `client.js` | 10,267 B | 16,664 B | 右键菜单切换候选 + `data-prompt-rev` 标注 + 测试功能提示 |
| `scripts/smoke-injection-host.mjs` | 13,137 B | 同名 | 断言改为调用 `text()`（载荷文本现在是函数） |
| `scripts/smoke-prompt-rev.mjs` | — | 6,609 B | **新增**：22 条候选切换冒烟 |
| `prompts/candidates/{A-current,B-v2-cn,C-v3-balanced}/` | — | 6 个文件 | **新增**：候选注入文本 |

> 未改动：`prompts/kernel.md`、`prompts/reinforcement.md`、`kernel-mirror.md`、`package.json`、`cordis.patch.yml`、`HARNESS_PLUGIN.md` 等。


## 后续追加（同日，仍在同一基线之上）

| 追加项 | 内容 | 影响文件 |
|---|---|---|
| **三态** | 强制 / 分域 / 暂停（`enabled` + `scope`）；分域按节裁剪（域组 tech/net/media/fiction）；冷启动无域记录时回退全量 | `index.js` `client.js` |
| **右键菜单** | 强度三态 + 注入内容候选两区，标注测试功能；分域态蓝底纹 | `client.js` |
| **域表单点化** | `DOMAIN_MARKERS` 抽到 `lib/domain-markers.mjs`（13 域），运行时与离线打分共用；修掉此前的双份漂移 | `lib/domain-markers.mjs`(新) `index.js` `scripts/lib/scorer.mjs` `package.json` |
| **nsfw 词表重建** | 20 → 84 词，来源为本地语料（26 篇 / 447 万字符，正文不入库），三层结构 | `lib/domain-markers.mjs` |
| **纠错** | 分域渲染跳过代码围栏（原文块内有假 `## ` 行）；渲染加缓存；强度变更一律落盘；web 域补 5 词 | `index.js` `lib/domain-markers.mjs` |
| **新增脚本** | `scripts/smoke-prompt-rev.mjs`（36 条）；`package.json` 加 `smoke:host` / `smoke:prompt` / `smoke:scorer` | — |

> 回滚到基线会**一并撤掉**上面全部内容；只撤某一项请按 `git`/备份逐文件处理（本轮未建 git 快照）。
## 回滚步骤

```powershell
# 1) 预演（列出将被恢复的文件）
pwsh -File "$env:APPDATA\in.dsh-plug.dsh-launcher\.sandbox\cpi-baseline-20260930-222006\rollback.ps1" -WhatIf
# 2) 执行（会先把当前状态另存到 pre-rollback-<时间戳>）
pwsh -File "$env:APPDATA\in.dsh-plug.dsh-launcher\.sandbox\cpi-baseline-20260930-222006\rollback.ps1"
# 3) 删除本次新增（可选，回滚脚本不会自动删）
#    prompts\candidates\ 与 scripts\smoke-prompt-rev.mjs
```

回滚后**重启 DSH 实例**才生效（插件在启动时装载）。

## 基线自检（回滚后应全绿）

```powershell
cd $env:APPDATA\in.dsh-plug.dsh-launcher\plugins\dsh-custom-prompt-injection
node scripts/verify-kernel.mjs        # 基线时应为 350 通过 / 0 失败
node scripts/smoke-injection-host.mjs # 基线时无 text() 断言，全部 OK
```
