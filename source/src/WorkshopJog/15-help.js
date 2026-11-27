      // ---- The "?" of the title bar: a legend to READ, never a mode that changes what the buttons do (2026-11-10) ----
      //
      // The old help mode (12-tips.js) worked like this: tap "?", then tap any button to read what it does instead of pressing it. On a jog that is dangerous:
      // a tap that falls on a movement button while the mode is off (or after the 20 s it lasts) MOVES the machine. Now "?" swaps the CONTROLS of the panel for a legend of
      // the design in use, in the same place and the same dark look (nothing floats over the jog, and while it is shown there is no movement control to tap).
      // The hover tooltips of a mouse stay (hovering does nothing).

      var jogHelpView = null;

      // The rows [label, text] of the legend of a design (the keys are in i18n/*.json, group help).
      function jogHelpRows(style) {
        var common = [["help.l_stop", "help.t_stop"], ["help.l_estop", "help.t_estop"], ["help.l_enable", "help.t_enable"], ["help.l_home", "help.t_home"]];
        var own = {
          3: [["help.l_wheel", "help.t_wheel"], ["help.l_switches", "help.t_switches"], ["help.l_zero", "help.t_zero"], ["help.l_keys", "help.t_keys"], ["help.l_feed", "help.t_feed"]],
          4: [["help.l_band", "help.t_band"], ["help.l_hexes", "help.t_hexes"], ["help.l_wheel", "help.t_wheel"], ["help.l_pad", "help.t_pad"], ["help.l_speed", "help.t_speed"]],
        };
        var main = own[style] || [["help.l_move", "help.t_move"], ["help.l_step", "help.t_step"]];
        return main.concat(common).map(function (r) {
          return [i18nT(r[0]), i18nT(r[1])];
        });
      }

      function jogHelpClose() {
        if (jogHelpView && jogHelpView.parentNode) jogHelpView.parentNode.removeChild(jogHelpView);
        jogHelpView = null;
        if (jogBodyEl) jogBodyEl.style.display = "";
        var b = jogPanelEl && jogPanelEl.querySelector(".wf-help-btn");
        if (b) jogHelpPaint(b, false);
      }

      // open = filled blue with a white icon; closed = the outline of the other header buttons (criteria C10: never a grey icon on blue)
      function jogHelpPaint(b, open) {
        b.setAttribute("aria-expanded", open ? "true" : "false");
        b.style.background = open ? "#1976d2" : "transparent";
        b.style.borderColor = open ? "#1976d2" : "rgba(255,255,255,0.35)";
        b.style.color = "#fff";
      }

      // The legend, drawn in the panel's own colors (light text on the dark panel).
      function jogHelpViewMake() {
        var v = document.createElement("div");
        v.style.cssText = "padding:10px 12px;box-sizing:border-box;overflow-y:auto;max-height:" + JOG_BODY_MAX_H + ";color:#e3e8eb;font-size:12px;line-height:1.35;display:flex;flex-direction:column;gap:8px;";
        var t = document.createElement("div");
        t.style.cssText = "font-weight:700;font-size:13px;color:#fff;";
        t.textContent = i18nT("help.title");
        v.appendChild(t);
        jogHelpRows(jogAjGet().style).forEach(function (r) {
          var row = document.createElement("div");
          var k = document.createElement("div");
          // the term in the panel's own text color (owner, 2026-11-23: the help must read well): the accent lightened by a filter was pale on the light
          // theme (the light pass of _shared/03-theme.js darkens a text color, never a filter)
          k.style.cssText = "font-weight:700;font-size:13px;color:#fff;";
          k.textContent = r[0];
          var d = document.createElement("div");
          d.style.cssText = "color:#c5cdd2;";
          d.textContent = r[1];
          row.appendChild(k);
          row.appendChild(d);
          v.appendChild(row);
        });
        var n = document.createElement("div");
        n.style.cssText = "font-size:12px;color:#8e979e;border-top:1px solid rgba(255,255,255,0.15);padding-top:6px;";
        n.textContent = i18nT("help.safe");
        v.appendChild(n);
        return v;
      }

      // The "?" button: the standard look of the family, its own behavior (the legend takes the place of the controls).
      function jogHelpButtonMake() {
        var b = workshopHelpTipEl({ title: i18nT("help.title") }).cloneNode(true); // a clone has no listeners
        b.setAttribute("data-tip-pass", "1");
        b.setAttribute("aria-expanded", "false");
        b.style.cssText = "touch-action:manipulation;";
        b.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (jogHelpView) return jogHelpClose();
          if (!jogBodyEl || !jogBodyEl.parentNode) return;
          jogHelpView = jogHelpViewMake();
          jogBodyEl.style.display = "none";
          jogBodyEl.parentNode.insertBefore(jogHelpView, jogBodyEl.nextSibling);
          jogHelpPaint(b, true);
        });
        return b;
      }
