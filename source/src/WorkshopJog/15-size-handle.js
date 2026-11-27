      // ---- The size handle of the Jog panel: ONE button at the top right that cycles three sizes: S, M, W (state: 15-size.js, numbers: 09-wheel.js) ----
      //
      // Before there were three drag handles (corner, width, height) in a strip right under STOP / E-STOP, close to each other, and a missed touch
      // fired E-STOP (user report 2026-11-06). Now there is one handle, in the corner opposite to STOP (STOP is at the bottom left, this is at the top
      // right), nothing that resizes or drags within 48 px of STOP, and a tap gives the next size. It is a plain click (a graze that moves is
      // not a click), so it cannot change the size by brushing it. The size is remembered on this screen (JOG_SIZE_KEY).

      var JOG_SIZE_HANDLE_ATTR = "data-jog-size-handle";

      // The width the panel really has now (what jogSizeFit makes of the saved size in this window), not the saved one: in a low window the content
      // does not fit at a bigger zoom, so M and W both come out as S (2026-11-22: "M, W and S have no effect" on the tall pendant).
      function jogSizeFitW(size) {
        return jogSizeFit(size, jogSizeWin(), jogSizeChrome()).w;
      }

      // The presets that give a DIFFERENT width in this window, in cycle order starting after the current one; empty when the size cannot change.
      function jogSizeReachableNext(js) {
        var curW = jogSizeFitW(js.size);
        var start = jogSizeNearest(curW);
        var out = [];
        for (var k = 1; k <= JOG_SIZE_PRESETS.length; k++) {
          var i = (start + k) % JOG_SIZE_PRESETS.length;
          var w = jogSizeFitW({ w: JOG_SIZE_PRESETS[i], h: null });
          if (w !== curW && out.every(function (o) { return o.fit !== w; })) out.push({ i: i, fit: w });
        }
        return out;
      }

      // The size the handle shows now: the real width of the panel (S when the window only allows S).
      function jogSizeHandleName(js) {
        return jogSizeNameOf(jogSizeFitW(js.size && js.size.w ? js.size : { w: jogSizeDefaultW(), h: null }));
      }

      function jogSizeHandlePaint(js) {
        var btn = jogHeaderEl && jogHeaderEl.querySelector("[" + JOG_SIZE_HANDLE_ATTR + "]");
        if (!btn) return;
        var name = jogSizeHandleName(js);
        btn.style.display = ""; // always visible: S, M and W are always offered; a window too narrow for a wider panel keeps the name of the size it really has
        if (btn.textContent !== name) btn.textContent = name;
        var words = i18nT("jog.resize_handle") + ": " + name;
        btn.title = words;
        btn.setAttribute("aria-label", words);
      }

      // One tap: the next size (S -> M -> W -> S). The height is always the content's (jogSizeApply caps it at 40 % of the visible area).
      function jogSizeCycle(js) {
        var panel = jogPanelEl;
        if (!panel || panel.dataset.fsLock === "1") return;
        var next = jogSizeReachableNext(js)[0]; // the next size that really changes the panel in this window; none: nothing to do
        if (!next) return;
        js.size = { w: JOG_SIZE_PRESETS[next.i], h: null };
        js.natural = null;
        js.dirty = true;
        jogSizeApply();
        jogReclampPanel();
        jogSizeSave(js.size);
        jogSizeHandlePaint(js);
      }

      // The button. Same trick as the other header buttons: it stops its pointer events so the title bar does not drag with it.
      function jogSizeHandleMake(js) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute(JOG_SIZE_HANDLE_ATTR, "");
        b.className = "wf-btn";
        b.style.cssText = "flex:none;box-sizing:border-box;width:" + jogHeaderBtnPx() + "px;height:" + jogHeaderBtnPx() + "px;min-width:" + jogHeaderBtnPx() + "px;min-height:" + jogHeaderBtnPx() + "px;padding:0;font-size:13px;font-weight:700;touch-action:manipulation;color:#fff;border-color:rgba(255,255,255,0.35);";
        b.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          jogSizeCycle(js);
        });
        js.handle = b;
        return b;
      }

      // The header, in order: on the left the title and what only informs (role lock, help, full screen); on the right ONE group of actions, always in the
      // same order: size (S M W), settings (the gear), minimize. Before, each button was put where its file happened to
      // insert it. Called once the size handle exists (15-size.js, jogSizeMount).
      function jogHeaderOrder(header) {
        var info = document.createElement("span"); // the title and what only informs (role lock, full screen, "move without limits")
        info.setAttribute("data-jog-header-info", "");
        info.style.cssText = "flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:" + JOG_TOUCH_GAP_PX + "px;overflow:hidden;"; // the title and the padlock, on the left of the one row
        var actions = ["data-jog-size-handle", "data-jog-gear", "data-jog-min"];
        Array.prototype.slice.call(header.children).forEach(function (c) {
          var isAction = actions.some(function (a) { return c.hasAttribute(a); }) || c.classList.contains("wf-help-btn");
          if (!isAction) info.appendChild(c);
        });
        var group = document.createElement("span"); // the actions, always at the right and always in this order: help, size, settings, minimize
        group.setAttribute("data-jog-header-actions", "");
        group.style.cssText = "flex:none;display:flex;align-items:center;gap:" + JOG_TOUCH_GAP_PX + "px;"; // help, size, settings, minimize at the right of the same row
        var help = header.querySelector(".wf-help-btn");
        if (help) {
          // the "?" (a legend to read) is a header button like the others, in the same row (owner, 2026-11-23: the five buttons and the title always on one line).
          // Neutral like its neighbours (outline, white icon); open = filled blue with a WHITE icon, never the grey icon of the family on blue (criteria C10)
          var px = jogHeaderBtnPx();
          help.style.cssText = "flex:none;box-sizing:border-box;width:" + px + "px;height:" + px + "px;min-width:" + px + "px;min-height:" + px + "px;margin:0;padding:0;border-radius:8px;border:1px solid rgba(255,255,255,0.35);background:transparent;color:#fff;display:inline-flex;align-items:center;justify-content:center;touch-action:manipulation;cursor:pointer;";
          Array.prototype.forEach.call(help.querySelectorAll(".mdi"), function (ic) { ic.style.color = "inherit"; ic.style.fontSize = "18px"; });
          group.appendChild(help);
        }
        actions.forEach(function (attr) {
          var b = header.querySelector("[" + attr + "]");
          if (b) group.appendChild(b);
        });
        header.appendChild(info);
        header.appendChild(group);
        if (jogFsBtn && info.contains(jogFsBtn)) jogFsToStatusBar(header, jogFsBtn);
      }

      // The phone's full screen button is not a sixth header button (at 232 px the title, the padlock and five buttons are all the row holds, and the
      // padlock was cut off on a phone, 2026-11-23): it sits at the right end of the status bar, the same 36 px look.
      function jogFsToStatusBar(header, fs) {
        var sbar = header.parentNode && header.parentNode.querySelector("[data-jog-h-area=\"status\"]");
        if (!sbar) return;
        var px = jogHeaderBtnPx();
        fs.style.position = "absolute";
        fs.style.right = "6px";
        fs.style.top = "4px";
        fs.style.marginRight = "0";
        sbar.style.paddingRight = px + 12 + "px";
        sbar.appendChild(fs);
      }
