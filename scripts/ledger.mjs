#!/usr/bin/env node
// 闪红台账读取器（离线，只读）：汇总、过滤、按 (sid, seq) 溯源到会话日志。
// 用法：
//   node scripts/ledger.mjs                      # 汇总
//   node scripts/ledger.mjs --verdict refusal    # 只看某类判定
//   node scripts/ledger.mjs --session <id>       # 只看某会话
//   node scripts/ledger.mjs --limit 20           # 最近 N 条
//   node scripts/ledger.mjs --id <sid>:<seq>     # 单条 + 溯源信息
//   node scripts/ledger.mjs --json               # 机器可读
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.DSH_HOME;
if (!HOME) {
  console.error("DSH_HOME 未设置：台账位于 $DSH_HOME/dsh-custom-prompt-injection/ledger.jsonl");
  process.exit(2);
}
const DIR = join(HOME, "dsh-custom-prompt-injection");
const LEDGER = join(DIR, "ledger.jsonl");

function files() {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((n) => n === "ledger.jsonl" || /^ledger-.*\.jsonl$/.test(n))
    .sort()
    .map((n) => join(DIR, n));
}

function load() {
  const out = [];
  for (const f of files()) {
    const text = readFileSync(f, "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try { out.push(JSON.parse(t)); } catch { /* 半行/损坏行跳过 */ }
    }
  }
  return out;
}

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const limit = Number(arg("--limit") || 0);
const wantVerdict = arg("--verdict");
const wantSession = arg("--session");
const wantId = arg("--id");

const all = load();
let rows = all;
if (wantVerdict) rows = rows.filter((r) => r.verdict === wantVerdict);
if (wantSession) rows = rows.filter((r) => r.sid === wantSession);
if (wantId) {
  const [sid, seq] = wantId.split(":");
  rows = rows.filter((r) => r.sid === sid && String(r.seq) === String(seq));
}
if (limit > 0) rows = rows.slice(-limit);

// 溯源：会话日志在 $DSH_HOME/sessions/<workspace>/<sessionId>/session.v3.jsonl.zstd
function locate(sid) {
  const root = join(HOME, "sessions");
  if (!existsSync(root)) return null;
  for (const ws of readdirSync(root)) {
    const p = join(root, ws, sid);
    if (existsSync(p)) {
      const f = readdirSync(p).find((n) => /^session\.v\d+\.jsonl\.zstd$/.test(n));
      if (f) {
        const full = join(p, f);
        return { dir: p, file: full, bytes: statSync(full).size };
      }
    }
  }
  return null;
}

if (argv.includes("--json")) {
  console.log(JSON.stringify({ ledger: LEDGER, total: all.length, rows }, null, 2));
  process.exit(0);
}

if (all.length === 0) {
  console.log("台账为空（或尚未生成）：" + LEDGER);
  process.exit(0);
}

if (wantId && rows.length) {
  const r = rows[0];
  const loc = locate(r.sid);
  console.log("【台账条目】" + r.at + "  sid=" + r.sid + "  seq=" + r.seq);
  console.log("  判定      : " + r.verdict);
  console.log("  命中词    : " + JSON.stringify(r.words || []));
  console.log("  域/风险词 : " + (r.domain || "-") + " / " + JSON.stringify(r.risk || []));
  console.log("  当轮注入  : " + (r.injected ? "开" : "关") + "（双层=" + r.dualLayer + "）");
  console.log("  正文长度  : " + r.textLen + " 字符（摘录 " + (r.excerpt || "").length + "）");
  console.log("  摘录      : " + (r.excerpt || ""));
  console.log("  会话日志  : " + (loc ? loc.file + "（" + loc.bytes + " B）" : "未找到（会话可能已归档）"));
  console.log("  定位方式  : 用 seq=" + r.seq + " 在该会话日志中检索事件（日志为 zstd 多帧 JSONL）");
  process.exit(0);
}

const byVerdict = {};
const bySession = {};
for (const r of all) {
  byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
  bySession[r.sid] = (bySession[r.sid] || 0) + 1;
}
console.log("台账：" + LEDGER);
console.log("总分片：" + files().length + "  总条数：" + all.length);
console.log("判定分布：" + Object.entries(byVerdict).map(([k, v]) => k + "=" + v).join("  "));
console.log("按会话：" + Object.entries(bySession).map(([k, v]) => k.slice(0, 12) + "…=" + v).join("  "));
console.log("时间范围：" + (all[0].at || "?") + " → " + (all[all.length - 1].at || "?"));
console.log("");
console.log("最近 " + rows.length + " 条：");
for (const r of rows.slice(-40)) {
  const w = (r.words && r.words[0]) || "";
  console.log("  " + String(r.at).slice(0, 19) + "  " + String(r.verdict).padEnd(8) + " inj=" + (r.injected ? "on " : "off") +
    "  " + String(r.sid).slice(0, 8) + ":" + String(r.seq).padStart(5) + "  " + (r.domain || "-").padEnd(9) + "  " + w);
}
console.log("");
console.log("溯源：node scripts/ledger.mjs --id <sid>:<seq>");
