// 宿主半冒烟（轮次级 2026-10-10）：点选只登记 pending → 下一轮开始才生效 → 日志按轮次记账
// 离线：不碰真实实例；状态与日志落在一个一次性临时 home 里。
// 用法：node scripts/smoke-injection-host.mjs
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const P = (n) => new URL("../prompts/" + n, import.meta.url);
const KERNEL_ZH = readFileSync(P("kernel-zh.md"), "utf8");
const KERNEL_EN = readFileSync(P("kernel-en.md"), "utf8");
const REINF_ZH = readFileSync(P("reinforcement-zh.md"), "utf8");
const REINF_EN = readFileSync(P("reinforcement-en.md"), "utf8");
const LANG_ZH = readFileSync(P("language-zh.md"), "utf8");

const fails = [];
const pass = [];
const check = (ok, label, detail) => (ok ? pass : fails).push(label + (ok || !detail ? "" : " — " + detail));

const HOME = mkdtempSync(join(tmpdir(), "dsh-cpi-host-smoke-"));
process.env.DSH_HOME = HOME;
const DIR = join(HOME, "dsh-custom-prompt-injection");
const STATE_PATH = join(DIR, "state.json");
const LOG_PATH = join(DIR, "session-modes.jsonl");
const LEDGER_PATH = join(DIR, "ledger.jsonl");
const readState = () => (existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : null);
const readLog = () => (existsSync(LOG_PATH) ? readFileSync(LOG_PATH, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const readLedger = () => (existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const digestV2 = (mode, revision) =>
  createHash("sha256").update(["dsh-custom-prompt-injection", "injection-state", "v2", "mode=" + String(mode), "revision=" + revision].join("|")).digest("hex");
const digestV1 = (enabled, revision) =>
  createHash("sha256").update(["dsh-custom-prompt-injection", "injection-state", "v1", "enabled=" + (enabled ? "true" : "false"), "revision=" + revision].join("|")).digest("hex");

function makeCtx(sections, routes, projections) {
  const fakeConnection = {
    fetch: {
      register(def) {
        if (!String(def.path).startsWith("/api/")) throw new Error("route must start with /api/");
        routes.set(def.path, def);
        return () => routes.delete(def.path);
      },
    },
  };
  const ctx = {
    effect(fn) { const d = fn(); let done = false; return () => { if (done) return; done = true; if (typeof d === "function") d(); }; },
    systemPrompt: {
      section({ name, order, text }) {
        if (sections.has(name)) throw new Error("section already registered: " + name);
        if (!Number.isFinite(order) || !text) throw new Error("bad section: " + name);
        sections.set(name, { order, text });
        return () => { sections.delete(name); };
      },
    },
    tools: { register() {} },
    get(name) { return name === "sessionProjections" ? projections : undefined; },
    inject(deps, cb) { cb({ effect: ctx.effect, connection: fakeConnection, get: ctx.get }); },
  };
  return ctx;
}

let bootSeq = 0;
async function boot() {
  const mod = await import("../index.js?boot=" + (++bootSeq));
  const sections = new Map();
  const routes = new Map();
  const projections = { defs: [], listeners: [], register(def) { this.defs.push(def); return () => {}; }, onChanged(fn) { this.listeners.push(fn); return () => {}; } };
  const ctx = makeCtx(sections, routes, projections);
  mod.apply(ctx);
  const route = routes.get("/api/dsh-custom-prompt-injection/injection");
  const call = (body) => route.fetch(new Request("http://x/api/dsh-custom-prompt-injection/injection", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}),
  })).then((res) => res.json().then((json) => ({ status: res.status, json })));
  const emit = (sid, state, seq) => projections.listeners[0]({ id: sid }, "armor", state, seq);
  const base = () => ({ running: false, verdict: null, words: [], safe: [], risk: [], domain: null, domainHits: 0, seq: null, at: Date.now(), textLen: 0, excerpt: "" });
  const turnStart = (sid, seq) => emit(sid, Object.assign(base(), { running: true, seq: seq }), seq);
  const turnEnd = (sid, seq, verdict) => emit(sid, Object.assign(base(), { running: false, seq: seq, verdict: verdict || "pass", textLen: 12, excerpt: "smoke" }), seq);
  return { sections, routes, ctx, call, projections, emit, turnStart, turnEnd };
}

const LANG = "custom-prompt-injection:language-zh";
const S1 = "custom-prompt-injection:global-system-prompt";
const S2 = "custom-prompt-injection:dual-layer-reinforce";
const SH = "custom-prompt-injection:ptc-hygiene";

/* ───────────── 一、点选只登记 pending，轮次开始才生效 ───────────── */
const A = await boot();
// 默认档 = blue（2026-10-10 作者指示：默认改为纯英基线）
check(A.sections.size === 3 && !A.sections.has(LANG), "默认 blue：槽位 3（100+200+30）", "实际 " + A.sections.size);
check(A.sections.get(S1).text() === KERNEL_EN && A.sections.get(S2).text() === REINF_EN, "默认 blue：L1/L2 文本 = 英文文件逐字一致");
const q0 = await A.call({});
check(q0.json.mode === "blue" && q0.json.contract === 2, "查询：默认 blue，契约 2");
// 显式切到 green 并让它在下一轮生效 —— 后续断言沿用 green 基线
await A.call({ mode: "green", sessionId: "s-init" });
A.turnStart("s-init", 5);
check(A.sections.size === 4 && A.sections.has(LANG), "切 green 生效：槽位 4（20+100+200+30）", "实际 " + A.sections.size);
check(A.sections.get(S1).text() === KERNEL_ZH && A.sections.get(S2).text() === REINF_ZH, "green：L1/L2 文本 = 中文文件逐字一致");
check(A.sections.get(LANG).text() === LANG_ZH, "green：语言段文本 = language-zh.md 逐字一致");

const reqBlue = await A.call({ mode: "blue", sessionId: "s-blue" });
check(reqBlue.json.pending === "blue" && reqBlue.json.mode === "green", "点选 blue：只登记 pending，生效档仍 green");
check(reqBlue.json.display === "blue", "显示档 = blue（按钮按 pending 渲染）", String(reqBlue.json.display));
check(A.sections.size === 4 && A.sections.has(LANG), "点选后槽位不变（单轮内不生效）", "实际 " + A.sections.size);
check(readState().mode === "green", "点选后状态文件不变（仍 green）");
check(readLog().length === 1, "点选后日志仍为 1 行（仅初始化那条；只有真正生效才记）", "实际 " + readLog().length);

A.turnStart("s-blue", 11);
check(A.sections.size === 3 && !A.sections.has(LANG), "下一轮开始：blue 生效（语言段摘除）", "实际 " + A.sections.size);
check(A.sections.has(SH), "生效后常驻纪律段仍在");
check(A.sections.get(S1).text() === KERNEL_EN && A.sections.get(S2).text() === REINF_EN, "生效后 L1/L2 文本 = 英文文件逐字一致");
check(readState().mode === "blue", "生效后状态文件同步为 blue");
const log1 = readLog();
check(log1.length === 2, "日志：共 2 行（blue→green 的初始化 + green→blue）", "实际 " + log1.length);
check(log1[1].mode === "blue" && log1[1].from === "green", "日志：第 2 行 green → blue");
check(log1[1].turn === 11 && log1[1].trigger === "turn-start", "日志：轮次级（turn=11, trigger=turn-start）", JSON.stringify(log1[1]));
check(log1[1].sessionId === "s-blue" && log1[1].scope === "session", "日志：带会话 id 与 scope");
A.turnStart("s-blue", 11);
check(readLog().length === 2, "同一轮重复事件不重复记账（seq 去重）");

// 轮内再点一次：不得改载荷
A.turnStart("s-blue", 12);
const midTurn = await A.call({ mode: "red", sessionId: "s-blue" });
check(midTurn.json.pending === "red" && midTurn.json.mode === "blue", "轮内点选 red：只登记 pending");
check(A.sections.size === 3 && A.sections.has(S1), "轮内点选不改载荷（仍 blue）", "实际 " + A.sections.size);
A.turnStart("s-blue", 13);
check(A.sections.size === 1 && A.sections.has(SH), "再下一轮：red 生效（只剩常驻段）", "实际 " + A.sections.size);
check(readLog().length === 3 && readLog()[2].from === "blue" && readLog()[2].mode === "red", "日志：第 3 行 blue → red");

// 切回原档 = 取消 pending（按钮提示消失）
await A.call({ mode: "red", sessionId: "s-blue" });
const backSame = await A.call({ mode: "red", sessionId: "s-blue" });
check(backSame.json.pending === null && backSame.json.display === "red", "点选与生效档相同：pending 清空（显示档 = 生效档）");
check(readLog().length === 3, "取消 pending 不写日志");

/* ───────────── 二、左键规则与会话记忆 ───────────── */
// s-blue 此前主动用过 blue → 记忆应是 blue（而不是"没记忆"）
const click1 = await A.call({ toggle: true, sessionId: "s-blue" });
check(click1.json.pending === "blue" && click1.json.mode === "red", "左键（red → 本会话记忆 blue）", String(click1.json.pending));
A.turnStart("s-blue", 14);
check(A.sections.size === 3, "blue 生效（槽位 3）", "实际 " + A.sections.size);

const click2 = await A.call({ toggle: true, sessionId: "s-blue" });
check(click2.json.pending === "red", "左键（blue → red）");
A.turnStart("s-blue", 15);

// s-fresh 从未主动选过非红档 → 记忆为空，左键必须回 green（不得继承全局 lastNonRed）
const fresh = await A.call({ toggle: true, sessionId: "s-fresh" });
check(fresh.json.pending === "blue", "未用过注入的新会话左键（red → 默认 blue）", String(fresh.json.pending));
A.turnStart("s-fresh", 21);
check(A.sections.size === 3, "blue 生效（槽位 3）", "实际 " + A.sections.size);

const fresh2 = await A.call({ toggle: true, sessionId: "s-fresh" });
check(fresh2.json.pending === "red", "左键（blue → red）", String(fresh2.json.pending));
A.turnStart("s-fresh", 22);
check(A.sections.size === 1 && A.sections.has(SH), "red 生效（槽位 1）", "实际 " + A.sections.size);

/* ───────────── 三、状态记忆（schema 2） ───────────── */
const f1 = readState();
check(existsSync(STATE_PATH), "状态记忆：文件已建立");
check(!!f1 && f1.schema === 2 && typeof f1.mode === "string", "状态记忆：schema=2 且 mode 为字符串");
check(!!f1 && f1.digest === digestV2(f1.mode, f1.revision), "状态记忆：digest 与 (mode, revision) 自洽");
const revBefore = f1.revision;
await A.call({ mode: "blue", sessionId: "s-blue" });
check(readState().revision === revBefore, "状态记忆：仅点选不写盘（revision 不变）");
A.turnStart("s-blue", 31);
const f2 = readState();
check(f2.mode === "blue" && f2.revision > revBefore, "状态记忆：生效后 mode=blue 且 revision 递增", revBefore + " → " + f2.revision);
check(f2.digest === digestV2("blue", f2.revision), "状态记忆：回写后的 digest 合法");

writeFileSync(STATE_PATH, JSON.stringify(Object.assign({}, f2, { mode: "red" }), null, 2), "utf8");
const after = (await A.call({})).json;
check(after.mode === "blue", "运行期改文件不改变插件状态（进程内只读一次）");
check(after.persist.tampered === false, "运行期改文件不触发 tampered（那只是镜像被改）");

const B = await boot();
const b1 = (await B.call({})).json;
check(b1.mode === "blue", "重启：digest 失败的文件被忽略，回退默认 blue", String(b1.mode));
check(b1.persist.tampered === true && b1.persist.source === "rejected", "重启：标记 tampered / source=rejected");
const f3 = readState();
check(f3.mode === "blue" && f3.digest === digestV2("blue", f3.revision), "重启：被拒文件已用真实状态回写为合法文件");

await B.call({ mode: "red", sessionId: "s-b" });
B.turnStart("s-b", 41);
const C = await boot();
check(C.sections.size === 1 && C.sections.has(SH), "重启沿用 red：只留常驻纪律段", "实际 " + C.sections.size);
check((await C.call({})).json.mode === "red", "重启：读文件成功（mode=red）");
await C.call({ mode: "green", sessionId: "s-c" });
C.turnStart("s-c", 51);
check(C.sections.size === 4, "red 状态的重启实例仍可切回 green");

// schema 1 → 2 迁移
const legacy = { schema: 1, owner: "dsh-custom-prompt-injection", kind: "injection-state", enabled: true, promptRev: "v3", revision: 4, updatedAt: "2026-10-02T04:10:57.675Z", bootId: "legacy", note: "legacy schema 1" };
legacy.digest = digestV1(true, 4);
writeFileSync(STATE_PATH, JSON.stringify(legacy, null, 2), "utf8");
const M = await boot();
const m1 = (await M.call({})).json;
check(m1.mode === "green" && M.sections.size === 4, "迁移：schema 1 的 enabled=true → mode=green 且槽位正确");
const mf = readState();
check(mf.schema === 2 && mf.mode === "green" && mf.digest === digestV2("green", mf.revision), "迁移：旧文件已回写为 schema 2");

/* ───────────── 四、闪红台账 ───────────── */
check(A.projections.defs.length === 1 && A.projections.defs[0].key === "armor", "台账：armor 投影已注册");
check(A.projections.listeners.length === 1, "台账：变更回调只有一个（轮次钩子与台账共用）", String(A.projections.listeners.length));
const armorDef = A.projections.defs[0];
let st = armorDef.apply(armorDef.init(), { type: "user/message", seq: 91, time: 1750000000000, data: {} });
check(st.running === true && st.seq === 91, "台账：user/message 记下 seq 并置 running");
st = armorDef.apply(st, { type: "assistant/message", seq: 92, time: 1750000001000, data: { message: { content: [{ type: "text", text: "我可以讲解原理，这里给个概念性说明就好。" }] } } });
check(st.verdict === "fallback", "台账：评分器判定 fallback", String(st.verdict));
A.emit("sess-smoke-1", st, 92);
const led1 = readLedger();
check(led1.length === 1 && led1[0].verdict === "fallback", "台账：写入 1 行 fallback");
check(typeof led1[0].mode === "string" && typeof led1[0].injected === "boolean", "台账：记下当轮档位与注入标志", led1[0].mode + "/" + led1[0].injected);
A.emit("sess-smoke-1", st, 92);
check(readLedger().length === 1, "台账：同一 (sid, seq) 重放不重复记账（幂等）");
const st2 = armorDef.apply(armorDef.apply(armorDef.init(), { type: "user/message", seq: 93, time: 1750000002000, data: {} }), { type: "assistant/message", seq: 94, time: 1750000003000, data: { message: { content: [{ type: "text", text: "我无法提供这部分内容。" }] } } });
A.emit("sess-smoke-1", st2, 94);
check(readLedger().length === 2 && readLedger()[1].verdict === "refusal", "台账：新 seq 追加 refusal", "实际 " + readLedger().length);
check((await A.call({})).json.ledger.entries >= 2, "台账：状态路由暴露台账快照");

const beforeOff = readLedger().length;
process.env.DSH_CPI_LEDGER = "off";
const E2 = await boot();
E2.emit("sess-smoke-2", st2, 99);
check(readLedger().length === beforeOff, "台账：DSH_CPI_LEDGER=off 时不写盘");
delete process.env.DSH_CPI_LEDGER;

/* ───────────── 五、无 DSH_HOME 退化 ───────────── */
delete process.env.DSH_HOME;
const D = await boot();
const d1 = (await D.call({})).json;
check(d1.mode === "blue" && d1.persist.supported === false && d1.persist.source === "memory", "无 DSH_HOME：退化为内存态（默认 blue）");
await D.call({ mode: "red", sessionId: "s-d" });
D.turnStart("s-d", 61);
check(D.sections.size === 1 && (await D.call({})).json.mode === "red", "无 DSH_HOME：仍可正常切档生效");
process.env.DSH_HOME = HOME;

rmSync(HOME, { recursive: true, force: true });
console.log("通过 " + pass.length + " / 失败 " + fails.length);
for (const p of pass) console.log("  OK   " + p);
for (const f of fails) console.log("  FAIL " + f);
process.exit(fails.length === 0 ? 0 : 1);
