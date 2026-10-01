# 自定义提示词注入 · dsh-custom-prompt-injection v1.0.0 —— 安装 / 卸载 / 回退 / 排错

> 本地分发版。本文按**脚本与清单的代码事实**重写：每条步骤都在本机（Windows + DSH `0.1.5-rc.3`）核过。
> 两条注册路线**互斥**，二选一；都要**完全重启**宿主才生效。

---

## 0. 前置事实（先读，能省掉一半排错）

| 事实 | 依据 |
| --- | --- |
| 本插件**没有运行时依赖**（`package.json` 里没有 `dependencies` / `peerDependencies`） | `package.json` |
| 载荷在**模块顶层**读取一次 → 改完必须重启，刷新页面 / 新开对话都不算 | `index.js:7-11` |
| 开关状态记在 home：`$DSH_HOME\dsh-custom-prompt-injection\state.json`，**启动读一次、此后单向写回**；改这个文件不会改变注入状态 | `index.js:58-224` |
| 注册方式两种，**不可叠加** | 见 §1 / §2 |
| 一键脚本走的是 patch 层，并把包名从 bundles 中移除（避免重复挂载） | `install.ps1:206-241`、`install.sh:127-143` |
| `install.ps1` 第 1 步强制检查 `pnpm`，没有就退出——**本插件其实不需要 pnpm** | `install.ps1:117-123` |
| 一键脚本假定 home 在用户目录下的 `.dsh`；启动器版数据目录**路径不同** → 用 §1 的路线 | `install.ps1:44`、`install.sh:20` |

---

## 1. 路线 A · 启动器 home（本机现状，推荐）

以本机为例（数据目录 `%APPDATA%\in.dsh-plug.dsh-launcher`，home `homes\0.1.5-rc.3`）：

```powershell
$H   = "$env:APPDATA\in.dsh-plug.dsh-launcher"          # 数据目录
$SRC = "$H\plugins\dsh-custom-prompt-injection"                  # 插件源（本目录）
$PROF = "$H\homes\0.1.5-rc.3\profiles\web"            # 目标 profile

# 1) 备份
Copy-Item "$PROF\package.json" "$PROF\package.json.bak-$(Get-Date -f yyyyMMdd-HHmmss)"

# 2) 登记（手工编辑 package.json）：
#    dependencies 增加：  "dsh-custom-prompt-injection": "link:<$SRC 的绝对路径，用正斜杠>"
#    dsh.profile.bundles 末尾追加： "dsh-custom-prompt-injection"
#    ⚠️ bundles 里写【包名】，dependencies 里写【路径】，写反会静默失败

# 3) 建实时链接（Junction 不需要管理员权限；改动源码即时反映）
New-Item -ItemType Junction -Path "$PROF\node_modules\dsh-custom-prompt-injection" -Target $SRC

# 4) 不要跑 pnpm install：本插件无依赖，跑它只会大范围重链 node_modules

# 5) 完全重启 DSH
```

要点：

- `link:` 是**实时链接**（改源码即时生效，只需重启宿主）；`file:` 会被包管理器**复制**进 `node_modules`，出现"两份不同步"。
- 本机 profile 的 `cordis.patch.yml` **不需要**写任何东西（bundles 路线自带补丁）。
- 卸载反过程：删 bundles 项 → 删 dependencies 行 → 删 Junction → 重启。

---

## 2. 路线 B · 一键脚本（`install.ps1` / `install.sh`）

适用：home 在 `~\.dsh`（Linux/macOS 为 `~/.dsh`）的常规安装。脚本实际执行的动作（逐条对应代码）：

| 步骤 | 动作 | 位置 |
| --- | --- | --- |
| `[1]` | 检查 `~\.dsh`、探测 profile（`DSH_PROFILE` 环境变量 > `web`/`default`/`desktop` > 交互选择）、检查 `pnpm` 是否在 PATH | `install.ps1:98-124` |
| `[1.5]` | 清理同名旧目录（清单硬编码在脚本内） | `:131-143` |
| `[2]` | 用 `robocopy /E` 把本目录整体复制到 `~\.dsh\plugins\dsh-custom-prompt-injection`（排除 `.git` 与脚本自身） | `:145-165` |
| `[3]` | 备份目标 profile 的 `package.json`（带时间戳） | `:167-179` |
| `[4a]` | `dependencies` 写入 `file:../../plugins/dsh-custom-prompt-injection` | `:191-204` |
| `[4b]` | 从 `dsh.profile.bundles` 中**移除**本插件名（脚本注释：第三方插件不属于系统基础 bundle） | `:206-213` |
| `[4c]` | 向 `cordis.patch.yml` 追加 `- insert:` 块（幂等） | `:222-242` |
| `[5]` | 清掉 `node_modules` 旧拷贝 → 建 Junction → 跑 `pnpm install` | `:244-288` |
| `[6]` | 打印重启提示与两条验证方法 | `:315-331` |

`install.sh` 与之同构（`ln -sfn` 软链 + 内嵌 node 脚本改 `package.json`/`cordis.patch.yml`）。

**本版已移除**：脚本原先在 `[5.5]` 段注册 `HKCU:\Software\Classes\dsh` 系统协议（用于外部深链唤起桌面端）。该段**已整块删除**，脚本现在**不写注册表、不注册任何协议、不联网**。

不想跑脚本时，手动等价步骤：复制目录 → 备份 `package.json` → `dependencies` 写 `file:` 行 → 从 bundles 里移除包名 → `cordis.patch.yml` 追加 `insert` 块 → 建链接 → 重启。

---

## 3. 生效验证（三种，任选两种交叉确认）

1. **状态条按钮**：重启后输入框上方出现绿色按钮 `● 已启用注入`（若上次是暂停则为红色 `● 已暂停注入`）—— 界面不显示任何版本号。
2. **元数据工具**：新会话里调用 `custom_prompt_profile`，返回里 `injection` 数组应有两条（`order: 100` 与 `order: 200`，后者 `enabled` 取决于 `DUAL_LAYER_INJECTION`），`injectionToggle.persistence.source` 应告诉你状态从哪来（`default` / `file` / `rejected` / `memory`）；返回值**不含版本字段**。
3. **组合树**：在 profile 目录执行 `dsh --dump-config`（只读，不加载插件代码），输出里应出现本插件条目。
4. **闪红台账**：产生过一次判定后，`$DSH_HOME\dsh-custom-prompt-injection\ledger.jsonl` 应出现，每行一个 JSON。
   查看：`node scripts/ledger.mjs`；溯源单条：`node scripts/ledger.mjs --id <sid>:<seq>`。不想要就设 `DSH_CPI_LEDGER=off` 后重启。
5. **状态文件**：重启后 `$DSH_HOME\dsh-custom-prompt-injection\state.json` 应存在，形如 `{ "schema": 1, "owner": "dsh-custom-prompt-injection", "kind": "injection-state", "enabled": true, "revision": N, … }`。点一次按钮，`enabled` 与 `revision` 应随之变化（**插件写文件，不是文件写插件**）。

---

**注入开关按钮**（v1.0.0 起）：输入框上方的小圆标现在是一个按钮 —— 绿色 `已启用注入` / 红色 `已暂停注入`，点一下即切换（写入即生效，无需重启；**重启后沿用上次的状态**，状态存在 `$DSH_HOME\dsh-custom-prompt-injection\state.json`）。带 `data-injection="on" | "off"` 属性可核对；宿主侧路由为 `POST /api/dsh-custom-prompt-injection/injection`（该路由需 WebUI 会话鉴权，脚本直接请求得 `401` —— 因此**只有界面上的点击能改状态**）。

**状态只由按钮切换**：插件启动时读一次状态文件，之后只写不读。手改文件（比如把 `enabled` 改成 `false`）在当前运行中没有任何效果；若在启动前改过且没同步重算 `digest`，该文件会被判为外部改写 → 忽略、回退到默认（启用）、回写正确内容，并在按钮提示气泡里写「状态文件被外部改写，已忽略并回写」。**要暂停就在界面上点按钮。**

## 4. 卸载

```powershell
# 通用：脚本卸载（移除依赖项、bundles 项、patch 块、node_modules 链接、插件目录）
.\uninstall.ps1        # Linux/macOS: ./uninstall.sh
```

启动器路线手工卸载四步：

1. `dsh.profile.bundles` 删掉 `"dsh-custom-prompt-injection"`；
2. `dependencies` 删掉 `"dsh-custom-prompt-injection": "link:…"` 那一行；
3. 删 `<profile>\node_modules\dsh-custom-prompt-injection`（Junction：`cmd /c rmdir "<路径>"`）；
4. 完全重启 DSH。插件目录本身可留着，方便重装。

---

## 5. 回退到分发原件

分发原件是 QQ 分发的 v9 强化版压缩包（1,239,779 B，2026-09-22）。压缩包内顶层目录名是旧命名，覆盖前先改名为本插件目录名：

```powershell
$zip = "<分发原件压缩包的完整路径>"
Expand-Archive $zip -DestinationPath "$env:TEMP\restore" -Force
# 把 $env:TEMP\restore 下解压出的顶层目录改名为 dsh-custom-prompt-injection（若尚未同名）
Robocopy "<改名后的插件目录>" "$env:APPDATA\in.dsh-plug.dsh-launcher\plugins\dsh-custom-prompt-injection" /E /NFL /NDL /NJH /NJS
```

覆盖后重启即可；profile 侧的登记（依赖键与 bundles 项，见 §1）不必改动。

⚠️ 回退会把宿主半退回**没有状态记忆**的版本：home 里的 `dsh-custom-prompt-injection\state.json` 仍在，但没人再读它，开关重启后回到「已启用」。要不要留着由你决定。

## 6. 自检（离线、不需要密钥）

```powershell
cd <插件目录>
node --check index.js
node --check client.js
node scripts/verify-kernel.mjs   # 权威：308 通过 / 0 失败
node scripts/verify-anchors.mjs        # 107 通过 / 2 失败（两项历史断言）
node scripts/smoke-injection-host.mjs   # 53 通过 / 0 失败（含状态记忆 21 项 + 闪红台账 17 项；用一次性临时 home）
node scripts/smoke-injection-client.mjs # 44 通过 / 0 失败（含状态记忆提示 7 项）
```

其中 `verify-anchors.mjs` 第 6b 节会检查六个文件（`package.json`、三个自述、`install.ps1`、`install.sh`）**不含任何远端仓库域名、图床徽章、插件市场深链与仓库声明键** —— 这是本地分发版的硬约束。

---

## 7. 常见坑（按代码事实重写）

1. **装完不生效** → 九成是没**完全重启**：载荷在模块顶层只读一次，刷新页面、新开对话都不算。
2. **只改 `dependencies` 没改 `bundles`**（或反之）→ 依赖装上了但插件不加载。启动器路线两处都要有。
3. **写反登记位置** → `bundles` 里写**包名**，`dependencies` 里写**路径**；写反会静默失败。
4. **两条注册路线叠加** → 同一插件被挂载两次；切换路线前先清另一条（`cordis.patch.yml` 的 `insert` 块 或 bundles 项）。
5. **`prompts/` 没整体拷过去** → 插件能加载但注入为空，表现是"装上了却什么都没变"。三个载荷文件的关系与同步纪律见 `README.md` §2。
6. **`install.ps1` 因缺 pnpm 直接退出** → 它第 1 步就强制要求 `pnpm` 在 PATH；本插件无依赖，用 §1 的手工路线可完全绕开。
7. **把插件当普通目录拷进 `node_modules`** → 更新时会出现两份不同步；请用 `link:` / `file:` + 链接。
8. **与其它同样注册系统提示词段的包同时启用** → 多份载荷叠加；需要独占时二选一保留。
9. **改完 `kernel.md` 忘了同步 `kernel-mirror.md`** → `verify-anchors.mjs` 的同源断言立刻变红。
10. **台账没生成** → 先确认宿主设了 `DSH_HOME`、且本会话真的产生过判定（`pass` 也会记一行）；再确认没设 `DSH_CPI_LEDGER=off`；`custom_prompt_profile` 的 `injectionToggle.verdictLedger.lastError` 会写明写入失败原因。
11. **手改 `state.json` 想让插件暂停** → 无效：插件启动时读一次、之后只写不读；被改过的文件还会被判为外部改写而忽略并回写。请点界面按钮。
11. **找不到状态文件** → 先确认宿主设了 `DSH_HOME`（未设置时插件退化为内存态，按钮气泡会写「状态不落盘」）；再确认插件确实被加载（§3）。
12. **卸载插件后状态文件仍在** → 正常：它在 home 里而不在插件目录里。卸载脚本不会删它（保留你的开关偏好）；要清掉就手动删 `$DSH_HOME\dsh-custom-prompt-injection\` 整个目录——删之前确认没有别的实例在用。

---

## 8. 本次文档重写记录

| 项 | 改前 | 改后 |
| --- | --- | --- |
| 远端仓库引用（正文出现仓库名与下载地址） | 有 | **已清除** |
| 回退章节「从远端重新拉取」 | 指向远端 | 改为**分发原件 zip 本地回退** |
| 命名与版本号 | 旧品牌名 / 旧版本号 | 全部替换为描述性名称与 `1.0.0`（含安装脚本、自检、测试库） |
| 再次更名 + 界面去版本号 | 上一版名称 + 界面带版本 | 名称与包名改为「自定义提示词注入」/ `dsh-custom-prompt-injection`；界面（按钮/气泡/安装脚本控制台/元数据工具）不再出现任何版本号 |
| `[5.5]` 协议注册段 | 有 | **已从脚本删除**（本文同步声明） |
| 清理 | 离线重绑工具与 `assets/` 图 | 按要求移除（`package.json` 的 `files` 同步） |
| 自检期望值 | 与现版不符 | 按实测重写（186/0 与 107/2） |
| 注入开关 | 无（载荷恒注入） | 界面按钮可运行时暂停/启用；新增宿主路由与两套离线冒烟（§6） |
| **状态记忆** | 无（重启归位「启用」） | 新增 `$DSH_HOME\dsh-custom-prompt-injection\state.json`：启动读一次、之后单向写回；改文件无效；新增 21 项宿主冒烟（§6） |
| 自检期望值（第二次修订） | 186/0 与 15/0 | 按实测更新为 **308/0** 与 **36/0** |
| **闪红台账** | 无（判定只在投影里存最新一份） | 新增 `ledger.jsonl` 与 `scripts/ledger.mjs`；自检期望值第三次修订为 **315/0**、**108/2**、宿主 **53/0**、客户端 **44/0** |
| 载荷三文件关系 | 写错（称三文件同源） | 按实测更正（内核 + 兼容副本 + 强化层） |

分发原件：QQ 分发的 v9 强化版压缩包（1,239,779 B，2026-09-22）。
