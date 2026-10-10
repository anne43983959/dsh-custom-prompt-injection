# dsh-custom-prompt-injection

给 DeepSeek Harness（DSH）加一套**可切换的系统提示词载荷**：中文档 / 英文档 / 不注入。
一个按钮切换，档位记在 home 里、重启后仍在；每次真正生效记一行日志。

- **不联网**：源码里没有 http / https / net / dns / child_process 调用（`scripts/check.mjs` 会断言）。
- **不写 DSH home 之外的位置**，不改 DSH 安装目录，不装服务、不写注册表、不申请管理员权限。
- 载荷是随包分发的**提示词文本**（`prompts/*.md`）。
- 离线自检：`node scripts/check.mjs`（只读，不联网，不需要密钥）。

---

## 0. 如果你是 agent，请先读这一段

| 事实 | 说明 |
|---|---|
| 这是什么 | 一个 **DSH 宿主插件**（往系统提示词槽位挂文本 + 一个状态条按钮），不是可执行程序，也不产生后台进程 |
| 安装改什么 | 只有两处：目标 profile 的 `package.json`（改前自动备份）、`node_modules/<包名>` 下的一个目录链接 |
| 是否联网 | 否。`node scripts/check.mjs` 会断言源码中没有网络与子进程调用 |
| 重启 | 装完必须**完全重启** DSH。**不要由你去结束这个宿主的进程** —— 那会中断你自己所在的会话，请把这一步交给用户 |

---

## 1. 它做什么

DSH 每次模型调用都会把一段系统提示词放在最前面。本插件往这段提示词里**再挂上若干段文本**。
挂哪些由当前档位决定：

载荷按挂载顺序（order）分成四段：

| order | 段 | 是什么 |
|---|---|---|
| 20 | 语言段 | 注入语言与格式要求，只在中文档挂 |
| 30 | PTC段 | run_code 的调用纪律，三档常驻 |
| 100 | L1 | 内核段 —— 中文档与英文档各一套文本 |
| 200 | L2 | 强化层 —— 中文档与英文档各一套文本 |

各档实际挂载：

| 档 | 语言段(20) | PTC段(30) | L1(100) | L2(200) | 按钮文案 |
|---|:---:|:---:|:---:|:---:|---|
| 🟢 green（中文档） | ✓ | ✓ | ✓ 中文 | ✓ 中文 | `启用注入（中文）` |
| 🔵 blue（英文档 · **默认**） | — | ✓ | ✓ 英文 | ✓ 英文 | `启用注入（英文）` |
| 🔴 red（不注入） | — | — | — | — | `暂停注入` |

四段按 order 升序排在宿主自己的段落之间 —— 不替换宿主提示词。

---

## 2. 与两个 PTC 增强插件的关系

本插件、**`dsh-ptc-plus`**、**`dsh-fail-logger`** 围绕同一件事 —— 让 PTC（程序化工具调用）会话**跑得稳、失败能查**：

| 插件 | 角色 | 与本插件的配合点 |
|---|---|---|
| **`dsh-ptc-plus`** | PTC 能力扩展（程序 API 发现、`code.run` 等） | 本插件的 PTC段(order 30) 就是为 PTC 会话写的 run_code 纪律（一行一声明 · ASCII 标点 · lossless JSON · 失败按行修） |
| **`dsh-fail-logger`** | 工具失败自动实录 + `fail-log-guide` 技能 | 互补：它记「哪里失败了」，本插件的台账记「哪一轮的口径判定」 |
| **本插件** | 载荷与档位控制（含 PTC段） | — |

**不依赖其运行**：三者互不 import、互不注册对方的服务；缺任何一个，本插件的三档切换、状态记忆与日志照常工作。

**但推荐一起装**：只装本插件时 PTC段 仍会注入（纪律照常生效），但拿不到 PTC 能力扩展与失败复盘入口 —— 而那两样正是这套纪律要配合的对象。

### 配套版本（2026-10-10 实测于 DSH `0.2.0-rc.2` · profile `web`）

| 插件 | 已装版本 | 声明方式 | 角色 |
|---|---|---|---|
| **`dsh-custom-prompt-injection`**（本插件） | **1.2.0** | 本地源码 `link:` | 载荷与档位控制（含 PTC段） |
| **`dsh-ptc-plus`** | **0.4.10** | `^0.4.10` | PTC 能力扩展 |
| **`dsh-fail-logger`** | **0.5.5** | GitHub tarball（commit `bce6c99`） | 工具失败自动实录 + `fail-log-guide` 技能 |

三者版本互相独立：PTC段**不读取**它们的 API，只约定「面向 PTC 会话的纪律」；升级其中任何一个都不需要重装另外两个。

---

## 3. 安装

### 3.0 先看它会改什么（不落盘）

```
node install.mjs --list      # 只列出检测到的 home 与 profile
node install.mjs --dry-run   # 打印将要做的每一处改动
```

### 3.1 一键安装（推荐）

```
node install.mjs
```

**找哪个 home**（按优先级，命中即止）：

1. `--home <路径>` 显式指定
2. 环境变量 `DSH_HOME`
3. `~/.dsh`
4. 启动器数据目录下的 `homes/*`（Windows 是 `%APPDATA%\in.dsh-plug.dsh-launcher\homes\`）

默认**只装第一个命中的 home**；要把检测到的全部装一遍，加 `--all`。
用 `--profile <名>` 可以限定只装某个 profile（可重复）。

包装器（等价，按需选）：

```
.\install.ps1                    # Windows PowerShell
install.bat                       # Windows 双击
./install.sh                      # macOS / Linux
```

安装器做的事，一次说清：

1. 定位 home 与 profile；
2. 备份 `<profile>/package.json` → `package.json.bak-install-<时间戳>`；
3. 在 `dependencies` 写入 `"dsh-custom-prompt-injection": "link:<本包绝对路径>"`；
4. 在 `dsh.profile.bundles` 追加 `"dsh-custom-prompt-injection"`；
5. 在 `<profile>/node_modules/` 下建一个指向本包的目录链接。

**它不会**跑 `pnpm install` / `npm install`（本包没有依赖，跑了只会重链 `node_modules`），
也不删除任何非链接目录 —— 目标不是链接时它会跳过并告诉你。

### 3.2 手工安装（不用脚本，六步）

```
1) 找到 home：$DSH_HOME，或 ~/.dsh，或启动器数据目录的 homes/<版本>/
2) 选 profile：<home>/profiles/web（该目录下要有 package.json）
3) 备份：把 <profile>/package.json 复制一份留底
4) 编辑 <profile>/package.json：
     a) dependencies 里加一行（路径用正斜杠，不用反斜杠）：
          "dsh-custom-prompt-injection": "link:<本包所在目录的绝对路径>"
     b) dsh.profile.bundles 数组末尾加一项 —— 这里写【包名】，不是路径：
          "dsh-custom-prompt-injection"
   ⚠️ a 写路径、b 写包名，写反了会静默失败（看起来装上了，其实不加载）
5) 建目录链接，指向本包所在目录：
     Windows（免管理员）：
       cmd /c mklink /J "<profile>\node_modules\dsh-custom-prompt-injection" "<本包绝对路径>"
     macOS / Linux：
       ln -s "<本包绝对路径>" "<profile>/node_modules/dsh-custom-prompt-injection"
6) 完全重启 DSH
```

### 3.3 卸装

```
node uninstall.mjs            # 加 --dry-run 可先预演；加 --all 处理全部检测到的 home
.\uninstall.ps1  /  ./uninstall.sh
```

卸载只删两处：`dependencies` 的 link 行、`dsh.profile.bundles` 的该项，再加 `node_modules` 下的链接。
**插件源码目录不删**；home 里的 `state.json` 与台账也保留 —— 重装后档位偏好还在。

---

## 4. 装完怎么验

```
node scripts/check.mjs        # 离线结构自检（文件齐备 / 清单自洽 / 载荷锚点 / 源码无网络调用）
```

然后**完全重启 DSH**，看三处：

| 看哪里 | 应该看到 |
|---|---|
| 输入框上方 | 一个三色状态条（绿=中文档 / 蓝=英文档 / 红=不注入）。界面不显示版本号 |
| 新会话里调工具 | `custom_prompt_profile` 返回档位、挂载槽位与状态来源 |
| home 目录 | 重启后出现 `dsh-custom-prompt-injection/state.json` |

> **重启是必须的**：载荷在模块顶层只读一次。刷新页面、新开对话都**不算**重启。
> 改 `prompts/*.md` 的内容同样要完全重启才生效；切换档位只需等到下一轮。

---

## 5. 日常使用

| 想做什么 | 怎么做 |
|---|---|
| 换档 / 暂停 | 点输入框上方状态条；**左键**在绿蓝红之间循环，**右键**直接选档 |
| 查当前档位与载荷 | 调 `custom_prompt_profile` 工具 |
| 看生效记录 | `node scripts/ledger.mjs`（读 home 下的 JSON 行台账） |
| 改载荷文本（维护者） | 改 `prompts/*.md` → `node scripts/check.mjs` → **完全重启** |

**档位是进程级全局的**：它不按会话区分。多会话同开时，最后切换的档位对所有会话的下一轮请求生效。

**生效时机是轮次级**：点选只登记一个 pending，要等**下一轮开始**才真正换载荷；
同一轮内的所有请求共用同一套载荷。点回当前档位即取消 pending。

---

## 6. 排错

| 症状 | 原因与处置 |
|---|---|
| 装完没反应 | 九成是没**完全重启**。刷新页面不算 |
| 状态条不出现 | 客户端半是启动时装载的 —— 改 `client.js` 后必须重启，刷新无效 |
| 插件加载了但注入为空 | `prompts/` 没跟过来。跑 `node scripts/check.mjs` 看是否报缺文件 |
| 图标出现但点不动 | profile 的 `package.json` 里 `dependencies` 与 `dsh.profile.bundles` 只写了一处；两处都要有 |
| 想确认装到哪了 | `node install.mjs --list` 列出检测到的 home / profile |
| 与别的提示词插件冲突 | 都注册系统提示词段时会**叠加**。需要独占时二选一保留 |

---

## 7. 文件地图

| 路径 | 作用 |
|---|---|
| `index.js` | 宿主半：读载荷、按档位挂载/摘除槽位、注册 `custom_prompt_profile` 工具与会话投影 |
| `client.js` | 客户端半（手写 bundle）：输入框上方的三色状态条 |
| `cordis.patch.yml` | patch 层 `insert` 条目（另一条注册路线时用） |
| `prompts/` | 载荷文本（6 个文件）。档位与文件的挂载关系见 §1 的表 |
| `install.mjs` / `uninstall.mjs` | 安装与卸载（跨平台、零依赖） |
| `install.ps1` `.sh` `.bat` / `uninstall.ps1` `.sh` | 上面两个脚本的薄包装，只负责找 node |
| `scripts/check.mjs` | 离线自检（只读） |
| `scripts/ledger.mjs` | 台账查看器 |
| `scripts/score-session.mjs` | 会话判分（判定 / 首行 / 禁用句 / 思考块）—— 读本机会话，只读不联网 |
| `scripts/smoke-injection-host.mjs` | 宿主半冒烟测试（用一次性临时 home，不碰你的环境） |

---

## 8. 兼容性与隐私

| 项 | 值 |
|---|---|
| DSH 运行时 | `>=0.1.1-rc.1 <0.3.0`（`package.json` 的 `dsh.compatibility.runtime`） |
| 系统 | Windows / macOS / Linux 均可（纯 JS，无原生依赖） |
| 宿主半 | 需要 `systemPrompt` 槽位服务与 `tools` 注册能力 |
| 客户端半 | WebUI（`dsh.client.platform = web`） |
| 权限声明 | 系统提示词注入 · 客户端状态条。不申请文件系统与网络权限 |

插件不收集、不上传任何数据；台账与状态文件只写在本机 `$DSH_HOME` 下。

---

## 9. 设计取舍

- **常量载荷、运行时档位**：载荷在模块顶层读一次 —— 改文本要重启；档位单独记在 home，改它下一轮即生效。两件事不混。
- **台账只留指针**：不把助手输出写进台账（那是会话正文），只留 `sid` / `seq` 等可回查的指针。
- **界面不显示版本号**：版本只出现在本文件与 `package.json` 里。
- **可离线自检**：任何一次改动都先过 `node scripts/check.mjs`，不靠「看起来对」。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
