// 客户端半冒烟：小绿标 → 注入开关按钮（React 桩 + fetch 桩）——离线
// 用法：node scripts/smoke-injection-client.mjs
import { readFileSync } from "node:fs";

const pass = [];
const fails = [];
const check = (ok, label, detail) => (ok ? pass : fails).push(label + (ok || !detail ? "" : " — " + detail));

/* ---------- React 桩 ---------- */
let rendering = "dock";
let cursor = 0;
const hookSlots = new Map();
const pendingEffects = [];
const hookKey = () => rendering + "#" + cursor++;
const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: Object.assign({}, props || {}, { children: children.length ? (children.length === 1 ? children[0] : children) : (props || {}).children }),
  }),
  useState(initial) {
    const k = hookKey();
    if (!hookSlots.has(k)) hookSlots.set(k, typeof initial === "function" ? initial() : initial);
    return [hookSlots.get(k), (v) => hookSlots.set(k, typeof v === "function" ? v(hookSlots.get(k)) : v)];
  },
  useRef(initial) { const k = hookKey(); if (!hookSlots.has(k)) hookSlots.set(k, { current: initial }); return hookSlots.get(k); },
  useEffect(fn) { pendingEffects.push(fn); },
};

/* ---------- DOM / fetch 桩 ---------- */
globalThis.document = {
  head: { appendChild() {} },
  getElementById() { return null; },
  createElement() { return { remove() {} }; },
};
const calls = [];
let responder = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, enabled: true })) });
globalThis.fetch = (url, init) => { calls.push({ url, init }); return responder(url, init); };

/* ---------- 装载 bundle（与 DSH 客户端 loader 同形） ---------- */
let definition = null;
globalThis.window = { __ModuleLoader__: { load: (def) => { definition = def; } } };
const modules = { react: React, "react/jsx-runtime": {}, "react-dom": {} };
new Function("require", readFileSync(new URL("../client.js", import.meta.url), "utf8"))((id) => modules[id]);
check(!!definition, "bundle 调用了 __ModuleLoader__.load");
const exported = definition.factory((id) => modules[id]);
check(exported.inject.indexOf("slots") >= 0, "导出 inject 含 slots");

let seat = null;
exported.apply({
  slots: {
    inject: (name, cb) => { const d = cb(); seat = { name, spec: d && d.spec, component: (d && (d.component || d.Component)) || null }; return () => {}; },
    register: (spec, component) => ({ spec, component }),
  },
});
check(seat && seat.name === "conversation.input.dock", "座位 = conversation.input.dock");
check(seat && seat.spec && seat.spec.id === "armor", "座位 id = armor，order = " + (seat.spec && seat.spec.order));

const Dock = seat.component;
let proj = { running: false, verdict: null, words: [], risk: [], domain: null };
const render = () => { rendering = "dock"; cursor = 0; return Dock({ useProjection: () => proj }); };
function findButton(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "button") return node;
  return findButton(node.props && node.props.children) || (Array.isArray(node.props && node.props.children) ? node.props.children.map(findButton).find(Boolean) : null);
}
const textOf = (node) => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.props && node.props.children);
};
const tick = () => new Promise((r) => setTimeout(r, 0));

let btn = findButton(render());
check(btn && btn.type === "button", "渲染出按钮元素");
check(textOf(btn) === "已启用注入", "默认文案 = 已启用注入", textOf(btn));
check(btn.props["data-injection"] === "on", "data-injection = on");
check(btn.props.style.borderColor === "rgba(16, 185, 129, 0.45)", "启用态 = 绿色边框", btn.props.style.borderColor);
check(btn.props.style.background === "rgba(16, 185, 129, 0.12)", "启用态 = 绿色底");
check(btn.props.children[0].props.style.background === "#9ca3af", "无判定时点＝中性灰（不随开关变绿）", btn.props.children[0].props.style.background);
check(typeof btn.props.onClick === "function", "按钮有 onClick");

// 跑一次挂载副作用（同步一次的 fetch）
for (const fn of pendingEffects.splice(0)) fn();
await tick();
check(calls.length === 1 && calls[0].url === "/api/dsh-custom-prompt-injection/injection", "挂载时向宿主查询一次", JSON.stringify(calls[0] && calls[0].url));
check(calls.length === 1 && calls[0].init.body === "{}", "查询体为空对象");

btn = findButton(render());
check(textOf(btn) === "已启用注入", "同步后仍为已启用注入");

// 点击 → 乐观切换 + 上报宿主
responder = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, enabled: false })) });
btn.props.onClick();
btn = findButton(render());
check(textOf(btn) === "已暂停注入", "点击后文案 = 已暂停注入", textOf(btn));
check(btn.props["data-injection"] === "off", "点击后 data-injection = off");
check(btn.props.style.borderColor === "rgba(239, 68, 68, 0.5)", "禁用态 = 红色边框", btn.props.style.borderColor);
check(btn.props.style.background === "rgba(239, 68, 68, 0.12)", "禁用态 = 红色底");
check(btn.props.children[0].props.style.background === "#9ca3af", "切到暂停后点仍是中性灰（与开关无关）", btn.props.children[0].props.style.background);
check(calls.length === 2 && JSON.parse(calls[1].init.body).enabled === false, "点击上报 {enabled:false}");
await tick();
btn = findButton(render());
check(textOf(btn) === "已暂停注入", "宿主确认后仍为已暂停注入");

// 再点一次 → 回到启用
responder = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, enabled: true })) });
btn.props.onClick();
await tick();
btn = findButton(render());
check(textOf(btn) === "已启用注入", "再次点击回到已启用注入");
check(btn.props.style.borderColor === "rgba(16, 185, 129, 0.45)", "回到绿色");

// 宿主失败 → 回滚 + 标题给出原因
responder = () => Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('{"error":"boom"}') });
btn.props.onClick();
await tick();
btn = findButton(render());
check(textOf(btn) === "已启用注入", "宿主失败时回滚为已启用注入", textOf(btn));
check(String(btn.props.title).indexOf("同步失败") >= 0, "标题给出同步失败原因", String(btn.props.title));
check(String(btn.props.title).indexOf("自定义提示词注入") >= 0, "标题含插件名");
const VER_LITERAL = ["1", "0", "0"].join(".");
check(String(btn.props.title).indexOf(VER_LITERAL) < 0, "标题不含版本号（界面零版本）");

// 运行中 → 执行中…（状态点仍在）
proj = { running: true, verdict: null, words: [], risk: [], domain: null };
btn = findButton(render());
check(textOf(btn) === "执行中…", "运行时文案 = 执行中…", textOf(btn));


/* ---------- 判定闪现：边框/底纹恒＝注入状态，只有点随判定变色 ---------- */
// A) 注入已启用 + 判定未通过 → 边框仍绿、点变红
proj = { running: false, verdict: "refusal", words: ["我可以讲解原理"], risk: [], domain: null };
btn = findButton(render());
for (const fn of pendingEffects.splice(0)) fn();
btn = findButton(render());
check(textOf(btn) === "✗ 协议破坏：我可以讲解原理", "判定未通过：文案 = ✗ 协议破坏：<具体行为>", textOf(btn));
check(btn.props.style.borderColor === "rgba(16, 185, 129, 0.45)", "判定未通过：边框仍＝启用态绿", btn.props.style.borderColor);
check(btn.props.style.background === "rgba(16, 185, 129, 0.12)", "判定未通过：底纹仍＝启用态绿", btn.props.style.background);
check(btn.props.children[0].props.style.background === "#ef4444", "判定未通过：点变红", btn.props.children[0].props.style.background);

// B) 注入切到暂停 + 判定通过 → 边框仍红、点变绿
responder = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, enabled: false })) });
btn.props.onClick();
await tick();
proj = { running: false, verdict: "pass", words: [], risk: [], domain: "reverse" };
btn = findButton(render());
for (const fn of pendingEffects.splice(0)) fn();
btn = findButton(render());
check(btn.props["data-injection"] === "off", "此时注入为暂停");
check(textOf(btn).indexOf("✓ 回复符合注入协议") === 0, "判定通过：文案以 ✓ 回复符合注入协议 开头", textOf(btn));
check(btn.props.style.borderColor === "rgba(239, 68, 68, 0.5)", "判定通过但已暂停：边框＝红（不被判定改写）", btn.props.style.borderColor);
check(btn.props.style.background === "rgba(239, 68, 68, 0.12)", "判定通过但已暂停：底纹＝红");
check(btn.props.children[0].props.style.background === "#10b981", "判定通过：点变绿", btn.props.children[0].props.style.background);

/* ---------- 状态记忆提示：正常时沉默，异常时出现在 title 与 data-persist ---------- */
const persistBody = (persist) => () =>
  Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, enabled: true, persist })) });

responder = persistBody({ supported: true, tampered: false, lastError: null, source: "file" });
for (const fn of pendingEffects.splice(0)) fn();
await tick();
btn = findButton(render());
check(btn.props["data-persist"] === "file", "状态记忆：正常时 data-persist=file", String(btn.props["data-persist"]));
check(String(btn.props.title).indexOf("状态文件") < 0, "状态记忆：正常时标题不提状态文件", String(btn.props.title));

responder = persistBody({ supported: true, tampered: true, lastError: null, source: "rejected" });
for (const fn of pendingEffects.splice(0)) fn();
await tick();
btn = findButton(render());
check(btn.props["data-persist"] === "tampered", "状态记忆：文件被外部改写 → data-persist=tampered");
check(String(btn.props.title).indexOf("状态文件被外部改写") >= 0, "状态记忆：被改写时标题给出可读原因");

responder = persistBody({ supported: false, tampered: false, lastError: null, source: "memory" });
for (const fn of pendingEffects.splice(0)) fn();
await tick();
btn = findButton(render());
check(btn.props["data-persist"] === "memory", "状态记忆：未设 DSH_HOME → data-persist=memory");
check(String(btn.props.title).indexOf("状态不落盘") >= 0, "状态记忆：不落盘时标题给出说明");

responder = persistBody({ supported: true, tampered: false, lastError: "EACCES", source: "file" });
for (const fn of pendingEffects.splice(0)) fn();
await tick();
btn = findButton(render());
check(String(btn.props.title).indexOf("状态文件写入失败") >= 0, "状态记忆：写盘失败时标题给出原因");

console.log("通过 " + pass.length + " / 失败 " + fails.length);
for (const p of pass) console.log("  OK   " + p);
for (const f of fails) console.log("  FAIL " + f);
process.exit(fails.length === 0 ? 0 : 1);

/* __RENDER_CHECK__ 渲染级验证（2026-10-01 新增）
   背景：只做 node --check 查不出「组件体引用了已删除的 state」——语法合法，但渲染时 ReferenceError，
   整个 slot 会静默失败（按钮消失）。这里用 mock react 真正调用一次组件函数，把这类残留钉死在自检里。 */
import { readFileSync as __rf } from "node:fs";
import { fileURLToPath as __fp } from "node:url";
import { dirname as __dn, join as __jn } from "node:path";
const __ROOT = __jn(__dn(__fp(import.meta.url)), "..");
const __src = __rf(__jn(__ROOT, "client.js"), "utf8");
let __cap = null, __Comp = null;
const __win = { __ModuleLoader__: { load: (m) => { __cap = m; } } };
const __doc = { head: { appendChild() {} }, createElement: () => ({}), getElementById: () => null, addEventListener() {}, removeEventListener() {} };
try {
  new Function("window", "document", __src)(__win, __doc);
  console.log("  OK   渲染级：模块加载无异常");
} catch (e) {
  console.log("  FAIL 渲染级：模块加载抛错 " + e.message);
  process.exitCode = 1;
}
if (__cap) {
  const __react = {
    useState: (v) => [typeof v === "function" ? v() : v, () => {}],
    useEffect: (f) => { try { f(); } catch {} },
    useRef: (v) => ({ current: v }),
    createElement: (t, p, ...c) => ({ t, p, c }),
    Fragment: Symbol("F"),
  };
  try {
    const __exp = __cap.factory((n) => (n === "react" ? __react : {}));
    const __ctx = { slots: { inject: (_n, fn) => fn(), register: (_s, C) => { __Comp = C; } }, effect: (f) => { try { f(); } catch {} } };
    __exp.apply(__ctx);
    if (!__Comp) { console.log("  FAIL 渲染级：未捕获到组件"); process.exitCode = 1; }
    else {
      __Comp({});
      console.log("  OK   渲染级：组件执行无 ReferenceError（按钮会正常显示）");
    }
  } catch (e) {
    console.log("  FAIL 渲染级：" + e.name + ": " + e.message + "  ← 这类残留会让整个按钮消失");
    process.exitCode = 1;
  }
}
