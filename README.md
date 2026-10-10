# dsh-custom-prompt-injection

给 DeepSeek Harness（DSH）补上一套**三档可切换的系统提示词注入**：中文档 / 英文档 / 无载荷，配一个三色状态按钮、一份跨重启的档位记忆、一份**轮次级**的载荷状态日志，以及一套可追溯的判定台账。

> DSH 的默认系统提示词是给「通用助手」写的。要让它按固定口径产出（否定式约束、语域契约、交付形态），
> 单靠每轮在用户消息里重复一遍既费 token 又不稳 —— 一旦某轮忘了写，行为就漂回去。
> 本插件把这份口径做成**系统提示词段**，由宿主每次模型调用自动带上；要换档或停用就点一下按钮，
> 且**不需要改 DSH 本体、不需要重装插件**。

## 三档

| 档 | 按钮文案 | 颜色 | 注入内容 |
|---|---|---|---|
| 🟢 **green** | `启用注入（中文）` | 绿 `#10b981` | `language-zh`(20) + `kernel-zh`(100) + `reinforcement-zh`(200) |
| 🔵 **blue** | `启用注入（英文）` | 蓝 `#3b82f6` | `kernel-en`(100) + `reinforcement-en`(200) —— **无语言段** |
| 🔴 **red** | `暂停注入` | 红 `#ef4444` | 不注入任何载荷 |

`ptc-hygiene`（order 30）**三档常驻**：它是 run_code 工具纪律，不属于语言实验变量。

**blue 档是"干净的英文基线"**：只挂英文 L1/L2、不挂语言段，英文思考的要求因此写在 `kernel-en.md` §8 里。它用于把「思考语言」与「载荷」两个变量分开测量。

## 轮次级生效（v3 起的核心机制）

- **点选只登记 pending** —— 按钮按下后不立即改载荷，只在主文案后追加 ` · 状态已发生变化`；
- **下一轮开始时才应用** —— 进入新一轮（新的 `user/message`）时，把 pending 落到 section 挂载、写状态文件、写日志；
- **单轮内切换不生效** —— 同一轮里的所有请求共用同一套载荷，这是载荷对照能成立的前提；
- **切回生效档 = 取消 pending** —— 提示随即消失，不写日志；
- **日志按轮次记账** —— `session-modes.jsonl` 一行 = 一次真正生效，带 `turn`（轮次号）与 `trigger: "turn-start"`。

## 按钮交互

| 操作 | 行为 |
|---|---|
| **左键** | 绿/蓝 ▶ 红；红 ▶ **本对话最近用过的非红档**（没用过则 ▶ 绿） |
| **右键** | 弹出三档菜单任选（当前档实心标记） |
| 文案后缀 | 点选后、生效前显示 ` · 状态已发生变化`；生效后自动消失 |
| 圆点 | 与档位无关：表示最近一次回复的判定（绿=符合 / 红=越界 / 灰=尚无） |

## 载荷分层

| order | section | 文件 | 三档归属 |
|---:|---|---|---|
| **20** | `custom-prompt-injection:language-zh` | `prompts/language-zh.md` | 仅 green |
| **30** | `custom-prompt-injection:ptc-hygiene` | `prompts/ptc-hygiene.md` | **三档常驻** |
| **100** | `custom-prompt-injection:global-system-prompt` | `prompts/kernel-zh.md` / `kernel-en.md` | green / blue |
| **200** | `custom-prompt-injection:dual-layer-reinforce` | `prompts/reinforcement-zh.md` / `reinforcement-en.md` | green / blue |

载荷夹在宿主 `deployment:persona-prefix`（order 0）与 `PLAN_POLICY`（order 500）之间；宿主排序规则为 `order` 升序、同 order 按 section 名字典序。**改载荷文件内容需完全重启 DSH**（模块顶层常量）；**切换档位只需等到下一轮**。

## 与另外两个 PTC 增强插件的关系

本插件、**`dsh-ptc-plus`**、**`dsh-fail-logger`** 围绕同一件事 —— 让 PTC（程序化工具调用）会话**跑得稳、失败能查**：

| 插件 | 角色 | 与本插件的配合点 |
|---|---|---|
| **`dsh-ptc-plus`** | PTC 能力扩展（程序 API 发现、`code.run` 等） | 本插件的 `ptc-hygiene`(order 30) 段就是为 PTC 会话写的 **run_code 纪律**（一行一声明 · ASCII 标点 · lossless JSON · 失败按行修） |
| **`dsh-fail-logger`** | 工具失败自动实录 + `fail-log-guide` 技能 | 互补：它记「哪里失败了」，本插件的 `ledger.jsonl` 记「哪一轮的口径判定」 |
| **本插件** | 载荷与档位控制（含 PTC 纪律段） | — |

**不依赖其运行**：三者互不 import、互不注册对方的服务；缺任何一个，本插件的三档切换、状态记忆与日志照常工作。
**但推荐一起装**：只装本插件时 `ptc-hygiene` 段仍会注入（纪律照常生效），但拿不到 PTC 能力扩展与失败复盘入口 —— 而那两样正是这套纪律要配合的对象。

### 配套版本（2026-10-10 实测于 `0.2.0-rc.2` · profile `web`）

| 插件 | 实际安装版本 | 声明方式 | 角色 |
|---|---|---|---|
| **`dsh-custom-prompt-injection`**（本插件） | **1.1.0** | 本地源码 `link:` | 三档载荷与档位控制（含 `ptc-hygiene`(30) 纪律段） |
| **`dsh-ptc-plus`** | **0.4.10** | `^0.4.10` | PTC 能力扩展（程序 API 发现、`code.run` 等） |
| **`dsh-fail-logger`** | **0.5.5** | GitHub tarball（commit `bce6c99`） | 工具失败自动实录 + `fail-log-guide` 技能 |

> 三者版本互相独立：本插件的 `ptc-hygiene` 段**不读取**它们的 API，只约定"面向 PTC 会话的纪律"；
> 升级其中任何一个都不需要重装另外两个。

## 兼容性

| 项 | 要求 |
|---|---|
| DSH 版本 | `>=0.1.1-rc.1 <0.3.0`（清单 `dsh.compatibility.runtime`）；本机在 **`0.1.5-rc.3` / `0.1.7-rc.2` / `0.2.0-rc.2`** 三份 home 均已装载 |
| 系统 | Windows / macOS / Linux 均可（纯 JS，无原生依赖；安装脚本三种平台各一份） |
| 宿主半 | 需要 `systemPrompt` 槽位服务与 `tools` 注册能力 |
| 客户端半 | WebUI（`dsh.client.platform = web`）；在输入框上方挂座位 |
| 权限 | 声明两项：**系统提示词注入**、**客户端状态条**；不申请文件系统与网络权限 |

> ⚠️ **与其它同样注册系统提示词段的插件并用会出现叠加**（多份载荷一起进前缀）。需要本插件独占口径时，二选一保留。

## 安装

### 方法一：一键脚本（推荐）

```powershell
# Windows
.\install.ps1            # 或双击 install.bat
```

```bash
# macOS / Linux
./install.sh
```

脚本做三件事：把插件目录链接进目标 home 的 profile、按需要写 `cordis.patch.yml` 的 insert 段、打印重启提示。**装完必须完全重启 DSH**。

### 方法二：手动

```powershell
$H = "<你的 DSH_HOME>"; $P = "$H\profiles\web"
# 1) 目录链接（link: 依赖）
# 2) profile 的 package.json 里加："dsh-custom-prompt-injection": "link:<插件目录>"
# 3) cordis.patch.yml 里加：
#      - insert:
#          - id: dsh-custom-prompt-injection
#            name: dsh-custom-prompt-injection
```

详细步骤见 [`INSTALL.md`](INSTALL.md)。

### 卸载

```powershell
.\uninstall.ps1          # 或 ./uninstall.sh
```

卸载会摘掉链接与 insert 段，**不碰** home 状态文件（下次装回来开关状态还在）。

## 使用

| 做什么 | 怎么做 |
|---|---|
| 暂停 / 恢复注入 | 点输入框上方的按钮（绿＝注入中，红＝已暂停）；状态立刻生效并**跨重启保留** |
| 查当前载荷与开关 | 调 `custom_prompt_profile` 工具 |
| 看命中记录 | 读 home 下的台账文件（JSON 行）；用 `sid` + `seq` 回会话日志还原当时上下文 |
| 改注入内容 | 改 `prompts/kernel-zh.md`（及同步 `kernel-mirror.md`）与 `prompts/reinforcement-zh.md` → 跑自检 → **完全重启 DSH** |

> **改载荷的纪律**：中文与英文两套各自独立成文件；`scripts/smoke-injection-host.mjs` 会按文件内容**逐字节**断言 L1/L2 文本与文件一致。改完载荷必须**完全重启 DSH**。

## ⚠️ 安全说明

### 它会做什么

- 读自己 home 下的状态文件与台账文件；
- 向 DSH 的系统提示词槽位注册文本（常量，来自 `prompts/`）：**green** 挂语言段(20)+中文 L1(100)+中文 L2(200)；**blue** 挂英文 L1/L2；**red** 全不挂；**ptc-hygiene**(30) 三档常驻；
- 注册一个只读的元数据工具 `custom_prompt_profile`；
- 在 WebUI 输入框上方挂一个按钮与一条状态显示。

### 它不会做什么

- **不发起任何网络请求**；不注册系统协议（`install` 脚本不会把 `dsh://` 之类塞进注册表）；
- **不改 DSH 安装树**、不装服务、不写注册表、不申请管理员权限；
- **不写 DSH 之外的位置**；台账与状态文件都在自己的 `$DSH_HOME` 下。

## 工作原理

两半结构 + 一份清单补丁：

| 半 | 文件 | 职责 |
|---|---|---|
| 宿主半 | `index.js` | 读载荷（**模块顶层只读一次**）→ 读一次 home 状态文件 → 挂载/摘除 2 个可开关槽位（另加 1 个常驻语言段） → 注册 1 个工具 → 注册 1 个会话投影（armor）→ 注册 1 条开关路由 |
| 客户端半 | `client.js`（手写 bundle） | 输入框上方的**三档状态条**（绿/蓝/红；左键切换 + 右键三档菜单 + `data-mode` 属性）；显示投影里的判定结果与状态文件异常提示 |
| 清单补丁 | `cordis.patch.yml` | `insert: [{ id, name }]`，用于 patch 层注册路线 |

载荷现状（**2026-10-01 起为 V3 平衡版**）：

| 文件 | 字节 | 角色 | 谁读它 |
|---|---|---|---|
| `prompts/kernel-zh.md` | **9,289** | L1 内核（权威源） | `index.js` |
| `prompts/kernel-mirror.md` | **9,289**（与上者同 SHA256） | 内核的兼容副本 | `index.js` **不读**；两套自检读 |
| `prompts/reinforcement-zh.md` | **14,986** | L2 强化层 | `index.js` |

> **原版载荷（21,065 B + 37,969 B）已移出插件目录另存**，不在本仓库内 —— 它是历史留档，运行时不再读取。
> 早期文档里 §「载荷构成」标的 21,065 / 37,969 是**原版数字**，与本节的现役值不一致；以本节为准。

## 验证状态

| 自检 | 覆盖 | 怎么跑 |
|---|---|---|
| `verify:injected` | 现役载荷（L1 内核 + L2 强化 + 常驻语言段）结构与同源（41 项断言） | `npm run verify:injected` |
| `verify:anchors` | 兼容回归：载荷锚点 / 注入面同源覆盖 / `index.js` 导出 / 安装协议 / 用例库结构（106 项断言） | `npm run verify:anchors` |
| `verify:archive` | 留档载荷同源校验（留档在位时 373 项）；**留档已移出插件目录 → 现况为跳过**（打印存放位置，退出码 0） | `npm run verify:archive` |
| `smoke:client` | 客户端半（44 条） | `npm run smoke:client` |
| `smoke:host` | 宿主半（56 条） | `npm run smoke:host` |
| `smoke:scorer` | 评分器语义 | `npm run smoke:scorer` |
| 语法 | `node --check index.js && node --check client.js` | `npm run harness:check` |

本机实测：**DSH `0.1.7-rc.2`** 上装载正常、开关按钮渲染正常、`custom_prompt_profile` 返回结构正常。

## 设计原则

- **常量载荷、运行时档位**：载荷在模块顶层读一次，改文本必须重启；档位单独存 home（schema 2 = `mode`），改它**下一轮生效**、不用重启。两件事不混。
- **台账只留指针**：不把助手输出片段写进台账（那是会话正文），只留 `sid`/`seq` 等可回查的指针。
- **不显示版本号**：界面（按钮、气泡、控制台输出、工具返回值）一律不显示版本；版本只出现在自述与 `package.json`。
- **可离线自检**：任何一次载荷修改都必须先过自检再重启，不靠「看起来对」。

## 文档

| 文件 | 内容 |
|---|---|
| [`INSTALL.md`](INSTALL.md) | 逐平台的安装 / 卸载步骤与排错 |
| [`HARNESS_PLUGIN.md`](HARNESS_PLUGIN.md) | 宿主半的接口契约（槽位、投影、路由、工具） |
| [`BASELINE.md`](BASELINE.md) | 实测基线（载荷哈希、自检项数、实测版本） |
| `scripts/` | 全部自检与验证脚本 |
| `tests/` | 提示词题库与基准数据（供 `smoke:scorer`） |

## 许可证

MIT —— 见 [`LICENSE`](LICENSE)。

### 隐私

本插件不收集、不上传任何数据；台账与状态文件只写在本机 `$DSH_HOME` 下。

## v3 变更（2026-10-10）

| 项 | v2（旧） | v3（现行） |
|---|---|---|
| 状态 | `enabled` 布尔（启用/暂停） | `mode` 三档：`green` / `blue` / `red` |
| 载荷 | 语言段（常驻）+ 中文 L1 + 中文 L2 | green：语言段 + 中文 L1/L2；blue：英文 L1/L2（**无语言段**）；red：无 |
| 生效时机 | 点按钮立即改挂载 | **轮次级**：点选只登记 pending，下一轮开始才应用（单轮内不改载荷） |
| 按钮文案 | 已启用注入 / 已暂停注入 | 启用注入（中文）/ 启用注入（英文）/ 暂停注入；点选未生效时追加「 · 状态已发生变化」 |
| 交互 | 仅左键 | 左键（见「按钮交互」）+ **右键三档菜单** |
| 状态文件 | `state.json` schema 1 | schema **2**（启动时自动迁移；`enabled:true → green`、`false → red`） |
| 路由契约 | v1 `{enabled}` → `{enabled,persist}` | **v2** `{mode,sessionId}` → `{mode,pending,display,…}`（保留 `{toggle}` / `{enabled}` 兼容入口） |
| 日志 | 只有判定台账 `ledger.jsonl` | 新增 **`session-modes.jsonl`**：一行 = 一次真正生效（带 `turn` 轮次号） |
| 文件 | `kernel.md` / `reinforcement.md` / `language.md` | `kernel-zh.md` / `kernel-en.md` / `reinforcement-zh.md` / `reinforcement-en.md` / `language-zh.md`；旧三件归档在 `prompts/archive/v3-*.md` |

下文若有仍写「开关 / 双态 / `kernel.md`」的历史段落，以本节与上文的三档描述为准。
