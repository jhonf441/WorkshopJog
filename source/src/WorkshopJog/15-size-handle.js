      // ---- The size handle of the Jog panel: ONE button at the top right that cycles three sizes: S, M, W (state: 15-size.js, numbers: 09-wheel.js) ----
      //
      // Before there were three drag handles (corner, width, height) in a strip right under STOP / E-STOP, close to each other, and a missed touch
      // fired E-STOP (owner report 2026-11-06). Now there is one handle, in the corner opposite to STOP (STOP is at the bottom left, this is at the top
      // right), nothing that resizes or drags within 48 px of STOP, and a tap gives the next size. It is a plain click (a graze that moves is
      // not a click), so it cannot change the size by brushing it. The size is remembered on this screen (JOG_SIZE_KEY).

      var JOG_SIZE_HANDLE_ATTR = "data-jog-size-handle";

      // The size the handle shows now: the saved width of this layout (M when nothing was saved).
      function jogSizeHandleName(js) {
        return jogSizeNameOf(js.size && js.size.w ? js.size.w : jogSizeDefaultW());
      }

      function jogSizeHandlePaint(js) {
        var btn = jogHeaderEl && jogHeaderEl.querySelector("[" + JOG_SIZE_HANDLE_ATTR + "]");
        if (!btn) return;
        var name = jogSizeHandleName(js);
        if (btn.textContent !== name) btn.textContent = name;
        var words = i18nT("jog.resize_handle") + ": " + name;
        btn.title = words;
        btn.setAttribute("aria-label", words);
      }

      // One tap: the next size (S -> M -> W -> S). The height is always the content's (jogSizeApply caps it at 40 % of the visible area).
      function jogSizeCycle(js) {
        var panel = jogPanelEl;
        if (!panel || panel.dataset.fsLock === "1") return;
        var cur = js.size && js.size.w ? js.size.w : jogSizeDefaultW();
        js.size = { w: jogSizeCycleNext(cur).w, h: null };
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
        info.style.cssText = "flex:1 1 0;min-width:0;display:flex;align-items:center;gap:6px;overflow:hidden;";
        var actions = ["data-jog-size-handle", "data-jog-gear", "data-jog-min"];
        Array.prototype.slice.call(header.children).forEach(function (c) {
          var isAction = actions.some(function (a) { return c.hasAttribute(a); }) || c.classList.contains("wf-help-btn");
          if (!isAction) info.appendChild(c);
        });
        var group = document.createElement("span"); // the actions, always at the right and always in this order: help, size, settings, minimize
        group.setAttribute("data-jog-header-actions", "");
        group.style.cssText = "flex:none;display:flex;align-items:center;gap:" + (jogIsTouch() ? "12px;margin-left:4px;" : "4px;margin-left:8px;padding-left:8px;border-left:1px solid rgba(255,255,255,0.18);");
        var help = header.querySelector(".wf-help-btn");
        if (help) {
          // the "?" (help mode: tap a button to read what it does, the only way to see a tooltip on a touch screen) is a header button like the others
          var px = jogHeaderBtnPx();
          help.style.cssText = "flex:none;box-sizing:border-box;width:" + px + "px;height:" + px + "px;min-width:" + px + "px;min-height:" + px + "px;margin:0;padding:0;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;touch-action:manipulation;cursor:pointer;";
          group.appendChild(help);
        }
        actions.forEach(function (attr) {
          var b = header.querySelector("[" + attr + "]");
          if (b) group.appendChild(b);
        });
        header.appendChild(info);
        header.appendChild(group);
      }
