      // ---- Tooltips: mouse AND touch screen (jog panel + Zones page) ----
      //
      // Request: "there are buttons with long text, put a hover or something so that
      // with the mouse / on the touch screen it can be seen". The native `title`
      // does not work in the kiosk (without a mouse it never appears), so:
      //   - Mouse: after hovering ~0.35 s over any element with title or
      //     data-tip, its own tooltip appears (it replaces the native one, which is
      //     removed so two are not seen).
      //   - Zones page, touch: HOLDING ~0.5 s shows the tooltip
      //     and that touch does NOT trigger the button (the page's buttons act
      //     on click, which is discarded). A normal tap works as always.
      //   - Jog panel, touch: its buttons act as soon as they are touched
      //     (pointerdown/up), a "hold" would already trigger them. That is
      //     why it has a "?" button (help mode): while active, tapping
      //     a button shows its explanation instead of triggering it. It turns off
      //     by itself after 20 s or with another tap on "?". STOP and E-STOP
      //     (data-tip-pass) ALWAYS work, with or without help mode.
      // If the button's text is cut off (...) the tooltip shows it whole.

      // literal id (2026-10-10): this file goes before 10-jog.js (src/_zones) and
      // (before it also went in WorkshopCut)
      var TJ_TIP_ROOTS = ".tz-page, #emergency-fab-jog-panel";
      var TJ_TIP_HOVER_MS = 350;
      var TJ_TIP_PRESS_MS = 900; // a normal tap on the touch screen can last 500 ms: the hold must be clearly longer, or it swallows the tap
      var TJ_TIP_HELP_IDLE_MS = 20000;
      var tjTipEl = null;
      var tjTipTimer = null;
      var tjTipHideTimer = null;
      var tjTipHelp = false;
      var tjTipHelpTimer = null;
      var tjTipHelpListeners = [];
      var tjTipSwallowUntil = 0;
      var tjTipPress = null; // {el, x, y, shown}

      // Tooltip text of `el` (or "" if it has none). It moves title -> data-tip
      // so that the browser does not also show its native tooltip.
      function tjTipText(el) {
        if (el.title) {
          el.setAttribute("data-tip", el.title);
          el.removeAttribute("title");
        }
        var tip = el.getAttribute("data-tip") || "";
        var label = (el.textContent || "").trim();
        var cut = label && el.scrollWidth > el.clientWidth + 1;
        if (cut && tip.indexOf(label) !== 0) tip = label + (tip ? String.fromCharCode(10) + tip : "");
        return tip;
      }

      // Element with a tooltip under `target`, inside the jog panel or the Zones page.
      function tjTipTarget(target) {
        if (!target || !target.closest || !target.closest(TJ_TIP_ROOTS)) return null;
        var el = target.closest("[title],[data-tip],button");
        if (!el || !el.closest(TJ_TIP_ROOTS)) return null;
        return tjTipText(el) ? el : null;
      }

      function tjTipShow(el, ms, textOverride) {
        var text = textOverride || tjTipText(el);
        if (!text) return;
        if (!tjTipEl) {
          tjTipEl = document.createElement("div");
          tjTipEl.style.cssText = [
            "position:fixed",
            "z-index:2147483647", // arriba del panel jog (2147483646)
            "max-width:min(320px,calc(100vw - 16px))",
            "background:#263238",
            "color:#eceff1",
            "border:1px solid rgba(255,255,255,0.35)",
            "border-radius:6px",
            "padding:6px 9px",
            "font:12px/1.35 Roboto,sans-serif",
            "white-space:pre-line",
            "box-shadow:0 4px 14px rgba(0,0,0,0.5)",
            "pointer-events:none",
          ].join(";");
          document.body.appendChild(tjTipEl);
        }
        tjTipEl.textContent = text;
        tjTipEl.style.display = "block";
        var r = el.getBoundingClientRect();
        var tw = tjTipEl.offsetWidth,
          th = tjTipEl.offsetHeight;
        var left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
        var top = r.bottom + 6;
        if (top + th > window.innerHeight - 8) top = Math.max(8, r.top - th - 6);
        tjTipEl.style.left = left + "px";
        tjTipEl.style.top = top + "px";
        clearTimeout(tjTipHideTimer);
        if (ms) tjTipHideTimer = setTimeout(tjTipHide, ms);
      }

      function tjTipHide() {
        clearTimeout(tjTipTimer);
        clearTimeout(tjTipHideTimer);
        if (tjTipEl) tjTipEl.style.display = "none";
      }

      function tjTipSetHelp(on) {
        tjTipHelp = !!on;
        clearTimeout(tjTipHelpTimer);
        if (tjTipHelp) tjTipHelpTimer = setTimeout(function () { tjTipSetHelp(false); }, TJ_TIP_HELP_IDLE_MS);
        else tjTipHide();
        tjTipHelpListeners.forEach(function (fn) { fn(tjTipHelp); });
      }

      // "?" button for the jog panel's header.
      function tjTipMakeHelpBtn() {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = "?";
        b.setAttribute("data-tip", i18nT('workbenchTips.help_with_this_on_tap_any'));
        b.setAttribute("data-tip-pass", "1");
        b.style.cssText = "width:20px;height:20px;border-radius:4px;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:12px;font-weight:bold;line-height:18px;padding:0;cursor:pointer;touch-action:none;margin-right:4px;";
        function paint(on) {
          b.style.background = on ? "#1565c0" : "rgba(255,255,255,0.15)";
        }
        tjTipHelpListeners.push(paint);
        b.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        b.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          tjTipSetHelp(!tjTipHelp);
          if (tjTipHelp) tjTipShow(b, 4000);
        });
        return b;
      }

      function tjTipInstall() {
        if (window.__tjTipsInstalled) return;
        window.__tjTipsInstalled = true;

        // Mouse: hover con demora.
        document.addEventListener("pointerover", function (ev) {
          if (ev.pointerType !== "mouse") return;
          var el = tjTipTarget(ev.target);
          clearTimeout(tjTipTimer);
          if (!el) return tjTipHide();
          tjTipTimer = setTimeout(function () { tjTipShow(el, 0); }, TJ_TIP_HOVER_MS);
        }, true);
        document.addEventListener("pointerout", function (ev) {
          if (ev.pointerType === "mouse" && !(ev.relatedTarget && tjTipTarget(ev.relatedTarget))) tjTipHide();
        }, true);

        // Help mode (any pointer) and hold (touch, Zones page only).
        // Captured on window: runs BEFORE the buttons' handlers.
        function blockIfHelp(ev) {
          if (!tjTipHelp || ev.target.closest && ev.target.closest("[data-tip-pass]")) return false;
          var el = tjTipTarget(ev.target);
          if (!el) return false;
          ev.stopPropagation();
          ev.preventDefault();
          if (ev.type === "pointerup") {
            tjTipShow(el, 6000);
            tjTipSetHelp(true); // reinicia los 20 s
          }
          return true;
        }
        window.addEventListener("pointerdown", function (ev) {
          if (blockIfHelp(ev)) return;
          if (tjTipPress) tjTipPress = null;
          if (ev.pointerType === "mouse") return tjTipHide();
          var el = tjTipTarget(ev.target);
          if (!el || !el.closest(".tz-page")) return;
          if (el.closest(".tz-nav")) return; // the tabs of the side bar always act on tap (the names are one tap away with the arrow)
          var p = (tjTipPress = { el: el, x: ev.clientX, y: ev.clientY, shown: false });
          clearTimeout(tjTipTimer);
          tjTipTimer = setTimeout(function () {
            if (tjTipPress !== p) return;
            p.shown = true;
            tjTipShow(el, 0);
          }, TJ_TIP_PRESS_MS);
        }, true);
        window.addEventListener("pointermove", function (ev) {
          if (tjTipPress && !tjTipPress.shown && Math.hypot(ev.clientX - tjTipPress.x, ev.clientY - tjTipPress.y) > 10) {
            clearTimeout(tjTipTimer);
            tjTipPress = null;
          }
        }, true);
        function endPress(ev) {
          if (blockIfHelp(ev)) return;
          var p = tjTipPress;
          tjTipPress = null;
          clearTimeout(tjTipTimer);
          if (p && p.shown) {
            tjTipSwallowUntil = Date.now() + 700; // this touch's click does not trigger
            tjTipHideTimer = setTimeout(tjTipHide, 3500);
          }
        }
        window.addEventListener("pointerup", endPress, true);
        window.addEventListener("pointercancel", function () {
          tjTipPress = null;
          clearTimeout(tjTipTimer);
        }, true);
        window.addEventListener("click", function (ev) {
          if (blockIfHelp(ev)) return;
          if (Date.now() < tjTipSwallowUntil) {
            tjTipSwallowUntil = 0;
            ev.stopPropagation();
            ev.preventDefault();
          }
        }, true);
        // Mantener apretado en tactil abre el menu contextual de Chromium.
        window.addEventListener("contextmenu", function (ev) {
          if (ev.target.closest && ev.target.closest(TJ_TIP_ROOTS)) ev.preventDefault();
        }, true);
        window.addEventListener("scroll", tjTipHide, true);
      }

      tjTipInstall();
