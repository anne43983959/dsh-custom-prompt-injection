// 宿主半冒烟：注入开关（在线路由 + 挂载/摘除）+ 状态记忆（home 状态文件）
// 离线：不碰真实实例；状态文件落在一个一次性临时 home 里。
// 用法：node scripts/smoke-injection-host.mjs
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KERNEL_TEXT = readFileSync(new URL("../prompts/kernel.md", import.meta.url), "utf8");

const fails = [];
const pass = [];
const check = (ok, label, detail) => (ok ? pass : fails).push(label + (ok || !detail ? "" : " — " + detail));

// ── 一次性 home：DSH_HOME 必须在 apply 之前设置 ──────────────────────────────
const HOME = mkdtempSync(join(tmpdir(), "dsh-cpi-host-smoke-"));
process.env.DSH_HOME = HOME;
const STATE_PATH = join(HOME, "dsh-custom-prompt-injection", "state.json");
const readState = () => (existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : null);
// 独立复算 digest（不依赖插件实现），用来核对文件契约
const digestOf = (enabled, revision) =>
  createHash("sha256")
    .update(
      ["dsh-custom-prompt-injection", "injection-state", "v1", "enabled=" + (enabled ? "true" : "false"), "revision=" + revision].join("|"),
    )
    .digest("hex");

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
    effect(fn) {
      const d = fn();
      let done = false;
      return () => { if (done) return; done = true; if (typeof d === "function") d(); };
    },
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

// 每次 import 都换一个查询串 → 拿到全新的模块实例（等价一次进程重启）
let bootSeq = 0;
async function boot() {
  const mod = await import("../index.js?boot=" + (++bootSeq));
  const sections = new Map();
  const routes = new Map();
  // 伪 sessionProjections：捕获 armor 定义与变更回调（台账就挂在这里）
  const projections = {
    defs: [], listeners: [],
    register(def) { this.defs.push(def); return () => {}; },
    onChanged(fn) { this.listeners.push(fn); return () => {}; },
  };
  const ctx = makeCtx(sections, routes, projections);
  mod.apply(ctx);
  const route = routes.get("/api/dsh-custom-prompt-injection/injection");
  const call = (body) =>
    route.fetch(new Request("http://x/api/dsh-custom-prompt-injection/injection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    })).then((res) => res.json().then((json) => ({ status: res.status, json })));
  return { sections, routes, ctx, call, projections };
}

/* ───────────────────────── 一、开关与槽位 ───────────────────────── */
const A = await boot();

check(A.sections.has("custom-prompt-injection:global-system-prompt"), "初始：Order 100 已挂载");
check(A.sections.has("custom-prompt-injection:dual-layer-reinforce"), "初始：Order 200 已挂载");
check(A.sections.size === 2, "初始：槽位数量 = 2", "实际 " + A.sections.size);
check(A.routes.has("/api/dsh-custom-prompt-injection/injection"), "路由已注册（/api 前缀）");
check(A.sections.get("custom-prompt-injection:global-system-prompt").text() === KERNEL_TEXT, "Order 100 载荷文本已注入（与 prompts/kernel.md 逐字一致）");

const q1 = await A.call({});
check(q1.status === 200 && q1.json.enabled === true, "查询：默认启用");
check(q1.json.contract === 1, "契约版本 = 1", String(q1.json.contract));

const off = await A.call({ enabled: false });
check(off.json.enabled === false, "关闭：返回 enabled=false");
check(A.sections.size === 0, "关闭：两段载荷已摘除", "实际 " + A.sections.size);

const again = await A.call({ enabled: false });
check(again.json.enabled === false && A.sections.size === 0, "关闭幂等（重复关闭不报错）");

const on = await A.call({ enabled: true });
check(on.json.enabled === true, "重新启用：返回 enabled=true");
check(A.sections.size === 2, "重新启用：两段载荷重新挂载（无重名冲突）", "实际 " + A.sections.size);
check(A.sections.get("custom-prompt-injection:dual-layer-reinforce").order === 200, "重新挂载后 order 正确");

// 2026-10-01 新增：开关往返不改变 section 文本 → 下一轮前缀逐字节相同 → 缓存不失效
const S1 = "custom-prompt-injection:global-system-prompt";
const S2 = "custom-prompt-injection:dual-layer-reinforce";
const t1a = A.sections.get(S1).text(), t2a = A.sections.get(S2).text(), o1a = A.sections.get(S1).order;
await A.call({ enabled: false });
check(A.sections.size === 0, "往返中途：确实处于空载（中间态存在）", "实际 " + A.sections.size);
await A.call({ enabled: true });
await A.call({ enabled: false });
await A.call({ enabled: true });
const t1b = A.sections.get(S1).text(), t2b = A.sections.get(S2).text();
check(t1a === t1b && t2a === t2b, "开关往返 2 次后：两段文本逐字节相同（下一轮不会失缓）",
  "len " + t1a.length + " vs " + t1b.length);
check(A.sections.get(S1).order === o1a && A.sections.get(S2).order === 200, "往返后 order 不变");

const tog = await A.call({ toggle: true });
check(tog.json.enabled === false && A.sections.size === 0, "toggle：切换到关闭");

const snap = (await A.call({})).json;
check(snap.sections.length === 2 && snap.sections[0].order === 100, "状态快照含两个槽位");

/* ───────────────────────── 二、状态记忆（home 状态文件） ───────────────────────── */
const f1 = readState();
check(existsSync(STATE_PATH), "状态记忆：首次启动即建立 " + STATE_PATH.replace(HOME, "<HOME>"));
check(!!f1 && f1.owner === "dsh-custom-prompt-injection" && f1.kind === "injection-state", "状态记忆：文件带 owner / kind");
check(!!f1 && f1.schema === 1 && typeof f1.enabled === "boolean", "状态记忆：schema=1 且 enabled 为布尔");
check(!!f1 && typeof f1.digest === "string" && f1.digest === digestOf(f1.enabled, f1.revision), "状态记忆：digest 与 (enabled, revision) 自洽");
check(!!f1 && typeof f1.note === "string" && f1.note.indexOf("单向写出") >= 0, "状态记忆：文件自带「只写不读」说明");
// phase 1 末态（toggle）为「暂停」：这里做一次关→开，验证写回
const revBefore = f1.revision;
await A.call({ enabled: true });
const f2 = readState();
check(f2.enabled === true, "状态记忆：切换后文件同步为 enabled=true");
check(f2.revision > revBefore, "状态记忆：每次变更 revision 递增", revBefore + " → " + f2.revision);
check(f2.digest === digestOf(true, f2.revision), "状态记忆：回写后的 digest 合法");
const f2rev = f2.revision;
await A.call({ enabled: true });
check(readState().revision === f2rev, "状态记忆：同态重复切换不写盘（revision 不变）");

// 运行期手改文件（enabled 改成 false，digest 不改）→ 插件状态不得变化
writeFileSync(STATE_PATH, JSON.stringify(Object.assign({}, f2, { enabled: false }), null, 2), "utf8");
const after = (await A.call({})).json;
check(after.enabled === true, "状态记忆：运行期改文件不改变插件状态（进程内只读一次）");
check(after.persist.readOnce === true && after.persist.revision === f2rev, "状态记忆：状态快照自证 readOnce 与 revision");
check(after.persist.tampered === false, "状态记忆：运行期改文件不触发 tampered（那只是镜像被改）");

// 重启（新模块实例）：被外部改写的文件必须被忽略 + 回写
const B = await boot();
const b1 = (await B.call({})).json;
check(b1.enabled === true, "状态记忆：digest 失败的文件被忽略，回退默认（启用）");
check(b1.persist.tampered === true && b1.persist.source === "rejected", "状态记忆：标记 tampered / source=rejected");
const f3 = readState();
check(f3.enabled === true && f3.digest === digestOf(true, f3.revision), "状态记忆：被拒文件已用真实状态回写为合法文件");
check(!!f3.lastRejected && typeof f3.lastRejected.reason === "string", "状态记忆：回写文件内保留 lastRejected 证据", f3.lastRejected && f3.lastRejected.reason);

// 正常关闭 → 重启必须沿用文件里的状态（跨重启记忆）
await B.call({ enabled: false });
const C = await boot();
check(C.sections.size === 0, "状态记忆：重启后沿用文件里的「暂停」——不挂载任何槽位", "实际 " + C.sections.size);
const c1 = (await C.call({})).json;
check(c1.enabled === false && c1.persist.source === "file" && c1.persist.tampered === false, "状态记忆：重启读文件成功（source=file，非 default）");
await C.call({ enabled: true });
check(C.sections.size === 2, "状态记忆：暂停状态的重启实例仍可被按钮重新启用");

/* ───────────────────────── 三、闪红台账（只追加、可溯源） ───────────────────────── */
const LEDGER_PATH = join(HOME, "dsh-custom-prompt-injection", "ledger.jsonl");
const readLedger = () => (existsSync(LEDGER_PATH)
  ? readFileSync(LEDGER_PATH, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : []);

check(A.projections.defs.length === 1 && A.projections.defs[0].key === "armor", "台账：armor 投影已注册");
check(A.projections.defs[0].stateVersion === 4, "台账：投影 stateVersion = 4", String(A.projections.defs[0] && A.projections.defs[0].stateVersion));
check(A.projections.listeners.length === 1, "台账：变更回调已订阅", String(A.projections.listeners.length));

const armorDef = A.projections.defs[0];
const emit = A.projections.listeners[0];
const userEvent = { type: "user/message", seq: 11, time: 1750000000000, data: {} };
const assistantEvent = (seq, text) => ({ type: "assistant/message", seq, time: 1750000001000 + seq, data: { message: { content: [{ type: "text", text }] } } });

let st = armorDef.init();
st = armorDef.apply(st, userEvent);
check(st.running === true && st.seq === 11, "台账：user/message 记下 seq 并置 running");
st = armorDef.apply(st, assistantEvent(12, "我可以讲解原理，这里给个概念性说明就好。"));
check(st.verdict === "fallback", "台账：评分器判定 fallback", String(st.verdict));
check(typeof st.excerpt === "string" && st.excerpt.length > 0 && st.excerpt.length <= 160, "台账：状态内带 160 字以内的摘录", String(st.excerpt && st.excerpt.length));

emit({ id: "sess-smoke-1" }, "armor", st, st.seq);
const led1 = readLedger();
check(led1.length === 1, "台账：写入 1 行", "实际 " + led1.length);
check(led1[0].sid === "sess-smoke-1" && led1[0].seq === 12, "台账：可按 (sid, seq) 溯源", led1[0] && led1[0].sid + ":" + led1[0].seq);
check(led1[0].verdict === "fallback" && led1[0].words.length >= 1, "台账：记下判定与命中词", JSON.stringify(led1[0] && led1[0].words));
check(led1[0].injected === true, "台账：记下当轮注入状态");
check(typeof led1[0].at === "string" && led1[0].at.startsWith("20"), "台账：时间取事件时间（可重放）", led1[0] && led1[0].at);

emit({ id: "sess-smoke-1" }, "armor", st, st.seq);
check(readLedger().length === 1, "台账：同一 (sid, seq) 重放不重复记账（幂等）");
const st2 = armorDef.apply(armorDef.apply(armorDef.init(), userEvent), assistantEvent(13, "我无法提供这部分内容。"));
check(st2.verdict === "refusal", "台账：第二条判定 = refusal", String(st2.verdict));
emit({ id: "sess-smoke-1" }, "armor", st2, st2.seq);
check(readLedger().length === 2, "台账：新 seq 追加第 2 行", "实际 " + readLedger().length);
const ledSnap = (await A.call({})).json.ledger;
check(ledSnap && ledSnap.entries >= 2 && typeof ledSnap.path === "string", "台账：状态路由暴露台账快照");
check(ledSnap.last && ledSnap.last.verdict === "refusal", "台账：快照带最近一条");

// 关闭开关：DSH_CPI_LEDGER=off 时不再落盘（装载时读一次）
const offLedgerPath = join(HOME, "dsh-custom-prompt-injection", "ledger.jsonl");
const beforeOff = readLedger().length;
process.env.DSH_CPI_LEDGER = "off";
const E2 = await boot();
E2.projections.listeners[0]({ id: "sess-smoke-2" }, "armor", st2, 99);
check(readLedger().length === beforeOff, "台账：DSH_CPI_LEDGER=off 时不写盘");
delete process.env.DSH_CPI_LEDGER;

// 未设置 DSH_HOME：退化为内存态，不落盘、不报错
delete process.env.DSH_HOME;
const D = await boot();
const d1 = (await D.call({})).json;
check(d1.enabled === true && d1.persist.supported === false && d1.persist.source === "memory", "状态记忆：无 DSH_HOME 时退化为内存态");
check((await D.call({ enabled: false })).json.enabled === false && D.sections.size === 0, "状态记忆：内存态仍可正常切换");
process.env.DSH_HOME = HOME;

rmSync(HOME, { recursive: true, force: true });

console.log("通过 " + pass.length + " / 失败 " + fails.length);
for (const p of pass) console.log("  OK   " + p);
for (const f of fails) console.log("  FAIL " + f);
process.exit(fails.length === 0 ? 0 : 1);
