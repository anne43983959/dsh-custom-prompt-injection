#!/usr/bin/env node
// dsh-custom-prompt-injection · 安装器（跨平台 · 零依赖 · 离线）
//
//   node install.mjs                 自动定位并安装
//   node install.mjs --list          只列出检测到的 home / profile
//   node install.mjs --dry-run       打印将要做的改动，不落盘
//   node install.mjs --home <路径>   指定 DSH home
//   node install.mjs --profile <名>  只装指定 profile（可重复）
//   node install.mjs --link symlink  用符号链接代替 junction（Windows 需开发者模式）
//
// 只改目标 profile 内的两处：package.json（先备份）与 node_modules/<包名>（链接）。
// 不联网、不调用 pnpm/npm、不写 home 之外的位置、不删除任何非链接目录。

import {
  existsSync, readdirSync, readFileSync, writeFileSync, copyFileSync,
  lstatSync, unlinkSync, rmdirSync, symlinkSync, mkdirSync, readlinkSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = "dsh-custom-prompt-injection";
const SRC = resolve(dirname(fileURLToPath(import.meta.url)));
const PLAT = platform();
const IS_WIN = PLAT === "win32";
const ARGV = process.argv.slice(2);
const has = (n) => ARGV.includes(n);
const opt = (n) => {
  const i = ARGV.indexOf(n);
  if (i === -1) return null;
  const v = ARGV[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const optAll = (n) => {
  const out = [];
  for (let i = 0; i < ARGV.length; i++) {
    if (ARGV[i] === n && ARGV[i + 1] && !ARGV[i + 1].startsWith("--")) out.push(ARGV[i + 1]);
  }
  return out;
};
const LIST_ONLY = has("--list");
const DRY = has("--dry-run") || LIST_ONLY;
const LINK = IS_WIN ? (opt("--link") === "symlink" ? "symlink" : "junction") : "symlink";

const say = (s) => process.stdout.write(s + "\n");
const ok = (s) => say("  [ok] " + s);
const info = (s) => say("  [--] " + s);
const warn = (s) => say("  [!!] " + s);
const toPosix = (p) => p.split("\\").join("/");

function launcherRoots() {
  const h = homedir();
  if (IS_WIN) {
    const appdata = process.env.APPDATA || join(h, "AppData", "Roaming");
    return [join(appdata, "in.dsh-plug.dsh-launcher")];
  }
  if (PLAT === "darwin") return [join(h, "Library", "Application Support", "in.dsh-plug.dsh-launcher")];
  const xdg = process.env.XDG_CONFIG_HOME || join(h, ".config");
  return [join(xdg, "in.dsh-plug.dsh-launcher")];
}

function candidateHomes() {
  const out = [];
  const add = (p, why) => {
    if (!p) return;
    const abs = resolve(p);
    if (!existsSync(abs)) return;
    if (out.some((x) => x.home === abs)) return;
    out.push({ home: abs, why: why });
  };
  const explicit = opt("--home");
  if (typeof explicit === "string") add(explicit, "命令行 --home");
  if (process.env.DSH_HOME) add(process.env.DSH_HOME, "环境变量 DSH_HOME");
  add(join(homedir(), ".dsh"), "默认路径 ~/.dsh");
  for (const root of launcherRoots()) {
    const homesDir = join(root, "homes");
    if (!existsSync(homesDir)) continue;
    let names = [];
    try { names = readdirSync(homesDir); } catch (e) { continue; }
    for (const n of names) add(join(homesDir, n), "启动器数据目录");
  }
  return out;
}

function profilesOf(home) {
  const dir = join(home, "profiles");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith("__") || name === "node_modules") continue;
    const pjPath = join(dir, name, "package.json");
    if (!existsSync(pjPath)) continue;
    try {
      const json = JSON.parse(readFileSync(pjPath, "utf8"));
      if (json && typeof json === "object") out.push({ name: name, dir: join(dir, name), path: pjPath, json: json });
    } catch (e) { /* 读不动就跳过 */ }
  }
  return out;
}

function planFor(p) {
  const changes = [];
  const dep = "link:" + toPosix(SRC);
  const cur = p.json.dependencies ? p.json.dependencies[PKG] : undefined;
  const sameDep = typeof cur === "string" && cur.replace(/\\/g, "/") === dep;
  if (!sameDep) changes.push("dependencies[\"" + PKG + "\"]: " + (cur === undefined ? "(无)" : cur) + "  ->  " + dep);
  const prof = p.json.dsh && p.json.dsh.profile ? p.json.dsh.profile : null;
  const bundles = prof && Array.isArray(prof.bundles) ? prof.bundles : null;
  if (!bundles) changes.push("dsh.profile.bundles: 缺失，将新建并加入包名");
  else if (!bundles.includes(PKG)) changes.push("dsh.profile.bundles: 追加 " + PKG);
  const dest = join(p.dir, "node_modules", PKG);
  if (!existsSync(dest)) changes.push("node_modules/" + PKG + ": 新建 " + LINK + " 链接");
  else if (lstatSync(dest).isSymbolicLink()) {
    let tgt = "";
    try { tgt = resolve(p.dir, "node_modules", readlinkSync(dest)); } catch (e) { tgt = ""; }
    if (tgt !== SRC) changes.push("node_modules/" + PKG + ": 链接指向 " + (tgt || "?") + "，将重建");
  } else changes.push("node_modules/" + PKG + ": 已是实体目录，将跳过");
  return changes;
}

function applyTo(p) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const bak = p.path + ".bak-install-" + stamp;
  copyFileSync(p.path, bak);
  ok("已备份 package.json -> " + bak);

  const j = p.json;
  j.dependencies = j.dependencies || {};
  j.dependencies[PKG] = "link:" + toPosix(SRC);
  j.dsh = j.dsh || {};
  j.dsh.profile = j.dsh.profile || {};
  if (!Array.isArray(j.dsh.profile.bundles)) j.dsh.profile.bundles = [];
  if (!j.dsh.profile.bundles.includes(PKG)) j.dsh.profile.bundles.push(PKG);
  writeFileSync(p.path, JSON.stringify(j, null, 2) + "\n", "utf8");
  ok("已更新 package.json（dependencies + dsh.profile.bundles）");

  const nm = join(p.dir, "node_modules");
  if (!existsSync(nm)) mkdirSync(nm, { recursive: true });
  const dest = join(nm, PKG);
  if (existsSync(dest)) {
    if (lstatSync(dest).isSymbolicLink()) {
      try { unlinkSync(dest); } catch (e) { try { rmdirSync(dest); } catch (e2) {} }
    } else {
      warn("目标已存在且不是链接，已跳过：" + dest);
      warn("如需替换，请先手工删除该目录后重跑本脚本。");
      return false;
    }
  }
  try {
    symlinkSync(SRC, dest, IS_WIN && LINK === "junction" ? "junction" : "dir");
  } catch (e) {
    warn("建链接失败：" + e.message);
    warn("Windows 可改用：node install.mjs --link symlink（需开发者模式），或手工建目录链接。");
    return false;
  }
  ok("已建链接：" + dest + "  ->  " + SRC);
  return true;
}

say("dsh-custom-prompt-injection · 安装器");
say("插件目录：" + SRC);
say("运行平台：" + PLAT + "    链接方式：" + LINK);
say("");

const homes = candidateHomes();
if (homes.length === 0) {
  warn("没有找到任何 DSH home。请用 --home <路径> 指定 DSH_HOME 目录。");
  process.exit(2);
}

const want = optAll("--profile");
let done = 0;
let skipped = 0;
let seen = 0;

const allHomes = has("--all");
const targets = allHomes ? homes : homes.slice(0, 1);
if (!allHomes && homes.length > 1) {
  info("检测到 " + homes.length + " 个 home，默认只装第一个；要一次装全部请加 --all。");
  for (const other of homes.slice(1)) info("  未选中：" + other.home);
  say("");
}

for (const h of targets) {
  say("home：" + h.home + "   （来源：" + h.why + "）");
  const profiles = profilesOf(h.home);
  if (profiles.length === 0) { info("没有可用 profile，跳过。"); say(""); continue; }
  for (const p of profiles) {
    if (want.length && !want.includes(p.name)) { info("profile " + p.name + "：不在 --profile 列表内，跳过。"); continue; }
    seen++;
    say("  profile：" + p.name);
    const changes = planFor(p);
    if (changes.length === 0) { info("已是最新，无需改动。"); continue; }
    for (const c of changes) info(c);
    if (DRY) continue;
    if (applyTo(p)) done++; else skipped++;
  }
  say("");
}

if (seen === 0) { warn("没有匹配到任何 profile。用 --list 看看检测到了什么。"); process.exit(2); }
if (LIST_ONLY) { say("以上为检测结果，未做任何改动。"); process.exit(0); }
if (DRY) { say("预演结束，未做任何改动。去掉 --dry-run 即可执行。"); process.exit(0); }

say("完成：" + done + " 个 profile 已安装" + (skipped ? "，" + skipped + " 个需要手工处理" : "") + "。");
say("");
say("下一步 —— 必须完全重启 DSH 才会生效：");
say("  1. 由用户关闭 DSH 窗口 / 结束该实例进程；");
say("  2. 重新打开即可。刷新页面、新开对话都不算重启。");
say("");
say("如果你是一个 agent：请把上面这一步交给用户，不要自行结束你所在的宿主进程。");
say("本插件不联网、不写 DSH home 之外的位置、不改动 DSH 安装目录。");
