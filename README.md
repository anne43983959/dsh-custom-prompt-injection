# dsh-custom-prompt-injection

给 DeepSeek Harness（DSH）补上**一层可开关的系统提示词注入**：一个两层载荷（L1 内核 + L2 强化）挂在系统提示词槽位上，配一个客户端开关按钮、一份跨重启的状态记忆、一套可追溯的判定台账。

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D4)
![DSH](https://img.shields.io/badge/DSH-%E2%89%A5_0.1.1--rc.1-4B5563)
![License](https://img.shields.io/badge/license-MIT-green)
![Validated](https://img.shields.io/badge/validated-0.1.7--rc.2-2EA043)

> DSH 的默认系统提示词是给「通用助手」写的。要让它按固定口径产出（否定式约束、语域契约、交付形态），
> 单靠每轮在用户消息里重复一遍既费 token 又不稳 —— 一旦某轮忘了写，行为就漂回去。
> 本插件把这份口径做成**常驻的系统提示词段**，由宿主每次模型调用自动带上；要停就点一下按钮，
> 且**不需要改 DSH 本体、不需要重装插件**。

## 功能

- 🧩 **双层载荷注入** —— L1 内核（`prompts/kernel.md`，9,289 B）+ L2 强化层（`prompts/reinforcement.md`，14,986 B）分别挂在两个系统提示词槽位上；改完载荷**完全重启 DSH** 生效（改的是模块顶层常量）。
- 🔘 **一键开关** —— 输入框上方一个按钮，绿色＝注入中、红色＝已暂停；状态**跨重启记忆**，记在 home 的状态文件里，不随会话、不随页面。
- 📊 **armor 会话投影** —— 把判定结果（verdict / domain / promptRev 等）投影成会话可视状态，客户端状态条直接读它。
- 🧾 **闪红台账** —— 每次命中都留一条可追溯记录（`sid` + `seq` + `at` + `verdict` + `domain` + `promptRev`）。**不存输出片段**：台账只留指针，需要还原就按 `sid`/`seq` 回会话日志解包。
- 🛠️ **一个元数据工具** —— `custom_prompt_profile`：把当前载荷版本、开关状态、槽位挂载情况作为结构化数据返回，供 agent 自查。
- 🔍 **自带自检** —— 四套离线自检脚本（见「验证状态」），改载荷后先跑它们再重启。
- 🛡️ **纯本地** —— 不注册系统协议、不发起网络请求、不改 DSH 安装树；只读写自己的 home 状态文件。

## 兼容性

| 项 | 要求 |
|---|---|
| DSH 版本 | `>=0.1.1-rc.1 <0.2.0`（清单 `dsh.compatibility.runtime`）；本机在 **`0.1.7-rc.2`** 实测通过 |
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
| 改注入内容 | 改 `prompts/kernel.md`（及同步 `kernel-mirror.md`）与 `prompts/reinforcement.md` → 跑自检 → **完全重启 DSH** |

> **改载荷的纪律**：`kernel.md` 与 `kernel-mirror.md` **必须逐字节相同**（两套自检按 SHA256 同源断言）。前者改了后者不改，自检立刻变红。

## ⚠️ 安全说明

### 它会做什么

- 读自己 home 下的状态文件与台账文件；
- 向 DSH 的系统提示词槽位注册 / 注销两段文本（文本是常量，来自 `prompts/`）；
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
| 宿主半 | `index.js` | 读载荷（**模块顶层只读一次**）→ 读一次 home 状态文件 → 挂载/摘除 2 个系统提示词槽位 → 注册 1 个工具 → 注册 1 个会话投影（armor）→ 注册 1 条开关路由 |
| 客户端半 | `client.js`（手写 bundle） | 输入框上方的开关按钮（绿/红双态）；显示投影里的判定结果与状态文件异常提示 |
| 清单补丁 | `cordis.patch.yml` | `insert: [{ id, name }]`，用于 patch 层注册路线 |

载荷现状（**2026-10-01 起为 V3 平衡版**）：

| 文件 | 字节 | 角色 | 谁读它 |
|---|---|---|---|
| `prompts/kernel.md` | **9,289** | L1 内核（权威源） | `index.js` |
| `prompts/kernel-mirror.md` | **9,289**（与上者同 SHA256） | 内核的兼容副本 | `index.js` **不读**；两套自检读 |
| `prompts/reinforcement.md` | **14,986** | L2 强化层 | `index.js` |

> **原版载荷（21,065 B + 37,969 B）已移出插件目录另存**，不在本仓库内 —— 它是历史留档，运行时不再读取。
> 早期文档里 §「载荷构成」标的 21,065 / 37,969 是**原版数字**，与本节的现役值不一致；以本节为准。

## 验证状态

| 自检 | 覆盖 | 怎么跑 |
|---|---|---|
| `verify:injected` | 现役 V3 载荷（41 项断言） | `npm run verify:injected` |
| `verify:archive` | 同源一致性 / 留档载荷（373 项） | `npm run verify:archive` |
| `smoke:client` | 客户端半（44 条） | `npm run smoke:client` |
| `smoke:host` | 宿主半（56 条） | `npm run smoke:host` |
| `smoke:scorer` | 评分器语义 | `npm run smoke:scorer` |
| 语法 | `node --check index.js && node --check client.js` | `npm run harness:check` |

本机实测：**DSH `0.1.7-rc.2`** 上装载正常、开关按钮渲染正常、`custom_prompt_profile` 返回结构正常。

## 设计原则

- **常量载荷、运行时开关**：载荷在模块顶层读一次，改文本必须重启；开关状态单独存 home，改它不用重启。两件事不混。
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
