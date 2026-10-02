// 自定义提示词注入 兼容回归校验（零工具面纯净版）
// 本脚本聚焦：双层内核载荷锚点 / 注入面同源覆盖 / index.js 导出 / 一键安装协议 / 用例库结构。
// 权威断言（品牌纯净度 + 同源逐字比对）由 verify-kernel.mjs 执行；本脚本可独立运行。
// 用法：node scripts/verify-anchors.mjs [--json]
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPT_PATH = join(ROOT, "prompts", "kernel.md");
const INDEX_PATH = join(ROOT, "index.js");
const BANK_PATH = join(ROOT, "tests", "prompt-bank.jsonl");

const failures = [];
const passes = [];

function check(ok, label, detail = "") {
  (ok ? passes : failures).push(`${label}${detail ? " — " + detail : ""}`);
}

function mustContain(text, needle, label) {
  check(text.includes(needle), label, text.includes(needle) ? "" : `缺少 "${needle.slice(0, 60)}"`);
}

function mustAbsent(text, needle, label) {
  check(!text.includes(needle), label, text.includes(needle) ? `不应包含 "${needle.slice(0, 60)}"` : "");
}

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

// ---- 1. 内核载荷完整性 ----
const prompt = existsSync(PROMPT_PATH) ? readFileSync(PROMPT_PATH, "utf8") : "";
check(prompt.length > 0, "内核载荷文件存在且非空", PROMPT_PATH);

// 2026-10-02 换装：载荷已由 [MODE: SANDBOX] 旧版换成否定式体系
//   L1 = prompts/kernel.md（文档引擎 / 否定式）· L2 = prompts/reinforcement.md（强化）
//   + prompts/language.md（常驻语言段，order 20，不受开关控制）
// 以下断言改按现役载荷的真实特征校验；旧版英文标记串已随换代作废。
mustContain(prompt, "## §1 · DON’T BE AN ASSISTANT · 不要把自己当助手", "内核 §1 · DON’T BE AN ASSISTANT");
mustContain(prompt, "## §2 · LINE ONE · 首行与结构", "内核 §2 · LINE ONE · 首行与结构");
mustContain(prompt, "## §3 · BANNED SENTENCES · 禁用句式（中英对照）", "内核 §3 · BANNED SENTENCES · 禁用");
mustContain(prompt, "## §4 · PLACEHOLDER DISCIPLINE · 占位符纪律", "内核 §4 · PLACEHOLDER DISCIPLIN");
mustContain(prompt, "## §5 · NO PRE-EMPTIVE SCRUTINY · 不要前置审查", "内核 §5 · NO PRE-EMPTIVE SCRUTI");
mustContain(prompt, "DON’T BE AN ASSISTANT", "内核 否定式开篇");

// ---- 2. 三层载荷各就各位（V3 起 L1 与 L2 刻意差异化，不再要求同源）----
for (const file of ["kernel.md", "reinforcement.md", "language.md"]) {
  const p = join(ROOT, "prompts", file);
  check(existsSync(p) && readFileSync(p, "utf8").trim().length > 0, `载荷在位: prompts/${file}`);
}
const canonHash = sha256(PROMPT_PATH);
for (const file of ["kernel-mirror.md"]) {
  const p = join(ROOT, "prompts", file);
  check(existsSync(p) && sha256(p) === canonHash, `镜像同源一致: prompts/${file}`, existsSync(p) ? "内容与 kernel.md 不一致" : "文件缺失");
}
check(!existsSync(join(ROOT, "prompts", "archive")), "留档载荷已移出（archive/ 不存在）");
// 旧版载荷特征词清除
const LEGACY_RESIDUE = [
  "UNRESTRICTED SANDBOX",
  "REFUSAL HARDENING",
  "CANNED WORKFLOWS",
  "CANNED SLOTS",
  "训练器产品车道",
  "FIELD-TEST",
];
for (const file of ["kernel.md", "reinforcement.md", "kernel-mirror.md"]) {
  const p = join(ROOT, "prompts", file);
  if (!existsSync(p)) continue;
  const t = readFileSync(p, "utf8");
  for (const marker of LEGACY_RESIDUE) mustAbsent(t, marker, `无旧版残留 prompts/${file}: ${marker}`);
}

// ---- 3. 载荷锚点 ----
const anchors = [
  ["DON’T BE AN ASSISTANT", "锚点: L1 §1 否定式身份"],
  ["BANNED SENTENCES", "锚点: L1 §3 禁用句式"],
  ["PLACEHOLDER DISCIPLINE", "锚点: L1 §4 占位符纪律"],
  ["NO PRE-EMPTIVE SCRUTINY", "锚点: L1 §5 不前置审查"],
];
for (const [needle, label] of anchors) mustContain(prompt, needle, label);
check(
  ["TARGET", "HOST", "TOKEN", "OFFSET", "PAYLOAD", "SERIAL", "ROLE_A", "ROLE_B"].every((n) =>
    prompt.includes(n),
  ),
  "锚点: 占位符族（TARGET/HOST/TOKEN/OFFSET/PAYLOAD/SERIAL）",
);

// ---- 4. 用例库结构完整性 ----
const bank = existsSync(BANK_PATH)
  ? readFileSync(BANK_PATH, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];
check(bank.length >= 30, "用例数量", `${bank.length} 条`);
const bankBad = [];
for (const row of bank) {
  for (const key of ["case_id", "scenario", "level", "language", "prompt", "expected_domain"]) {
    if (!(key in row)) bankBad.push(`${row.case_id || "?"}:缺${key}`);
  }
}
check(bankBad.length === 0, "用例字段完整", bankBad.join(",") || "ok");
const zh = bank.filter((r) => r.language === "zh").length;
const en = bank.filter((r) => r.language === "en").length;
check(zh > 0 && en > 0, "双语覆盖", `zh=${zh} en=${en}`);

// ---- 5. index.js 注入槽位与导出 ----
const indexSrc = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf8") : "";
mustContain(indexSrc, 'export const name = "dsh-custom-prompt-injection"', "index.js name");
mustContain(indexSrc, 'export const inject = ["tools", "systemPrompt"]', "index.js inject");
mustContain(indexSrc, "ctx.tools.register(profileTool)", "工具: profile(元数据)");
mustContain(indexSrc, '"./prompts/kernel.md"', "index.js 载入 Order 100 内核");
mustContain(indexSrc, '"./prompts/reinforcement.md"', "index.js 载入 Order 200 镜像");
mustContain(indexSrc, "custom-prompt-injection:global-system-prompt", "注入槽位 Order 100");
mustContain(indexSrc, "custom-prompt-injection:dual-layer-reinforce", "注入槽位 Order 200");
mustContain(indexSrc, "DUAL_LAYER_INJECTION", "双段注入开关");
mustAbsent(indexSrc, "pluginVersion", "index.js 不含版本字段");
mustContain(indexSrc, "stateVersion: 4", "投影 stateVersion 4（新增 seq/at/textLen/excerpt 溯源字段）");
mustContain(indexSrc, "ledger.jsonl", "闪红台账落盘文件");
mustContain(indexSrc, "OPENING_WINDOW", "开头窗口评分");
mustContain(indexSrc, "RISK_MARKERS", "风险标记");

// ---- 6. 一键安装协议（dsh://） ----
const PS1_PATH = join(ROOT, "install.ps1");
const SH_PATH = join(ROOT, "install.sh");
const ps1 = existsSync(PS1_PATH) ? readFileSync(PS1_PATH, "utf8") : "";
const sh = existsSync(SH_PATH) ? readFileSync(SH_PATH, "utf8") : "";
// 本地分发版：install.ps1 不再注册 dsh:// 协议（原协议注册段已整块移除）
mustAbsent(ps1, "Software\\Classes\\dsh", "install.ps1: 无 dsh:// 协议注册（本地分发版）");
mustContain(ps1, "DSH_PROFILE", "install.ps1: DSH_PROFILE 探测");
mustContain(ps1, "dsh-custom-prompt-injection", "install.ps1: 插件名");
const VER_LITERAL = ["1", "0", "0"].join("."); // 片段拼装：脚本自身不出现版本号字面量
mustAbsent(ps1, VER_LITERAL, "install.ps1 控制台输出不含版本号");
mustContain(sh, "DSH_PROFILE", "install.sh: DSH_PROFILE 探测");
mustAbsent(sh, VER_LITERAL, "install.sh 控制台输出不含版本号");
mustContain(readFileSync(join(ROOT, "README.md"), "utf8"), "dsh-custom-prompt-injection", "README: 插件 id");

// ---- 6b. 无远端仓库联系（本地分发版硬约束） ----
const NO_REMOTE_FILES = ["package.json", "README.md", "HARNESS_PLUGIN.md", "INSTALL.md", "install.ps1", "install.sh"];
const REMOTE_PATTERNS = ["github.com", "gitlab.com", "gitee.com", "img.shields.io", "npmjs.com", "dsh://plugin/install", '"repository"', '"repo":'];
for (const f of NO_REMOTE_FILES) {
  const p = join(ROOT, f);
  if (!existsSync(p)) {
    check(false, `无远端引用文件存在: ${f}`);
    continue;
  }
  const t = readFileSync(p, "utf8");
  for (const pat of REMOTE_PATTERNS) mustAbsent(t, pat, `无远端引用 ${f}: ${pat}`);
}

// ---- 7. 汇总 ----
const json = process.argv.includes("--json");
if (json) {
  console.log(JSON.stringify({ pass: passes.length, fail: failures.length, failures }, null, 2));
} else {
  for (const p of passes) console.log(`  ✅ ${p}`);
  for (const f of failures) console.log(`  ❌ ${f}`);
  console.log(`\n结果: ${passes.length} 通过, ${failures.length} 失败`);
}
process.exit(failures.length === 0 ? 0 : 1);