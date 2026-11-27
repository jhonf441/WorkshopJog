      // ---- Jog panel: the panel itself, the title bar, the status bar and the body (sections listed in 10-jog-panel.js) ----

      function jogPanelFrame(jp) {
        var panel = document.createElement("div");
        panel.id = JOG_PANEL_ID;
        jogTouchStyle(); // overscroll-behavior, minimum sizes on touch screens (16-touch.js)
        workshopInjectFamily(); // the design family (wf-* classes): the tabs and buttons of the panel
        panel.style.cssText = [
          "position:fixed",
          "width:" + JOG_PANEL_W + "px;max-width:calc(100vw - " + 2 * MARGIN + "px);max-height:calc(100vh - " + 2 * MARGIN + "px)", // never bigger than the window (the body scrolls inside)
          "z-index:2147483646", // one point below the sidebar (section 0), which stays ALWAYS on top
          "background:#263238",
          "color:#fff",
          "border:2px solid " + jogAjGet().border,
          "border-radius:10px",
          "box-shadow:0 2px 10px rgba(0,0,0,0.5)",
          "font-family:Roboto,Helvetica,Arial,sans-serif",
          "-webkit-user-select:none",
          "user-select:none",
          "overflow:hidden",
        ].join(";");
        jp.panel = panel;
      }

      // -- barra de titulo (handle de arrastre + minimizar) --
      function jogPanelHeader(jp) {
        var header = document.createElement("div");
        header.style.cssText = [
          "height:" + JOG_HEADER_H + "px", // the header buttons are 32 px seen (40 touched, 16-touch.js), 4 px of air above and below
          "flex:none",
          "background:transparent;border-bottom:1px solid rgba(255,255,255,0.12)",
          "display:flex",
          "align-items:center",
          "flex-wrap:nowrap",
          "gap:0",
          "padding:0 6px",
          "cursor:move",
          "touch-action:none",
          "font-size:12px",
        ].join(";");
        var title = document.createElement("span");
        title.textContent = i18nT('common.jog');
        title.style.cssText = "flex:none;white-space:nowrap;font-size:14px;font-weight:600;"; // one row always and the whole word, never an ellipsis (criteria C13.3): 2 px of header padding leave it its room at the narrowest size
        header.appendChild(title);

        // Only in a mobile viewport (a real phone, not the kiosk) -- see
        // isMobileViewport(). Explicit request: when opening DWC from a
        // phone, offer to enlarge the panel to full screen.
        if (isMobileViewport()) jogPanelFsButton(header);

        var minBtn = jogPanelMinButton();
        header.insertBefore(jogHelpButtonMake(), jogFsBtn && jogFsBtn.parentNode === header ? jogFsBtn : null); jogPanelTeardownFns.push(jogHelpClose); // "?": a legend to read, never a mode that changes the buttons (15-help.js)
        jogGearMount(header); // gear (settings) (15-gear.js)
        jogStartupMount(header, minBtn); // start-up chip, then the minimize button (19-startup.js)
        jp.panel.appendChild(header);
        jogHeaderEl = header;
        jp.header = header;
        // (the status lights are not shown in the jog header any more, 2026-10-13)
      }

      function jogPanelFsButton(header) {
        jogFsBtn = document.createElement("button");
        jogFsBtn.type = "button";
        jogFsBtn.title = i18nT('jog.full_screen');
        jogFsBtn.setAttribute("aria-label", i18nT('jog.full_screen'));
        jogFsPaint(false); // the icon, never the two letters F S (ux, 2026-11-23: an acronym nobody reads, DESIGN 6)
        jogFsBtn.style.cssText = [
          "width:" + jogHeaderBtnPx() + "px", // a header button like the others (one size for every pointer)
          "height:" + jogHeaderBtnPx() + "px",
          "border-radius:8px",
          "border:none",
          "background:rgba(255,255,255,0.15)",
          "color:#fff",
          "font-size:12px",
          "font-weight:bold",
          "line-height:18px",
          "padding:0",
          "cursor:pointer",
          "touch-action:none",
          "margin-right:4px",
        ].join(";");
        jogFsBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        jogFsBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          jogToggleFullscreen();
        });
        header.appendChild(jogFsBtn);
      }

      function jogPanelMinButton() {
        var minBtn = document.createElement("button");
        minBtn.type = "button";
        minBtn.setAttribute("data-jog-min", "");
        minBtn.title = i18nT('jog.minimize');
        minBtn.textContent = "–"; // guion/minus
        // 2026-10-16 ("the jog does not minimize on the Pi"): with the mouse it worked and with the finger it did not. The button measured 20 x 20 px:
        // the finger fell on the title bar (which drags the panel and captures the pointer) and the pointerup never reached
        // the button. Now it measures 40 x 32 px and also minimizes with touchend / click (only once per touch).
        minBtn.style.cssText = "flex:none;box-sizing:border-box;width:" + jogHeaderBtnPx() + "px;height:" + jogHeaderBtnPx() + "px;min-width:" + jogHeaderBtnPx() + "px;min-height:" + jogHeaderBtnPx() + "px;border-radius:8px;border:1px solid rgba(255,255,255,0.35);background:transparent;color:#fff;font-size:18px;line-height:1;padding:0;cursor:pointer;touch-action:manipulation;";
        var minLast = 0;
        function minTouch(ev) {
          ev.stopPropagation();
          if (ev.cancelable) ev.preventDefault();
          if (Date.now() - minLast < 700) return; // pointerup + touchend + click of the same tap
          minLast = Date.now();
          jogCollapse();
        }
        minBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault(); // ver nota en viewBtn pointerdown (EmergencyFab camara)
        });
        minBtn.addEventListener("pointerup", minTouch);
        minBtn.addEventListener("touchend", minTouch, { passive: false });
        minBtn.addEventListener("click", minTouch);
        return minBtn;
      }

      // -- fixed status bar (under the header, never scrolls): homing, blocks, warnings; then the body, the position card and the axis maximums --
      function jogPanelStatus(jp) {
        var panel = jp.panel;
        var jogStatusBar = document.createElement("div");
        jogStatusBar.style.cssText = "flex:none;width:100%;box-sizing:border-box;padding:6px 10px;background:#263238;border-bottom:1px solid rgba(255,255,255,0.12);display:flex;flex-direction:column;gap:4px;position:relative;";
        jogStatusBar.setAttribute("data-jog-h-area", "status");
        panel.appendChild(jogStatusBar);

        // -- cuerpo --
        var body = document.createElement("div");
        body.style.cssText = "padding:8px 8px 12px;display:flex;flex-direction:column;align-items:center;gap:8px;";
        // The header (drag + minimize) stays ALWAYS visible: what does
        // not fit on the screen scrolls inside the body, it does not push
        // the panel out of the window (see JOG_BODY_MAX_H).
        body.style.maxHeight = JOG_BODY_MAX_H;
        body.style.overflowY = "auto";
        body.style.overflowX = "hidden"; jogScrollMount(body); jogBlockedWatch(body); // thin scrollbar (16-touch.js), explain a blocked touch (17-role.js)
        panel.appendChild(body);
        jogBodyEl = body;

        var statusThe = document.createElement("div");
        statusThe.style.cssText = "font-size:12px;line-height:1.35;color:#b0bec5;overflow-wrap:break-word;"; // the whole text, wrapping (ux 2026-11-23: a 32 px box cut it at half a line)
        jogStatusBar.appendChild(statusThe);
        jogStatusEl = statusThe;
        jogNoticeEl = document.createElement("div");
        jogNoticeEl.style.cssText = "display:none;width:100%;box-sizing:border-box;padding:6px;border-radius:6px;background:#3d3016;border:1px solid var(--wf-n-down-text,#ffb74d);color:#ffe0b2;font-size:12px;font-weight:bold;line-height:1.35;text-align:center;";
        jogStatusBar.appendChild(jogNoticeEl);
        // Position: at the top, before the controls, the same in both options (13-position.js)
        var jogPosT = jogPosCard();
        body.appendChild(jogPosT.mini); // the compact position/speed bar that pins when the card scrolls away (13-position.js)
        body.appendChild(jogPosT.card);

        // Maximum speed CONFIGURED per axis (M203, read from the object
        // model in jogCheckEnabled) -- it is not the jog's speed itself
        // (that is already seen in jogStatusEl), it is the real ceiling RRF is going to
        // respect whatever this panel asks for, so that the user knows
        // beforehand how far each axis can go.
        var axisMaxThe = document.createElement("div");
        axisMaxThe.style.cssText = "font-size:12px;color:rgba(255,255,255,0.4);text-align:center;";
        axisMaxThe.textContent = i18nT('jog.axis_max');
        body.appendChild(axisMaxThe);
        jogAxisMaxEl = axisMaxThe;
        jp.statusBar = jogStatusBar;
        jp.body = body;
        jp.statusEl = statusThe;
        jp.posT = jogPosT;
        jp.axisMaxEl = axisMaxThe;
      }
