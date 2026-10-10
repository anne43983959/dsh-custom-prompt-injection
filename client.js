(() => {
  try {
    /* 自定义提示词注入 (dsh-custom-prompt-injection) client half — 三档状态条 */
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
        var MENU_STYLE = {
          position: "absolute",
          bottom: "26px",
          left: "50%",
          transform: "translateX(-50%)",
          minWidth: "190px",
          padding: "4px",
          borderRadius: "8px",
          border: "1px solid #30363d",
          background: "#161b22",
          boxShadow: "0 6px 20px rgba(0,0,0,.45)",
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
          gap: "2px"
        };
        var MENU_ITEM_STYLE = {
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "6px 10px",
          borderRadius: "6px",
          border: "1px solid transparent",
          background: "transparent",
          color: "inherit",
          fontSize: "12px",
          fontFamily: "inherit",
          cursor: "pointer"
        };
        var FLASH_MS = 2500;

        /* 三档状态：green 中文套 / blue 英文套 / red 无载荷 */
        var INJECTION_URL = "/api/dsh-custom-prompt-injection/injection";
        var BRAND = "自定义提示词注入";
        var MODE_ORDER = ["green", "blue", "red"];
        var MODE_LABEL = { green: "启用注入（中文）", blue: "启用注入（英文）", red: "暂停注入" };
        var MODE_SHORT = { green: "中文", blue: "英文", red: "暂停" };
        /* 点选后、下一轮生效前，在主文案后追加这一段；切回生效档即消失 */
        var PENDING_SUFFIX = " · 状态已发生变化";
        var PALETTE = {
          green: { border: "rgba(16, 185, 129, 0.45)", background: "rgba(16, 185, 129, 0.12)", dot: "#10b981" },
          blue: { border: "rgba(59, 130, 246, 0.5)", background: "rgba(59, 130, 246, 0.14)", dot: "#3b82f6" },
          red: { border: "rgba(239, 68, 68, 0.5)", background: "rgba(239, 68, 68, 0.12)", dot: "#ef4444" }
        };
        /* 点的中性色：尚无判定时使用 —— 它不表示档位 */
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
              if (out.ok && body && typeof body.mode === "string") {
                return {
                  ok: true,
                  mode: body.mode,
                  pending: body.pending || null,
                  display: body.display || body.mode,
                  lastNonRed: body.lastNonRed || null,
                  sessionLastNonRed: body.sessionLastNonRed || null,
                  sessions: body.sessions,
                  persist: body.persist || null
                };
              }
              return { ok: false, error: "HTTP " + out.status + (out.text ? " · " + out.text.slice(0, 160) : "") };
            })
            .catch(function (error) {
              return { ok: false, error: String((error && error.message) || error) };
            });
        }

        function ArmorDock(props) {
          var useProjection = props.useProjection;
          var armor = typeof useProjection === "function"
            ? useProjection("armor")
            : undefined;

          var lastVerdictRef = react.useRef(null);
          var flashUntilRef = react.useRef(0);
          var tickPair = react.useState(0);
          var setTick = tickPair[1];

          // 会话 id：座位 props 不保证携带，多路探测；取不到时留空，宿主按 unknown 记账
          var sessionId = "";
          if (props) {
            if (typeof props.sessionId === "string") sessionId = props.sessionId;
            else if (props.session && typeof props.session.id === "string") sessionId = props.session.id;
            else if (props.conversation && typeof props.conversation.sessionId === "string") sessionId = props.conversation.sessionId;
            else if (props.context && typeof props.context.sessionId === "string") sessionId = props.context.sessionId;
          }

          // 档位状态：宿主为准。挂载时同步一次，操作时先乐观切换再以宿主返回值校正
          var modePair = react.useState("blue");
          var mode = modePair[0];
          var setMode = modePair[1];
          var pendingPair = react.useState(null); // 待生效档：点选后等下一轮生效
          var pending = pendingPair[0];
          var setPending = pendingPair[1];
          var backPair = react.useState(null); // 本对话最近用过的非红档
          var sessionBack = backPair[0];
          var setSessionBack = backPair[1];
          var busyPair = react.useState(false);
          var busy = busyPair[0];
          var setBusy = busyPair[1];
          var errPair = react.useState(null);
          var syncError = errPair[0];
          var setSyncError = errPair[1];
          var persistPair = react.useState(null);
          var persistFile = persistPair[0];
          var setPersistFile = persistPair[1];
          var menuPair = react.useState(false);
          var menuOpen = menuPair[0];
          var setMenuOpen = menuPair[1];
          var flashPair = react.useState(null); // { from, to, until } 切换提示
          var switched = flashPair[0];
          var setSwitched = flashPair[1];

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
            // 启动时与宿主同步一次：档位 + 本会话记忆 + 状态文件快照
            postInjection(sessionId ? { sessionId: sessionId } : {}).then(function (out) {
              if (!alive) return;
              if (out.ok) {
                setMode(out.mode);
                setPending(out.pending || null);
                setSessionBack(out.sessionLastNonRed || null);
                setPersistFile(out.persist);
                setSyncError(null);
              } else {
                setSyncError(out.error);
              }
            });
            return function () { alive = false; };
          }, []);

          // 依赖必须是**标量**：armor 是投影对象，每次渲染都可能是新引用 ——
          // 用 [armor] 做依赖会让 effect 每次渲染都跑一遍（每次渲染一次 POST），
          // 表现就是"点一下按钮卡一下"。改用轮次号 + 运行标志，只在真正换轮时同步。
          var armorSeq = armor && typeof armor.seq === "number" ? armor.seq : null;
          var armorRunning = !!(armor && armor.running);
          react.useEffect(function () {
            var v = armor && armor.verdict ? armor.verdict : null;
            if (v !== lastVerdictRef.current) {
              lastVerdictRef.current = v;
              if (v) flashUntilRef.current = Date.now() + FLASH_MS;
              setTick(Date.now());
            }
            // 每轮开始/结束时静默同步一次：pending 是否已在下一轮真正生效，由宿主说了算
            var alive = true;
            postInjection(sessionId ? { sessionId: sessionId } : {}).then(function (out) {
              if (!alive || !out.ok) return;
              setMode(out.mode);
              setPending(out.pending || null);
              setSessionBack(out.sessionLastNonRed || null);
            });
            return function () { alive = false; };
          }, [armorSeq, armorRunning]);

          // 右键菜单：点到别处或按 Esc 时收起
          react.useEffect(function () {
            if (!menuOpen) return;
            function close() { setMenuOpen(false); }
            function onKey(e) { if (e && e.key === "Escape") setMenuOpen(false); }
            document.addEventListener("click", close);
            document.addEventListener("keydown", onKey);
            return function () {
              document.removeEventListener("click", close);
              document.removeEventListener("keydown", onKey);
            };
          }, [menuOpen]);

          function accept(out) {
            setMode(out.mode);
            setPending(out.pending || null);
            setSessionBack(out.sessionLastNonRed || null);
            setPersistFile(out.persist);
            setSyncError(null);
            setSwitched({ to: out.pending || out.mode, until: Date.now() + FLASH_MS });
            setTick(Date.now());
          }

          // 左键：显示档为绿/蓝 ▶ 红；显示档为红 ▶ 本对话最近用过的非红档（未用过 ▶ 绿）
          // 注意：判据必须是**显示档**（pending 优先），而不是生效档 ——
          // 否则"已挂 pending 时点回生效档"会被当成同档而静默吞掉。
          function onClick() {
            if (busy) return;
            var shownNow = pending || mode;
            var target = shownNow === "red" ? (sessionBack === "blue" || sessionBack === "green" ? sessionBack : "blue") : "red";
            if (target === shownNow) return;
            setBusy(true);
            setPending(target === mode ? null : target); // 目标等于生效档 = 取消 pending
            postInjection({ toggle: true, sessionId: sessionId }).then(function (out) {
              setBusy(false);
              if (out.ok) accept(out);
              else { setPending(pending); setSyncError(out.error); }
            });
          }

          // 右键菜单项：直接指定档位（同样以显示档为判据，允许"点回生效档"= 取消 pending）
          function switchTo(target) {
            if (busy) return;
            var shownNow = pending || mode;
            setMenuOpen(false);
            if (target === shownNow) return;
            setBusy(true);
            setPending(target === mode ? null : target);
            postInjection({ mode: target, sessionId: sessionId, action: "context" }).then(function (out) {
              setBusy(false);
              if (out.ok) accept(out);
              else { setPending(pending); setSyncError(out.error); }
            });
          }

          function onContextMenu(e) {
            if (e && typeof e.preventDefault === "function") e.preventDefault();
            if (e && typeof e.stopPropagation === "function") e.stopPropagation();
            if (busy) return;
            setMenuOpen(!menuOpen);
          }

          var running = armorRunning;
          var words = armor && Array.isArray(armor.words) ? armor.words : [];
          var risk = armor && Array.isArray(armor.risk) ? armor.risk : [];
          var domain = armor && armor.domain ? armor.domain : null;
          var showVerdict = !running && lastVerdictRef.current !== null &&
            Date.now() < flashUntilRef.current;
          var showSwitch = !running && !showVerdict && switched !== null && Date.now() < switched.until;

          // 口径：
          //   边框 + 底纹 = 【档位】（绿=中文套 / 蓝=英文套 / 红=无载荷），判定不改写它们；
          //   文字前的点  = 【最近一次回复的判定】，与档位无关：
          //                 通过=绿 / 越界=红 / 尚无判定=中性灰；运行中在该颜色上呼吸。
          // 显示档：pending 优先（用户点选后立刻看到目标档 + 「状态已发生变化」），生效后两者归一
          var shown = pending || mode;
          var pendingHint = pending && pending !== mode ? PENDING_SUFFIX : "";
          var palette = PALETTE[shown] || PALETTE.green;
          var text = (MODE_LABEL[shown] || MODE_LABEL.green) + pendingHint;
          var verdict = lastVerdictRef.current;
          var dotColor = verdict === "pass" ? PALETTE.green.dot : (verdict ? PALETTE.red.dot : DOT_IDLE);
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
          } else if (showSwitch) {
            text = (MODE_LABEL[shown] || MODE_LABEL.green) + pendingHint;
          }

          // 状态记忆的只读提示：异常（文件被外部改写/写不进去/不落盘）才出现，正常时标题保持干净
          var persistHint = "";
          if (persistFile) {
            if (persistFile.tampered) persistHint = " · 状态文件被外部改写，已忽略并回写";
            else if (!persistFile.supported) persistHint = " · 状态不落盘（未设置 DSH_HOME）";
            else if (persistFile.lastError) persistHint = " · 状态文件写入失败：" + persistFile.lastError;
          }
          var persistMode = !persistFile
            ? "unknown"
            : (persistFile.tampered ? "tampered" : (persistFile.supported ? "file" : "memory"));
          var nextOnClick = shown === "red"
            ? ("▶ " + (MODE_SHORT[(sessionBack === "blue" || sessionBack === "green") ? sessionBack : "blue"]))
            : "▶ 暂停注入";
          var stateLine = pending && pending !== mode
            ? ("待生效：" + MODE_LABEL[pending] + "（下一轮开始时应用）")
            : ("生效中：" + MODE_LABEL[mode]);
          var title = BRAND + " · " + stateLine + "；左键 " + nextOnClick + "；右键切换全部三档" +
            "（单轮内切换不生效，等下一轮开始；ptc-hygiene 段常驻，不随档位）" + persistHint +
            (syncError ? " · 与宿主同步失败：" + syncError : "");

          var menu = menuOpen
            ? react.createElement(
                "div",
                { style: MENU_STYLE, onClick: function (e) { if (e) e.stopPropagation(); } },
                MODE_ORDER.map(function (m) {
                  var itemStyle = Object.assign({}, MENU_ITEM_STYLE, {
                    background: m === mode ? "rgba(255,255,255,0.06)" : "transparent",
                    borderColor: m === mode ? PALETTE[m].border : "transparent",
                    fontWeight: m === mode ? 600 : 400
                  });
                  return react.createElement(
                    "button",
                    {
                      key: m,
                      type: "button",
                      style: itemStyle,
                      "data-mode-item": m,
                      onClick: function () { switchTo(m); }
                    },
                    ((m === shown ? "● " : "○ ") + MODE_LABEL[m])
                  );
                })
              )
            : null;

          return react.createElement(
            "div",
            { style: WRAP_STYLE, onContextMenu: onContextMenu },
            react.createElement(
              "button",
              {
                type: "button",
                style: badgeStyle,
                "data-armor": "on",
                "data-mode": shown,
                "data-active": mode,
                "data-pending": pending || "",
                "data-persist": persistMode,
                disabled: busy,
                title: title,
                onClick: onClick,
                onContextMenu: onContextMenu
              },
              react.createElement("span", { style: dotStyle }),
              react.createElement("span", null, text)
            ),
            menu
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
