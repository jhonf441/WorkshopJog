      // ---- Size of the floating panel: the state and what it does to the panel (the numbers are 09-size.js, the handle is 15-size-handle.js) ----

      var JOG_SIZE_STYLE_ID = "workshop-jog-size-css";
      // size = the saved {w, h} or null (the original size); handle = the corner element; drag = { id, x, y, w, h, moved } while a finger or the
      // mouse holds it; tap = the last tap on it (for the double tap that gives the original size back)
      // natural = { h, scale }: the outer height of the panel as tall as the content of the open tab, measured at that zoom (null = not yet);
// dirty = it has to be measured again (the tab or the content changed); watch = the MutationObserver of the body, wait = a re-measure is queued
var jogSizeState = { size: null, handle: null, drag: null, tap: null, natural: null, dirty: true, watch: null, wait: false };

      // What the panel is made of (see jogSizeChromeH): the header is 36 px, the status bar and the dock are estimates (the real ones change with
      // the notices and with the touch screen), and the strip of the handle does not zoom.
      function jogSizeChrome() {
        return { header: 36, status: JOG_STATUS_BAR_H, dock: JOG_STOP_DOCK_H, foot: JOG_SIZE_FOOT_H, natural: jogSizeState.natural };
      }

      function jogSizeWin() {
        return { vw: window.innerWidth, vh: window.innerHeight, margin: MARGIN, zone: jogZoneEmergency() };
      }

      // Writes a style only when it changes: jogReclampPanel calls this on every change of the panel, and an equal value must not wake the
      // ResizeObserver that watches the panel.
      function jogSizeStyleSet(el, prop, value) {
        if (el.style[prop] !== value) el.style[prop] = value;
      }

      // How tall the panel is with all the content of the open tab, at the zoom it has now: the size is taken off for a moment (the attribute,
      // the height, the limit of the body), the height is read and everything is put back, all in one go (nothing is painted in between).
      // Returns false when it cannot be measured (the panel is hidden): the last measure stays.
      function jogSizeMeasure() {
        var panel = jogPanelEl;
        var js = jogSizeState;
        var sized = panel.getAttribute("data-jog-sized") !== null;
        var height = panel.style.height;
        var maxH = jogBodyEl.style.maxHeight;
        // the body is shown whole for a moment: the browser clamps its scroll to 0 then, so the place the person had scrolled to is kept and put back
        var scrolled = jogBodyEl.scrollTop;
        panel.removeAttribute("data-jog-sized");
        panel.style.height = "";
        jogBodyEl.style.maxHeight = "";
        var h = panel.offsetHeight;
        // what has to stay in view at the least: from the top of the panel to the end of the position and the controls to move, and the dock
        // (STOP / E-STOP); measured now, with the whole content shown, in the same px as h
        var essEl = jogBodyEl.querySelector("[data-jog-essential]");
        var ess = 0;
        if (essEl) {
          var top = panel.getBoundingClientRect().top;
          ess = Math.ceil(essEl.getBoundingClientRect().bottom - top) + (jogStopDockEl ? Math.ceil(jogStopDockEl.getBoundingClientRect().height) : 0) + JOG_SIZE_ESS_GAP;
        }
        panel.style.height = height;
        jogBodyEl.style.maxHeight = maxH;
        if (sized) panel.setAttribute("data-jog-sized", "");
        if (scrolled) jogBodyEl.scrollTop = scrolled;
        if (!(h > 0)) return false;
        js.natural = { h: h, scale: jogScale, ess: ess };
        js.dirty = false;
        return true;
      }

      // Puts the panel at its size: the zoom of the header, the body and the dock, the width, the height (or none) and the limit of the body.
      // The lowest height and the highest zoom come from the content as it is (jogSizeMeasure), measured again when the tab or the content
      // changed or the zoom is not the one measured. Safe to call at any time: the full screen scales the panel by itself, so it does nothing.
      function jogSizeApply() {
        var panel = jogPanelEl;
        if (!panel || !jogBodyEl || panel.dataset.fsLock === "1") return;
        for (var pass = 0; pass < 3; pass++) {
          jogSizeApplyOnce(panel);
          var js = jogSizeState;
          // while the corner is being dragged the zoom changes at every move, and the content at another zoom is the same drawing (09-size.js
          // jogSizeNaturalAt takes it linearly): it is not measured again then (two forced layouts per move froze the page); it is when the finger lets go
          if (!js.dirty && js.natural && (js.drag || js.natural.scale === jogScale)) return;
          var before = js.natural;
          if (!jogSizeMeasure()) return;
          if (before && before.h === js.natural.h && before.scale === js.natural.scale) return;
        }
        jogSizeApplyOnce(panel);
      }

      function jogSizeApplyOnce(panel) {
        var chrome = jogSizeChrome();
        var fit = jogSizeFit(jogSizeState.size, jogSizeWin(), chrome);
        jogScale = fit.scale;
        [jogHeaderEl, jogBodyEl, jogStopDockEl].forEach(function (el) {
          if (el) jogSizeStyleSet(el, "zoom", String(fit.scale));
        });
        jogSizeStyleSet(panel, "width", fit.w - JOG_SIZE_BORDER + "px"); // the border is outside the style width and height
        jogSizeStyleSet(panel, "height", fit.h ? fit.h - JOG_SIZE_BORDER + "px" : "");
        if (fit.h) panel.setAttribute("data-jog-sized", "");
        else panel.removeAttribute("data-jog-sized");
        jogSizeStyleSet(jogBodyEl, "maxHeight", jogSizeBodyMax(fit, chrome, MARGIN));
      }

      // The tab or the content of the body changed: the measure is old. Looks at what is added, removed or written as text, and at a change
      // of display (a tab, a section, a notice); the knob and the tracks move with style too and do not count. One re-measure at a time,
      // after a short wait; writing an equal style changes nothing (jogSizeStyleSet), so this cannot loop.
      function jogSizeWatch(body) {
        var js = jogSizeState;
        if (js.watch) js.watch.disconnect();
        js.watch = null;
        if (typeof MutationObserver === "undefined") return;
        var shown = function (v) {
          var m = /display:s*([^;]*)/.exec(v || "");
          return m ? m[1].trim() : "";
        };
        // Only text nodes written or replaced do not count: the live values (position, speeds, clock) are rewritten dozens of times a second
        // (measured on the kiosk 2026-11-04: ~80 per second) and every re-measure forces a layout of the whole panel -- that alone was the biggest
        // consumer of the kiosk page. A value that grows a line is seen by the ResizeObserver of the panel.
        var onlyText = function (m) {
          var nodes = Array.prototype.slice.call(m.addedNodes).concat(Array.prototype.slice.call(m.removedNodes));
          return nodes.every(function (n) {
            return n.nodeType === 3;
          });
        };
        js.watch = new MutationObserver(function (list) {
          var real = list.some(function (m) {
            if (m.type === "characterData") return false;
            if (m.type === "childList") return !onlyText(m);
            return m.target !== body && shown(m.oldValue) !== shown(m.target.getAttribute("style"));
          });
          if (!real || js.wait) return;
          js.wait = true;
          setTimeout(function () {
            js.wait = false;
            js.dirty = true;
            jogReclampPanel(); // applies the size first (measures again) and keeps the panel in the window
          }, JOG_SIZE_WATCH_MS);
        });
        js.watch.observe(body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "hidden", "class"], attributeOldValue: true });
      }

      // Remembers the size of this screen.
      function jogSizeSave(size) {
        try {
          localStorage.setItem(JOG_SIZE_KEY, JSON.stringify({ w: size.w, h: size.h }));
        } catch (e) {
          /* not critical: it is just not remembered */
        }
      }

      // Back to the original size: the width of the drawing and the height of the content. Forgets the saved one.
      function jogSizeReset(js) {
        js.size = null;
        try {
          localStorage.removeItem(JOG_SIZE_KEY);
        } catch (e) {
          /* not critical */
        }
        jogSizeApply();
        jogReclampPanel();
      }

      // The rules that need the panel's attributes (CSS, because the open / closed state of the panel is its inline display):
      //  - a panel with a height of its own is a column and its body takes what is left and scrolls inside;
      //  - the full screen (data-fs-lock) has no corner to drag (the strip of the handle is not shown) and scales its body by itself.
      function jogSizeStyle() {
        if (document.getElementById(JOG_SIZE_STYLE_ID)) return;
        var P = "#" + JOG_PANEL_ID;
        var free = ':not([data-fs-lock="1"])';
        var st = document.createElement("style");
        st.id = JOG_SIZE_STYLE_ID;
        st.textContent = [
          P + "[data-jog-sized]" + free + "{display:flex;flex-direction:column;}",
          P + "[data-jog-sized]" + free + " > [data-jog-body]{flex:1 1 auto;min-height:0;max-height:none!important;}",
          P + '[data-fs-lock="1"] [data-jog-size-strip]{display:none;}',
        ].join("\n");
        document.head.appendChild(st);
      }

      // Called once the panel has its header, body and dock: reads the saved size, adds the strip with the handle under the dock and applies the
      // size (after the first layout, like the zoom always was).
      function jogSizeMount(panel) {
        var js = jogSizeState;
        jogSizeStyle();
        js.drag = null;
        js.tap = null;
        try {
          js.size = jogSizeRead(localStorage.getItem(JOG_SIZE_KEY));
        } catch (e) {
          js.size = null;
        }
        js.natural = null;
        js.dirty = true;
        js.wait = false;
        jogBodyEl.setAttribute("data-jog-body", "");
        var strip = document.createElement("div");
        strip.setAttribute("data-jog-size-strip", "");
        strip.style.cssText = "flex:none;position:relative;width:100%;height:" + JOG_SIZE_FOOT_H + "px;touch-action:none;";
        strip.appendChild(jogSizeHandleMake(js));
        panel.appendChild(strip);
        jogSizeWatch(jogBodyEl);
        setTimeout(function () {
          jogSizeApply();
          jogReclampPanel();
        }, 0);
      }
