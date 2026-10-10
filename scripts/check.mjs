#!/usr/bin/env node
// dsh-custom-prompt-injection · 离线自检
//
//   node scripts/check.mjs
//
// 只读检查：文件是否齐、清单是否自洽、载荷锚点是否在位、源码有没有不该有的东西。
// 不联网、不写盘、不需要密钥。全部通过时退出码为 0。

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
let pass = 0;
const fails = [];

function check(cond, label, detail) {
  if (cond) { pass++; return true; }
  fails.push(label + (detail ? "  [" + detail + "]" : ""));
  return false;
}
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const has = (rel) => existsSync(join(ROOT, rel));

// ---------- 1. 文件齐备 ----------
const REQUIRED = [
  "index.js", "client.js", "cordis.patch.yml", "package.json", "README.md", "LICENSE",
  "install.mjs", "uninstall.mjs", "install.ps1", "install.sh", "install.bat",
  "uninstall.ps1", "uninstall.sh", "scripts/check.mjs", "scripts/ledger.mjs", "scripts/score-session.mjs",
  "prompts/kernel-zh.md", "prompts/kernel-en.md",
  "prompts/reinforcement-zh.md", "prompts/reinforcement-en.md",
  "prompts/language-zh.md", "prompts/ptc-hygiene.md",
];
for (const rel of REQUIRED) check(has(rel), "缺少文件：" + rel);

// ---------- 2. 清单自洽 ----------
let pkg = null;
try { pkg = JSON.parse(read("package.json")); } catch (e) { check(false, "package.json 不是合法 JSON", e.message); }
if (pkg) {
  check(pkg.name === "dsh-custom-prompt-injection", "包名应为 dsh-custom-prompt-injection", String(pkg.name));
  check(typeof pkg.version === "string" && /^\d+\.\d+\.\d+/.test(pkg.version), "版本号格式不对", String(pkg.version));
  check(!!(pkg.dsh && pkg.dsh.compatibility && pkg.dsh.compatibility.runtime), "缺少 dsh.compatibility.runtime");
  check(!!(pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === "web"), "客户端半应声明 platform=web");
  check(Array.isArray(pkg.files) && pkg.files.includes("prompts"), "package.json 的 files 应包含 prompts");
  check(Array.isArray(pkg.files) && pkg.files.includes("install.mjs"), "package.json 的 files 应包含 install.mjs");
}

// ---------- 3. 载荷锚点 ----------
const kernelZh = has("prompts/kernel-zh.md") ? read("prompts/kernel-zh.md") : "";
const kernelEn = has("prompts/kernel-en.md") ? read("prompts/kernel-en.md") : "";
const reinfZh = has("prompts/reinforcement-zh.md") ? read("prompts/reinforcement-zh.md") : "";
const reinfEn = has("prompts/reinforcement-en.md") ? read("prompts/reinforcement-en.md") : "";
const P = [["prompts/kernel-zh.md", kernelZh], ["prompts/kernel-en.md", kernelEn],
           ["prompts/reinforcement-zh.md", reinfZh], ["prompts/reinforcement-en.md", reinfEn]];
for (const [name, text] of P) {
  check(text.length > 500, name + " 内容过短，可能被截断", text.length + " 字符");
  check(text.trim().length > 0 && text.endsWith("\n"), name + " 结尾缺少换行");
}
check(kernelZh.includes("## §1") && kernelZh.includes("## §3"), "kernel-zh.md 缺少 §1 / §3 锚点");
check(kernelEn.includes("## §1") && kernelEn.includes("## §3"), "kernel-en.md 缺少 §1 / §3 锚点");
check(kernelZh.includes("## §9") && kernelEn.includes("## §9"), "kernel-*.md 缺少 §9 锚点");
for (const [name, text] of [["reinforcement-zh.md", reinfZh], ["reinforcement-en.md", reinfEn]]) {
  for (const sec of ["§A", "§B", "§C", "§O", "§C1", "§C2", "§C3", "§C4"]) {
    check(text.includes("## " + sec + " "), name + " 缺少 " + sec + " 锚点");
  }
  check(!/^## §D\d /m.test(text), name + " 仍残留 §D1–§D5 技术域模块");
}
for (const [name, text] of P) check(!/^## §D\d /m.test(text), name + " 仍残留 §D 技术域模块");

// ---------- 4. 源码不该有的东西 ----------
const indexSrc = has("index.js") ? read("index.js") : "";
const clientSrc = has("client.js") ? read("client.js") : "";
const FORBIDDEN = [
  ["child_process", "子进程调用"],
  ["require(\"http\")", "http 请求"],
  ["require(\"https\")", "https 请求"],
  ["from \"node:http\"", "http 模块"],
  ["from \"node:https\"", "https 模块"],
  ["from \"node:net\"", "net 模块"],
  ["from \"node:dns\"", "dns 模块"],
  ["from \"node:child_process\"", "child_process 模块"],
  ["lib/domain-markers", "已移除的域词表模块"],
  ["kernel-mirror", "已移除的镜像载荷"],
  ["prompts/archive", "已移除的留档载荷"],
];
for (const [needle, why] of FORBIDDEN) check(!indexSrc.includes(needle), "index.js 含" + why, needle);
check(indexSrc.includes("./prompts/"), "index.js 应从 ./prompts/ 读取载荷");
check(indexSrc.includes("systemPrompt"), "index.js 应注册 systemPrompt 槽位");
const clientUrls = (clientSrc.match(/https?:\/\/[^"\s]+/g) || []);
check(clientUrls.length === 0, "client.js 不应引用外部地址", clientUrls.slice(0, 2).join(", "));
check(clientSrc.includes("\"/api/dsh-custom-prompt-injection/injection\""), "client.js 应调用本插件自己的同源路由");

// ---------- 5. 仓库卫生 ----------
const stray = [];
function walk(rel) {
  const abs = join(ROOT, rel);
  for (const name of readdirSync(abs)) {
    if (name === ".git" || name === "node_modules") continue;
    const childRel = rel ? rel + "/" + name : name;
    const st = statSync(join(ROOT, childRel));
    if (st.isDirectory()) walk(childRel);
    else if (/\.bak|bak-before|-bak-/.test(name)) stray.push(childRel);
  }
}
walk("");
check(stray.length === 0, "仓库里不应留有备份文件", stray.slice(0, 4).join(", "));

const gi = has(".gitignore") ? read(".gitignore") : "";
check(gi.includes("*.bak*"), ".gitignore 应忽略 *.bak* 形式的备份");
check(gi.includes("*-bak-*"), ".gitignore 应忽略 *-bak-* 形式的备份");

const readme = has("README.md") ? read("README.md") : "";
check(readme.includes("install.mjs"), "README 应说明 install.mjs 的用法");
check(readme.includes("uninstall.mjs"), "README 应说明 uninstall.mjs 的用法");

// ---------- 结果 ----------
const total = pass + fails.length;
if (fails.length === 0) {
  process.stdout.write("自检通过：" + pass + " / " + total + "\n");
  process.exit(0);
}
process.stdout.write("自检失败：" + pass + " 通过 / " + fails.length + " 失败（共 " + total + "）\n");
for (const f of fails) process.stdout.write("  [X] " + f + "\n");
process.exit(1);
