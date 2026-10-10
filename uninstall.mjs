#!/usr/bin/env node
// dsh-custom-prompt-injection · 卸载器（跨平台 · 零依赖 · 离线）
//
//   node uninstall.mjs                 自动定位并从 profile 摘除
//   node uninstall.mjs --list          只列出检测结果
//   node uninstall.mjs --dry-run       打印将要做的改动，不落盘
//   node uninstall.mjs --home <路径>   指定 DSH home
//   node uninstall.mjs --profile <名>  只处理指定 profile（可重复）
//
// 只做三件事：删 dependencies 的 link: 行、删 dsh.profile.bundles 项、删 node_modules 下的链接。
// 不改插件源码目录、不删 home 里的 state.json 与台账（档位偏好因此得以保留）。

import {
  existsSync, readdirSync, readFileSync, writeFileSync, copyFileSync,
  lstatSync, unlinkSync, rmdirSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

const PKG = "dsh-custom-prompt-injection";
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

const say = (s) => process.stdout.write(s + "\n");
const ok = (s) => say("  [ok] " + s);
const info = (s) => say("  [--] " + s);
const warn = (s) => say("  [!!] " + s);

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
  const d = join(home, "profiles");
  if (!existsSync(d)) return [];
  const out = [];
  for (const name of readdirSync(d)) {
    if (name.startsWith("__") || name === "node_modules") continue;
    const pjPath = join(d, name, "package.json");
    if (!existsSync(pjPath)) continue;
    try {
      const json = JSON.parse(readFileSync(pjPath, "utf8"));
      if (json && typeof json === "object") out.push({ name: name, dir: join(d, name), path: pjPath, json: json });
    } catch (e) {}
  }
  return out;
}

function planFor(p) {
  const changes = [];
  if (p.json.dependencies && p.json.dependencies[PKG] !== undefined) changes.push("dependencies: 删除 " + PKG);
  const prof = p.json.dsh && p.json.dsh.profile ? p.json.dsh.profile : null;
  if (prof && Array.isArray(prof.bundles) && prof.bundles.includes(PKG)) changes.push("dsh.profile.bundles: 移除 " + PKG);
  const dest = join(p.dir, "node_modules", PKG);
  if (existsSync(dest)) changes.push("node_modules/" + PKG + ": 删除链接");
  return changes;
}

function applyTo(p) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const bak = p.path + ".bak-uninstall-" + stamp;
  copyFileSync(p.path, bak);
  ok("已备份 package.json -> " + bak);
  const j = p.json;
  if (j.dependencies && j.dependencies[PKG] !== undefined) { delete j.dependencies[PKG]; ok("dependencies 已删除 " + PKG); }
  const prof = j.dsh && j.dsh.profile ? j.dsh.profile : null;
  if (prof && Array.isArray(prof.bundles) && prof.bundles.includes(PKG)) {
    prof.bundles = prof.bundles.filter((x) => x !== PKG);
    ok("dsh.profile.bundles 已移除 " + PKG);
  }
  writeFileSync(p.path, JSON.stringify(j, null, 2) + "\n", "utf8");
  ok("已写回 package.json");
  const dest = join(p.dir, "node_modules", PKG);
  if (existsSync(dest)) {
    if (lstatSync(dest).isSymbolicLink()) {
      try { unlinkSync(dest); ok("已删除链接 " + dest); }
      catch (e) { try { rmdirSync(dest); ok("已删除链接 " + dest); } catch (e2) { warn("删除链接失败：" + e2.message); return false; } }
    } else {
      warn("目标不是链接，未删除：" + dest + "（请自行确认后再处理）");
      return false;
    }
  }
  return true;
}

say("dsh-custom-prompt-injection · 卸载器");
say("运行平台：" + PLAT);
say("");

const homes = candidateHomes();
if (homes.length === 0) { warn("没有找到任何 DSH home。请用 --home <路径> 指定。"); process.exit(2); }
const allHomes = has("--all");
const targets = allHomes ? homes : homes.slice(0, 1);
if (!allHomes && homes.length > 1) {
  info("检测到 " + homes.length + " 个 home，默认只处理第一个；要全部处理请加 --all。");
  for (const o of homes.slice(1)) info("  未选中：" + o.home);
  say("");
}
const want = optAll("--profile");
let done = 0;
let seen = 0;

for (const h of targets) {
  say("home：" + h.home + "   （来源：" + h.why + "）");
  const profiles = profilesOf(h.home);
  if (profiles.length === 0) { info("没有可用 profile，跳过。"); say(""); continue; }
  for (const p of profiles) {
    if (want.length && !want.includes(p.name)) { info("profile " + p.name + "：不在 --profile 列表内，跳过。"); continue; }
    seen++;
    say("  profile：" + p.name);
    const changes = planFor(p);
    if (changes.length === 0) { info("本来就没有安装，无需改动。"); continue; }
    for (const c of changes) info(c);
    if (DRY) continue;
    if (applyTo(p)) done++;
  }
  say("");
}

if (seen === 0) { warn("没有匹配到任何 profile。"); process.exit(2); }
if (LIST_ONLY) { say("以上为检测结果，未做任何改动。"); process.exit(0); }
if (DRY) { say("预演结束，未做任何改动。去掉 --dry-run 即可执行。"); process.exit(0); }
say("完成：" + done + " 个 profile 已摘除。");
say("");
say("插件源码目录未被删除，home 里的 state.json 与台账也保留（重新安装后档位偏好还在）。");
say("重启 DSH 后生效。");
