      // Gear button for the jog's header (plain text: the kiosk font
      // does not always carry symbols; the gear is an SVG).
      function jogAjMakeGearBtn() {
        var b = document.createElement("button");
        b.type = "button";
        b.title = i18nT('settings.jog_settings');
        b.innerHTML =
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="pointer-events:none;display:block"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 13.92 2h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.72 8.47a.48.48 0 0 0 .12.61l2.03 1.58c-.04.31-.07.63-.07.94s.03.63.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>';
        b.style.cssText =
          "width:22px;height:20px;border-radius:4px;border:none;background:rgba(255,255,255,0.15);color:#fff;padding:0;cursor:pointer;touch-action:none;margin-right:4px;flex:none;display:inline-flex;align-items:center;justify-content:center;";
        b.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        b.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          jogAjOpenSheet();
        });
        b.style.position = "relative";
        b.appendChild(jogStartupDotMake()); // orange dot while the start-up has steps left (19-startup.js)
        return b;
      }

      // Optional A- / A+ buttons in the bar, next to the gear (2026-10-21). Off by default; the switch is in Settings > Look and belongs to
      // THIS screen (localStorage). The slider in the settings keeps working either way.
      var JOG_ZOOM_BAR_KEY = "workshopJogZoomInBar";
      var jogZoomBarEl = null;
      function jogZoomBarOn() {
        try {
          return localStorage.getItem(JOG_ZOOM_BAR_KEY) === "1";
        } catch (e) {
          return false;
        }
      }
      function jogZoomBarSet(on) {
        try {
          localStorage.setItem(JOG_ZOOM_BAR_KEY, on ? "1" : "0");
        } catch (e) {
          /* not critical */
        }
        if (jogZoomBarEl) jogZoomBarEl.style.display = on ? "inline-flex" : "none";
      }
      function jogZoomBarMake() {
        var wrap = document.createElement("span");
        wrap.style.cssText = "display:" + (jogZoomBarOn() ? "inline-flex" : "none") + ";gap:2px;margin-right:4px;";
        [["A-", -JOG_SCALE_STEP, "jog.zoom_smaller"], ["A+", JOG_SCALE_STEP, "jog.zoom_bigger"]].forEach(function (d) {
          var b = document.createElement("button");
          b.type = "button";
          b.textContent = d[0];
          b.title = i18nT(d[2]);
          b.style.cssText = "min-width:24px;height:20px;border-radius:4px;border:none;background:rgba(255,255,255,0.15);color:#fff;padding:0 3px;cursor:pointer;touch-action:none;font-size:11px;font-weight:bold;line-height:18px;";
          b.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
          });
          b.addEventListener("pointerup", function (ev) {
            ev.stopPropagation();
            jogApplyScale(jogScale + d[1]);
          });
          wrap.appendChild(b);
        });
        jogZoomBarEl = wrap;
        return wrap;
      }

      // The gear goes right after the first element of the header, the optional zoom right after the gear.
      function jogGearMount(header) {
        header.insertBefore(jogAjMakeGearBtn(), header.firstChild.nextSibling);
        header.insertBefore(jogZoomBarMake(), header.firstChild.nextSibling.nextSibling);
      }
