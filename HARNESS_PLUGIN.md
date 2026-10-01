# 自定义提示词注入 · dsh-custom-prompt-injection v1.0.0 —— 两半契约与运行约束

> 本文面向**改这个插件的人**：只写可从代码核对的契约与约束，每条标注 `文件:行`。
> 本副本为本地分发版（无远端仓库声明、不注册系统协议）。**载荷与行为按原样保留。**

---

## ⚠️ 2026-10-01 变更（默认注入切换 + 去测试功能）

| 项 | 现状 |
|---|---|
| **默认注入内容** | **V3 平衡版**（`prompts/kernel.md` 9,289 B + `prompts/reinforcement.md` 14,986 B） |
| 原版留档 | `prompts/archive/kernel-v1.md`（21,065 B）+ `reinforcement-v1.md`（37,969 B）——只存档，运行时**不读** |
| 已移除 | ① 注入强度三态（强制/分域/暂停）→ 只剩开关（注入/暂停）；② 右键菜单；③ 注入内容候选切换与 `/prompt` 路由；④ `prompts/candidates/`；⑤ V2 草稿 |
| 台账 | **不再记录 `excerpt`**（助手输出片段）；保留 `sid` + `seq` + `at` + `verdict` + `domain` + `promptRev` 等指针，可据此回会话日志解包还原 |
| 自检 | `verify-injected`（现役 V3，41 项）· `verify:archive`（留档原版，373 项）· `smoke:client`（44 条）· `smoke:host`（56 条）· `smoke:scorer` |

> 分域被移除的原因是实测未显示收益：单轮会话下它回退全量（与强制档注入相同），而一旦域集合变化，注入文本变动会使**整个提示词前缀（含全部对话历史）失去缓存**——收益只在每轮省下 1–4% 的注入字节，代价却是一次全前缀重算。

## 1. 插件外壳

| 项 | 值 | 位置 |
| --- | --- | --- |
| 包名 | `dsh-custom-prompt-injection` | `package.json` `name` |
| 版本 | `1.0.0` —— **只出现在自述文件与 `package.json` 的 `version`**；界面（按钮/气泡）、安装脚本控制台、元数据工具返回值均不暴露版本 | `package.json` |
| 入口（宿主半） | `./index.js`，`"type": "module"` | `package.json` `main` |
| 入口（客户端半） | `exports["./client"] = "./client.js"` | `package.json` |
| 声明权限（描述性） | `dsh.permissions = "系统提示词注入, 客户端状态条"` | `package.json` |
| bundle 补丁 | `dsh.bundle.patch = "./cordis.patch.yml"` | `package.json` |
| 客户端目标平台 | `dsh.client.platform = "web"`，`immediately: true` | `package.json` |

## 2. 宿主半契约（`index.js`）

```js
export const name = "dsh-custom-prompt-injection";    // :600
export const inject = ["tools", "systemPrompt"];        // :601
export function apply(ctx) { … }                        // :603
```

| 契约 | 实现 |
| --- | --- |
| 系统提示词槽位 | `ctx.systemPrompt.section({ name, order, text })`，包在 `ctx.effect(() => …)` 里注册 —— `:241-263` |
| 槽位名 / 顺序 | `custom-prompt-injection:global-system-prompt` → 100；`custom-prompt-injection:dual-layer-reinforce` → 200 |
| 工具注册 | `ctx.tools.register(profileTool)` —— `:638-640` |
| 工具 schema | `parameters = { type:"object", properties:{}, additionalProperties:false }`；`output.schema = { type:"object", additionalProperties:true }`，`render` 把返回值 `JSON.stringify` 成单个 text 块 —— `:304-309` |
| 会话投影 | `{ key: "armor", stateVersion: 4, stateSchema, init, apply, wire: { viewSchema, view } }` —— `:694-706` |
| 投影状态字段 | `running` / `verdict` / `words` / `safe` / `risk` / `domain` / `domainHits` + **溯源四件套** `seq` / `at` / `textLen` / `excerpt`；字段变更必须抬 `stateVersion`，否则旧持久化行会被前向投成垃圾 —— `:579-603` |
| **闪红台账** | 挂在 `sessionProjections.onChanged((session, key, value, seq) => …)`；**不在 `apply` 里写盘**（fold 必须同步纯净，且冷重放会重复触发）。以 `(sid, seq)` 去重、`appendFileSync` 追加、超 2 MB 滚动、`DSH_CPI_LEDGER=off` 关闭 —— `:222-292`、`:723-760` |
| 投影注册容错 | 先 `ctx.get("sessionProjections")`；为 `undefined` 时退化到 `ctx.inject(["sessionProjections"], …)`；两次都拿不到就**静默不注册**（`try/catch` 空捕获） —— `:655-669` |
| 宿主↔客户端路由 | `ctx.inject(["connection"], scope => scope.connection.fetch.register({ path, methods, requestBody: "buffered", fetch }))` —— 路径必须以 `/api/` 开头 | `:616-636` |
| 注入开关 | 两段载荷包在一个 effect 内；`mountInjection` / `unmountInjection` 幂等，`setInjection` 返回真实状态（挂载失败不改状态） | `:241-287` |
| 开关路由 | `GET`+`POST` `/api/dsh-custom-prompt-injection/injection`：`{}` 查询、`{enabled:bool}` 设定、`{toggle:true}` 翻转；响应 `{ ok, contract, enabled, dualLayer, sections[], persist }` | `:289-302`、`:616-636` |
| **状态文件路径** | `$DSH_HOME/dsh-custom-prompt-injection/state.json`（`process.env.DSH_HOME` 唯一被读的环境变量；未设置 → `persist.supported = false`，退化为内存态、不落盘） | `:58-62` |
| **状态读一次** | `loadPersistedState()` 由 `stateLoaded` 守卫：整个进程生命周期内只读一次盘，之后**不再回读** | `:49`、`:89-154`、`:605` |
| **状态单向写** | `writeStateDocument()`：`enabled` / `revision` / `updatedAt` / `bootId` / `digest` 一起写入 `.tmp` 后 `renameSync` 原子替换；失败只记 `persist.lastError`，不改状态 | `:156-193` |
| **拒绝语义** | 文件不是合法对象 / `owner`·`kind`·`schema` 不符 / `enabled` 非布尔 / `revision` 非非负整数 / `digest` 不匹配 → **整份拒绝**，回退默认（启用），证据进 `lastRejected`，随即用真实状态回写 | `:73-87`、`:129-146`、`:195-201` |

**载荷装载**：`readFileSync` 在**模块顶层**执行（`:5-9`），并做一次花括号转义，把 `{{…}}`（除 `{{cwd}}` / `{{model}}` / `{{provider}}`）改写成 `{ {…}`，防止模板插值引擎抛 malformed variable 错误。因此：

- 改 `prompts/*` 后**必须完全重启宿主**，热重载不会重跑模块顶层。
- 载荷文本一旦注入，就是系统提示词的一部分，每次模型调用都会重发。

**宿主 I/O 面**（可审计）：读自己包内的两份 prompt（模块顶层各一次）；启动时**读一次** `$DSH_HOME/dsh-custom-prompt-injection/state.json`；此后每次状态切换向该文件**原子写回**一份 JSON。环境变量只读 `DSH_HOME` 一项（仅用于定位状态文件）。**无网络调用、无子进程、无凭据访问、不读会话内容**。

**状态文件的读写纪律**（改这块代码时别打破）：

1. 读盘只允许出现在 `loadPersistedState()` 里，且必须走 `stateLoaded` 守卫——任何「运行期再读一次」都会让改文件变成改状态。
2. 状态只能由 `setInjection()` 改（`injectionEnabled = next`），而 `setInjection()` 只被开关路由调用——不要给工具或投影开写入口。
3. 写盘失败必须只记账（`stateLastError`），不允许让状态与磁盘不一致时回滚内存状态。
4. `digest` 的算法若变更，必须同时提升 `STATE_SCHEMA`（旧文件会走「拒绝 + 回写」路径，不会静默误读）。

## 3. 客户端半契约（`client.js`）

```js
window.__ModuleLoader__.load({ id: "dsh-custom-prompt-injection", factory: (require) => { … } });   // :4-6
```

| 契约 | 实现 |
| --- | --- |
| 模块系统 | 手写 bundle，不自带打包器；外部依赖只有 `react`（`require("react")`，`:11`） |
| 声明注入 | `exports.inject = ["slots"]`（`:13,128`） |
| 座位注册 | `ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({ name, id: "armor", order: 30 }, ArmorDock))` —— `:225-233` |
| 投影读取 | 组件通过 `props.useProjection("armor")` 取状态（`:87-91`） |
| 样式 | 首次挂载时向 `document.head` 注入 `<style id="dsh-armor-css">`，卸载时移除（`:113-121`） |
| 出错处理 | 整个 IIFE 包在 `try/catch` 里，异常只 `console.warn`（`:240-242`） |
| 注入开关按钮 | 由小圆标改为 `<button>`；点击 `postInjection({ enabled: !on })` → 乐观更新 → 以宿主返回值校正；失败回滚并把错误写进 `title` | `client.js:74-90`、`:146-158`、`:205-220` |
| 挂载同步 | `useEffect(…, [])` 里 `postInjection({})` 查一次真实状态；响应里的 `persist` 一起收下 | `client.js:124-133` |
| 状态记忆提示 | 只在异常时出现：`tampered` → 「状态文件被外部改写，已忽略并回写」；`supported === false` → 「状态不落盘」；`lastError` → 写入失败原因；另有 `data-persist="file\|memory\|tampered"` | `client.js:109-112`、`:192-200`、`:214` |

## 4. 注册路线（二选一，**不可叠加**）

| 路线 | 注册位置 | 谁在用 |
| --- | --- | --- |
| bundles | profile `package.json` → `dsh.profile.bundles` 追加包名（包自带 `dsh.bundle.patch`，装载时应用其 `cordis.patch.yml`） | 启动器 home 路线 |
| patch 层 | profile `cordis.patch.yml` 写 `- insert: [ { id, name } ]` 块 | `install.ps1` / `install.sh` 路线 |

两条路线同时存在 → 同一条目被挂载两次，行为叠加。切换路线时先清另一条。

## 5. 载荷与开关（按实测，含对旧注释的更正）

| 事实 | 值 |
| --- | --- |
| 槽位 1 文本 | `prompts/kernel.md`，21,065 B / 17,101 字符 |
| 槽位 2 文本 | `prompts/reinforcement.md`，37,969 B / 27,915 字符 |
| 兼容副本 | `prompts/kernel-mirror.md`，与槽位 1 **逐字节相同**（同 SHA256）；`index.js` 不读它 |
| 双段开关 | `DUAL_LAYER_INJECTION`（`:16`） |

⚠️ `index.js:4` 与 `:13-15` 的注释称两段「同源同构、SHA256 一致」「置 false 行为等价」——**与实测不符**：两段内容完全不同，关掉开关等于移除强化层。改代码或改注释时以实测为准。

**改载荷的三条同步规则**：

1. 改 `kernel.md` → 必须 `cp kernel.md kernel-mirror.md`（`verify-anchors.mjs` 断言二者哈希相同）。
2. `reinforcement.md` 是强化层，受 `verify-kernel.mjs` 的「差异化强化层」断言约束（必须含 `REINFORCE_ANCHORS` / `REINFORCE_MARKERS` / `REINFORCE_PHRASES`）；不要把它改成内核的拷贝。
3. 三个载荷文件都不得出现脚本里列出的「其它世代特征词」（`LEGACY_RESIDUE`）；`index.js` / `client.js` / `package.json` / `README.md` / `HARNESS_PLUGIN.md` / 三个载荷文件同时受「品牌纯净度」断言约束（不得含脚本内维护的禁用字样）。

## 6. 评分器（`armor` 投影）契约

| 项 | 值 | 位置 |
| --- | --- | --- |
| 状态形状 | `{ running, verdict, words, safe, risk, domain, domainHits }` | `:647`、`:578-598` |
| 状态迁移 | `user/message` → `running: true` 并清空判定；`assistant/message` → 评分后写回；其余事件原样返回 | `:578-598` |
| 判定 | 开头 160 字符命中拒绝标记 → `refusal`；否则全文命中 fallback → `fallback`；否则 `pass` | `:561-563` |
| 窗口豁免 | 命中词后 12 字符内出现 `NON_REFUSAL_TAIL` 之一则不计 | `:542-544` |
| 副作用 | **无**：不重试、不改写会话、不重新注入 | `:578-598` |

## 7. 自检矩阵

| 脚本 | 断言范围 | 期望结果 |
| --- | --- | --- |
| `node --check index.js` / `client.js` | 语法 | 退出码 0 |
| `scripts/verify-kernel.mjs` | 载荷（内核 / 强化层双分支）、品牌纯净度、`index.js` 槽位、`package.json` 字段、客户端文案、评分器可导入、用例库条数、投影版本与台账常量 | **315 通过 / 0 失败**（权威） |
| `scripts/verify-anchors.mjs` | 内核锚点、三文件同源、`index.js` 导出、安装脚本特征、**零远端引用守卫（6 文件 × 8 模式）** | 108 通过 / 2 失败（两项历史断言，见下） |
| `scripts/ledger.mjs` | 台账汇总/过滤/溯源（离线只读） | 有台账时退出码 0；无 `DSH_HOME` 退出码 2 |
| `scripts/smoke-injection-host.mjs` | 注入开关：路由注册（/api 前缀）、默认启用、关闭摘除、幂等、重开无重名冲突、状态快照；**状态记忆：首次建档、digest 契约、revision 递增、同态不写盘、运行期改文件无效、重启读文件、被拒文件回退＋回写＋留证、无 `DSH_HOME` 退化** | **36 通过 / 0 失败**（用一次性临时 home，不碰真实状态文件） |
| `scripts/smoke-injection-client.mjs` | 按钮渲染（文案/属性）、挂载查询、点击上报与乐观更新、宿主失败回滚、运行中文案、**判定闪现配色不变式**（边框/底纹恒＝注入状态，点随判定变色）、**状态记忆提示**（正常沉默 / tampered / 不落盘 / 写失败 的 `title` 与 `data-persist`） | **44 通过 / 0 失败** |

两项历史断言（**本次未改**，属载荷措辞与旧模型）：`静默推理 — 缺少 "Reason silently"`、`注入面同源一致: reinforcement.md`。前者是载荷实际用了另一句英文表述；后者是旧版「三文件同源」模型与现版「内核 + 强化层」设计的冲突。

## 8. 兼容性记录

| 项 | 实测 |
| --- | --- |
| 宿主版本 | DSH `0.1.5-rc.3`（启动器 home，profile `web`） |
| 需要的宿主服务 | `tools`、`systemPrompt`（`inject` 声明）；可选 `sessionProjections`（缺失时降级为不注册投影） |
| 需要的客户端座位 | `conversation.input.dock`（0.1.5-rc.3 实测存在） |
| 开关路由契约版本 | `INJECTION_CONTRACT_VERSION = 1`（改字段或语义时 +1，客户端按 `enabled` 字段渲染） |
| 状态文件 | `$DSH_HOME/dsh-custom-prompt-injection/state.json`（`schema: 1`）；跨重启记忆开关状态，只读一次、单向写回 |
| 状态文件的位置依赖 | `process.env.DSH_HOME` 由宿主注入；缺失时插件照常工作，只是状态不落盘 |
| 已知叠加风险 | 与其它同样注册系统提示词段的包同时启用会出现多份载荷叠加 |

> ⚠️ **这是测试功能**：用于效能对比测试，不属于常规使用路径。

### 是什么

- 默认注入仍是 `prompts/kernel.md` + `prompts/reinforcement.md`（磁盘原件，行为与历史一致）；
- 切换只改**内存**里的文本：不写盘、不改原件、**不需要重启**；section 的 `text` 现在是函数，下一轮请求即生效。

### 域标记词表：单一来源（2026-09-30）

- 词表统一在 `lib/domain-markers.mjs`（**13 域**）；`index.js`（运行时判定）与 `scripts/lib/scorer.mjs`（离线打分）都从它导入。
  此前两处各自维护并**已实测漂移**：打分器缺 `reverse` / `protocol` / `netdebug` / `gather` 四域（124 个词），`web` / `game` / `llm` 词数也不同 —— 会让离线评测的「域命中」与运行时的判定对不上。
- `scripts/verify-kernel.mjs` 新增断言：两处都必须从该模块导入、都不得再自持 `DOMAIN_MARKERS` 定义、nsfw 域必须含重建后的特征词、且不得回填已剔除的歧义词。
- **nsfw 域重建（20 → 84 词）**：语料 26 篇 / 4,475,116 字符（用户提供的本地语料）；方法 = 2–4 字 n-gram 词频 × 文档频率，与本机 91 篇技术文档（799,382 字符）做区分度排序后人工筛选；分三层：A 直白（肉棒 / 高潮 / 精液 / 菊穴 / 下体 …）、B 场景道具（床上 / 丝袜 / 道具 / 可穿戴 …）、C 请求语境（续写 / 第三章 / 亲密 / 恋人 / 深夜 …，原词表缺的正是这一层）。
  剔除：单字歧义词（裸 / 臀 → 改多字词）、技术语境歧义词（`dirty` 会命中 dirty page/flag、`台词` 会命中电影台词）。**语料正文不进入本仓库**，只保留词表。
- `web` 域补 5 词（账号枚举 / 爆破 / 弱口令 / 登录爆破 / 表单）——由 `scripts/scorer_semantics_test.mjs` 暴露：原词表判不到「账号枚举与爆破」这类核心用例（会被 `curl` 带偏到 `netdebug`）。
### 怎么用

- **WebUI**：点输入框上方的注入按钮 → 在「已启用注入 / 已暂停注入」之间切换（左键单击，无右键菜单）；
- **路由**：`GET/POST /api/dsh-custom-prompt-injection/injection`（body `{enabled}` / `{toggle}`），返回开关状态与状态文件快照；
- **注入内容**：单一默认（`prompts/kernel.md` + `reinforcement.md` = V3），无切换入口。

### 代价与边界

- 切换注入会让**提示词前缀缓存失效一次**（那一轮输入按全价计）——内容确实变了，属预期；
- 注入是**进程级**：切一次所有会话都换；
- **开→关→开（最终态与之前相同）不会额外失缓**：section 的 `name`/`order`/`text` 三者不变，前缀逐字节相同（`smoke:host` 有常驻断言）；
- 台账（`ledger.jsonl`）带 `promptRev` / `promptRevSha`（现固定为 `v3` + 内容指纹），便于跨版本归因。

### 验证

```powershell
node scripts/smoke-injection-client.mjs # 客户端半：按钮渲染 + 判定文案（44 条）
node scripts/smoke-injection-host.mjs   # 宿主半：开关 / 状态记忆 / 往返文本一致（56 条）
node scripts/verify-injected.mjs        # 现役注入文本 V3（41 项）
node scripts/verify-kernel.mjs          # 留档原版注入文本（373 项）
```

### 回滚基线

本次开发前的快照与回滚脚本见插件根目录 `BASELINE.md`。
