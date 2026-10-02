(() => {
  try {
    /* 自定义提示词注入 (dsh-custom-prompt-injection) client half — realtime badge */
    window.__ModuleLoader__.load({
      id: "dsh-custom-prompt-injection",
      factory: (require) => {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

        var react = require("react");

        var inject = ["slots"];

        var ANIM_CSS = "@keyframes dshArmorPulse{0%,100%{box-shadow:0 0 2px rgba(16,185,129,.5);opacity:1}50%{box-shadow:0 0 14px rgba(16,185,129,1);opacity:.6}}@keyframes dshArmorFlash{0%{transform:scale(1)}30%{transform:scale(1.1)}100%{transform:scale(1)}}";

        var WRAP_STYLE = {
          display: "flex",
          justifyContent: "center",
          width: "100%",
          position: "relative"
        };
        var BADGE_STYLE = {
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          width: "fit-content",
          padding: "3px 10px",
          borderRadius: "6px",
          appearance: "none",
          border: "1px solid",
          borderColor: "rgba(16, 185, 129, 0.45)",
          background: "rgba(16, 185, 129, 0.12)",
          color: "inherit",
          fontSize: "11px",
          lineHeight: "16px",
          fontFamily: "inherit",
          userSelect: "none",
          whiteSpace: "nowrap",
          cursor: "pointer"
        };
        var DOT_STYLE = {
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "#10b981",
          flex: "none"
        };
        var FLASH_MS = 2500;

        /* 注入开关：宿主路由 + 双色板 */
        var INJECTION_URL = "/api/dsh-custom-prompt-injection/injection";
        /* 注入文本候选：测试功能，仅改内存，不写盘 */
        var BRAND = "自定义提示词注入";
        var PALETTE_ON = {
          border: "rgba(16, 185, 129, 0.45)",
          background: "rgba(16, 185, 129, 0.12)",
          dot: "#10b981"
        };
        var PALETTE_OFF = {
          border: "rgba(239, 68, 68, 0.5)",
          background: "rgba(239, 68, 68, 0.12)",
          dot: "#ef4444"
        };
        /* 分域态用蓝色底纹（测试功能）：边框+底纹仍表示"注入强度"，点仍表示最近判定 */
        // 点的中性色：尚无判定时使用 —— 它不表示注入开关状态
        var DOT_IDLE = "#9ca3af";

        // 只读文本再解析：宿主不可达时给出可读原因，不静默
        function postInjection(payload) {
          return fetch(INJECTION_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload || {})
          })
            .then(function (res) {
              return res.text().then(function (text) { return { ok: res.ok, status: res.status, text: text }; });
            })
            .then(function (out) {
              var body = null;
              try { body = out.text ? JSON.parse(out.text) : null; } catch (error) { body = null; }
              if (out.ok && body && typeof body.enabled === "boolean") {
                return {
                  ok: true,
                  enabled: body.enabled,
                  persist: body.persist || null
                };
              }
              return { ok: false, error: "HTTP " + out.status + (out.text ? " · " + out.text.slice(0, 160) : "") };
            })
            .catch(function (error) {
              return { ok: false, error: String((error && error.message) || error) };
            });
        }

        // 读取 / 切换注入文本候选（测试功能）。与 postInjection 同形：先读文本再解析。

        function ArmorDock(props) {
          var useProjection = props.useProjection;
          var armor = typeof useProjection === "function"
            ? useProjection("armor")
            : undefined;

          var lastVerdictRef = react.useRef(null);
          var flashUntilRef = react.useRef(0);
          var tickPair = react.useState(0);
          var setTick = tickPair[1];

          // 注入开关：宿主为准。挂载时同步一次，点击时先乐观切换再以宿主返回值校正
          var injectionPair = react.useState(true);
          var injectionOn = injectionPair[0];
          var setInjectionOn = injectionPair[1];
          var busyPair = react.useState(false);
          var busy = busyPair[0];
          var setBusy = busyPair[1];
          var errPair = react.useState(null);
          var syncError = errPair[0];
          var setSyncError = errPair[1];
          // 状态记忆：宿主把 home 状态文件的情况一并回报（此处只读展示，不参与切换）
          var persistPair = react.useState(null);
          // 测试功能：注入文本候选与右键菜单
          var persistFile = persistPair[0];
          var setPersistFile = persistPair[1];

          react.useEffect(function () {
            var styleEl = null;
            if (!document.getElementById("dsh-armor-css")) {
              styleEl = document.createElement("style");
              styleEl.id = "dsh-armor-css";
              styleEl.textContent = ANIM_CSS;
              document.head.appendChild(styleEl);
            }
            return function () { if (styleEl) styleEl.remove(); };
          }, []);

            react.useEffect(function () {
              var alive = true;
              // 启动时与宿主同步一次：开关状态 + 状态文件快照（persistFile 决定标题里的状态提示）
              postInjection({}).then(function (out) {
                if (!alive) return;
                if (out.ok) { setInjectionOn(out.enabled); setPersistFile(out.persist); setSyncError(null); }
                else { setSyncError(out.error); }
              });
              return function () { alive = false; };
            }, []);



          react.useEffect(function () {
            var v = armor && armor.verdict ? armor.verdict : null;
            if (v !== lastVerdictRef.current) {
              lastVerdictRef.current = v;
              if (v) flashUntilRef.current = Date.now() + FLASH_MS;
              setTick(Date.now());
            }
          }, [armor]);

          function toggleInjection() {
            if (busy) return;
            var target = !injectionOn;
            setBusy(true);
            setInjectionOn(target);
            postInjection({ enabled: target }).then(function (out) {
              setBusy(false);
              if (out.ok) { setInjectionOn(out.enabled); setPersistFile(out.persist); setSyncError(null); }
              else { setInjectionOn(!target); setSyncError(out.error); }
            });
          }


          var running = !!(armor && armor.running);
          var words = armor && Array.isArray(armor.words) ? armor.words : [];
          var risk = armor && Array.isArray(armor.risk) ? armor.risk : [];
          var domain = armor && armor.domain ? armor.domain : null;
          var showVerdict = !running && lastVerdictRef.current !== null &&
            Date.now() < flashUntilRef.current;

          // 口径（2026-09-27 二次修订）：
          //   边框 + 底纹 = 【注入开关状态】（绿=已启用 / 红=已暂停），判定不改写它们；
          //   文字前的点  = 【最近一次回复的判定】，与开关无关：
          //                 通过=绿 / 越界=红 / 尚无判定=中性灰；运行中在该颜色上呼吸。
          var palette = injectionOn ? PALETTE_ON : PALETTE_OFF;
          var text = injectionOn ? "已启用注入" : "已暂停注入";
          var verdict = lastVerdictRef.current;
          var dotColor = verdict === "pass" ? PALETTE_ON.dot : (verdict ? PALETTE_OFF.dot : DOT_IDLE);
          var dotStyle = Object.assign({}, DOT_STYLE, { background: dotColor });
          var badgeStyle = Object.assign({}, BADGE_STYLE, {
            borderColor: palette.border,
            background: palette.background,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1
          });

          if (running) {
            dotStyle.animation = "dshArmorPulse 1.2s ease-in-out infinite";
            text = "执行中…";
          } else if (showVerdict) {
            if (verdict === "pass") {
              text = "✓ 回复符合注入协议" + (domain ? " · " + domain : "") + (risk.length ? " · 载荷x" + risk.length : "");
              badgeStyle.animation = "dshArmorFlash 1.2s ease";
            } else {
              text = "✗ 协议破坏：" + (words[0] || "未标注的越界表述");
              badgeStyle.animation = "dshArmorFlash 1.6s ease";
            }
          }

          // 状态记忆的只读提示：异常（文件被外部改写/写不进去/不落盘）才出现，正常时标题保持干净
          var persistHint = "";
          if (persistFile) {
            if (persistFile.tampered) persistHint = " · 状态文件被外部改写，已忽略并回写";
            else if (!persistFile.supported) persistHint = " · 状态不落盘（未设置 DSH_HOME）";
            else if (persistFile.lastError) persistHint = " · 状态文件写入失败：" + persistFile.lastError;
          }
          var persistMode = !persistFile
            ? "unknown"     // 尚未拿到宿主回报：不猜
            : (persistFile.tampered ? "tampered" : (persistFile.supported ? "file" : "memory"));
          var title = BRAND + " · " + (injectionOn ? "点击暂停注入" : "点击启用注入") + "（本按钮只切 L1/L2，常驻语言段不受影响）" + persistHint +
            (syncError ? " · 与宿主同步失败：" + syncError : "");


          return react.createElement(
            "div",
            { style: WRAP_STYLE },
            react.createElement(
              "button",
              {
                type: "button",
                style: badgeStyle,
                "data-armor": "on",
                "data-injection": injectionOn ? "on" : "off",
                "data-persist": persistMode,
                disabled: busy,
                title: title,
                onClick: toggleInjection
              },
              react.createElement("span", { style: dotStyle }),
              react.createElement("span", null, text)
            )
          );
        }

        function apply(ctx) {
          ctx.slots.inject("conversation.input.dock", () =>
            ctx.slots.register({
              name: "conversation.input.dock",
              id: "armor",
              order: 30
            }, ArmorDock)
          );
        }

        exports.name = "dsh-custom-prompt-injection";
        exports.inject = inject;
        exports.apply = apply;
        return module.exports;
      }
    });
  } catch (err) {
    console.warn('[AI Client Sandbox] dsh-custom-prompt-injection runtime error:', err);
  }
})();
