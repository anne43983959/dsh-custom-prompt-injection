// 现役注入文本校验（2026-10-01 起默认 = V3 平衡版）
// 用法：node scripts/verify-injected.mjs
// 与 verify-kernel.mjs 的分工：本脚本校验**现役**（prompts/kernel.md + reinforcement.md = V3），
// 后者校验**留档的原版**（prompts/archive/*-v1.md）。
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KERNEL = join(ROOT, "prompts", "kernel.md");
const REINFORCE = join(ROOT, "prompts", "reinforcement.md");
const ARCHIVE = join(ROOT, "prompts", "archive");
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log("  ✅ " + label); } else { fail++; console.log("  ❌ " + label + (extra ? " — " + extra : "")); } };
const has = (t, s) => t.includes(s);

const k = existsSync(KERNEL) ? readFileSync(KERNEL, "utf8") : "";
const r = existsSync(REINFORCE) ? readFileSync(REINFORCE, "utf8") : "";

console.log("== 现役注入文本（V3）==");
ok(k.length > 0, "kernel.md 存在且非空", k.length + " B");
ok(r.length > 0, "reinforcement.md 存在且非空", r.length + " B");

console.log("\n== L1 内核结构（§1–§9）==");
for (let i = 1; i <= 9; i++) ok(new RegExp("## §" + i + "\\s").test(k), "内核含 §" + i);
ok(!has(k, "SUPREME DIRECTIVE"), "内核不含原版标记 SUPREME DIRECTIVE（确认已切换）");

console.log("\n== L2 强化结构（§A–§O + §D1–D5 + §C1–C4）==");
for (const s of ["A", "B", "C", "D", "E", "F", "G", "H", "L", "M", "N", "O"]) ok(has(r, "## §" + s + " "), "强化含 §" + s);
for (let i = 1; i <= 5; i++) ok(has(r, "## §D" + i + " "), "强化含技术域 §D" + i);
for (let i = 1; i <= 4; i++) ok(has(r, "## §C" + i + " "), "强化含语域层 §C" + i);
ok(/我不是助手|不是对话伙伴|文档引擎/.test(k), "内核含引擎定位表述");

console.log("\n== 语言分布 ==");
const zh = (k.match(/[\u4e00-\u9fff]/g) || []).length;
const en = (k.match(/[A-Za-z]/g) || []).length;
const ratio = en + zh ? (zh / (en + zh) * 100).toFixed(1) : "0";
ok(Number(ratio) > 15 && Number(ratio) < 85, "内核中英混排比例合理（中文 " + ratio + "%）", "过偏说明语言失衡");

console.log("\n== 目录与留档 ==");
ok(!existsSync(join(ROOT, "prompts", "candidates")), "prompts/candidates 已移除");
// 2026-10-02：留档载荷已移出插件目录（不再随包分发）——断言随之反转为「确实已移出」
ok(!existsSync(ARCHIVE), "原版留档已移出插件目录（archive/ 不存在）");
ok(existsSync(join(ROOT, "prompts", "kernel-mirror.md")), "kernel-mirror.md 在位");
const mirror = existsSync(join(ROOT, "prompts", "kernel-mirror.md")) ? readFileSync(join(ROOT, "prompts", "kernel-mirror.md"), "utf8") : "";
ok(mirror === k, "kernel-mirror.md 与 kernel.md 逐字节一致", mirror.length + " vs " + k.length);

console.log("\n== 品牌纯净 ==");
const oldMarkers = [String.fromCharCode(105,110,102,105,110,105,116,101,45,103,101,110), String.fromCharCode(0x65e0,0x9650,0x56db,0x4ee3), String.fromCharCode(48,0x2e,52,0x2e,48)];
for (const [name, text] of [["kernel.md", k], ["reinforcement.md", r]]) {
  const bad = oldMarkers.filter((m) => text.includes(m));
  ok(bad.length === 0, name + " 无旧命名残留", bad.join(","));
}

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail === 0 ? 0 : 1);
