// 载荷热重载离线回归（2026-10-11）：改 prompts/*.md → 下一轮开始生效，无需重启实例。
// 做法：index.js 无本地依赖 ⇒ 把 index.js + prompts/ 复制到临时目录，在**副本**上改文件，
//       真实载荷目录一个字节都不动。
// 用法：node scripts/smoke-payload-hotreload.mjs
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const WORK = mkdtempSync(join(tmpdir(), "dsh-cpi-hotreload-"));
const PKG = join(WORK, "pkg");
mkdirSync(PKG, { recursive: true });
cpSync(join(REPO, "index.js"), join(PKG, "index.js"));
cpSync(join(REPO, "prompts"), join(PKG, "prompts"), { recursive: true });
const HOME = join(WORK, "home");
mkdirSync(HOME, { recursive: true });
process.env.DSH_HOME = HOME;

const fails = [];
const pass = [];
const check = (ok, label, detail) => (ok ? pass : fails).push(label + (ok || !detail ? "" : " — " + detail));
const reloadLogs = [];
const origLog = console.log;
console.log = (...a) => { const s = a.map(String).join(" "); if (s.includes("载荷热重载")) reloadLogs.push(s); };

const LEDGER = join(HOME, "dsh-custom-prompt-injection", "ledger.jsonl");
const readLedger = () => (existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const sha12 = (t) => createHash("sha256").update(t, "utf8").digest("hex").slice(0, 12);

function makeCtx(sections, projections) {
  const ctx = {
    effect(fn) { const d = fn(); let done = false; return () => { if (done) return; done = true; if (typeof d === "function") d(); }; },
    systemPrompt: {
      section({ name, order, text }) {
        if (sections.has(name)) throw new Error("section already registered: " + name);
        sections.set(name, { order, text });
        return () => { sections.delete(name); };
      },
    },
    tools: { register() {} },
    get(name) { return name === "sessionProjections" ? projections : undefined; },
    inject(deps, cb) { cb({ effect: ctx.effect, connection: { fetch: { register(def) { if (!String(def.path).startsWith("/api/")) throw new Error("route must start with /api/"); return () => {}; } } }, get: ctx.get }); },
  };
  return ctx;
}

let bootSeq = 0;
async function boot() {
  const mod = await import(pathToFileURL(join(PKG, "index.js")).href + "?boot=" + (++bootSeq));
  const sections = new Map();
  const projections = { defs: [], listeners: [], register(d) { this.defs.push(d); return () => {}; }, onChanged(fn) { this.listeners.push(fn); return () => {}; } };
  const ctx = makeCtx(sections, projections);
  mod.apply(ctx);
  const emit = (sid, state, seq) => projections.listeners[0]({ id: sid }, "armor", state, seq);
  const base = () => ({ running: false, verdict: null, words: [], safe: [], seq: null, at: Date.now(), textLen: 0, excerpt: "" });
  return {
    sections,
    turnStart: (sid, seq) => emit(sid, Object.assign(base(), { running: true, seq: seq }), seq),
    turnEnd: (sid, seq) => emit(sid, Object.assign(base(), { running: false, seq: seq, verdict: "pass", textLen: 12, excerpt: "smoke" }), seq),
  };
}

const S1 = "custom-prompt-injection:global-system-prompt";
const S2 = "custom-prompt-injection:dual-layer-reinforce";
const F = (n) => join(PKG, "prompts", n);

const A = await boot();
const en0 = readFileSync(F("kernel-en.md"), "utf8");
check(A.sections.get(S1).text() === en0, "初始（blue）：L1 = kernel-en.md 逐字一致");

A.turnEnd("s", 0);
const row0 = readLedger()[0];
check(!!row0 && typeof row0.promptMountedSha === "string", "台账已带 promptMountedSha", JSON.stringify(row0 && row0.promptMountedSha));

A.turnStart("s", 1);
check(reloadLogs.length === 0, "未改文件：轮次开始不产生重载（mtime/size 未变 ⇒ 零读取）", JSON.stringify(reloadLogs));

const MARK = "\n<!-- hotreload-marker-20261011 -->\n";
appendFileSync(F("kernel-en.md"), MARK);
A.turnStart("s", 2);
check(A.sections.get(S1).text() === en0 + MARK, "改了 kernel-en.md：下一轮 L1 即为新内容（无需重启）");
check(reloadLogs.length === 1 && reloadLogs[0].includes("kernel-en"), "并记一条重载日志", JSON.stringify(reloadLogs));

const before = reloadLogs.length;
writeFileSync(F("kernel-en.md"), en0 + MARK);
A.turnStart("s", 3);
check(reloadLogs.length === before, "同内容重写（mtime 变、内容逐字相同）：不产生变更事件", JSON.stringify(reloadLogs.slice(before)));

const re0 = A.sections.get(S2).text();
writeFileSync(F("reinforcement-en.md"), "x");
A.turnStart("s", 4);
check(A.sections.get(S2).text() === re0, "被截断的 reinforcement-en.md：拒绝采纳，仍用上一份好副本");
check(reloadLogs[reloadLogs.length - 1].includes("拒绝"), "并记明拒绝原因", reloadLogs[reloadLogs.length - 1]);

A.turnEnd("s", 4);
const led = readLedger();
const row1 = led[led.length - 1];
const zhSha = sha12(readFileSync(F("kernel-zh.md"), "utf8") + "\u0000" + readFileSync(F("reinforcement-zh.md"), "utf8"));
check(row1.promptRevSha === zhSha && row1.promptRevSha === row0.promptRevSha, "promptRevSha 仍是中文对口径（不动它 ⇒ 历史可比）");
check(row1.promptMountedSha !== row0.promptMountedSha, "只改英文载荷：promptMountedSha 变了（旧口径根本看不出来）", row0.promptMountedSha + " -> " + row1.promptMountedSha);

console.log = origLog;
console.log("—— 载荷热重载回归 ——");
for (const p of pass) console.log("  OK   " + p);
for (const f of fails) console.log("  FAIL " + f);
console.log("通过 " + pass.length + " / " + (pass.length + fails.length) + "，临时目录 " + WORK);
process.exit(fails.length ? 1 : 0);
