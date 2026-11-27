      // ---- Touch screens: sizes, no-scroll rules and the STOP / E-STOP row of the jog (F0, 2026-10-21) ----
      //
      // DESIGN.md: the Emergency stop is never blocked and never asks for confirmation. It is a protection action in RRF
      // (M112), so it fires on the first touch (pointerdown) and its buttons are at least JOG_TOUCH_STOP_PX high.

      // The scale of the family (informes/auditoria-diseno-23nov/FAMILIA-REDISENO.md 2, the owner's rule of 2026-11-23 that replaces "44 always"; the same
      // numbers as the tokens --wf-size-s / -m / -l, --wf-hit and --wf-gap-hit that front puts in design/family.css): what is seen is small, what is touched
      // is 40 (an invisible ::before), STOP / E-STOP are the one big thing. Tanda 1 of the Jog: keys 36 (m), header 32 (s), STOP / E-STOP 48 (l).
      var JOG_TOUCH_STOP_PX = 48; // --wf-size-l: STOP / E-STOP, never smaller, never behind a gate
      var JOG_TOUCH_MIN_PX = 36; // --wf-size-m: a key of the panel as it is seen (Home, steps, segments, macro buttons, fields)
      var JOG_HEADER_BTN_PX = 32; // --wf-size-s: the header buttons (padlock, help, size, settings, minimize) as they are seen
      var JOG_HIT_PX = 40; // --wf-hit: what every one of them is touched over (an invisible edge around it, jogTouchStyle)
      var JOG_TOUCH_GAP_PX = 8; // --wf-gap-hit: between controls, so the 40 px areas meet without overlapping
      var JOG_TOUCH_FONT_MIN_PX = 12; // the floor of the letters of the family
      var JOG_TOUCH_STYLE_ID = "emergency-fab-jog-touch-css";
      var JOG_PHONE_PX = 600; // under this width (a phone) the panel starts folded

      // One geometry for every pointer (project decision, 2026-11-21, kept by the compact rule above): the size of what is touched does not depend on
      // the pointer, because the 10-inch kiosk may report a fine one. This stays as the name of that rule for the layout code. What really depends on
      // the pointer (the hold-to-enable button, the phone full screen) uses jogIsCoarse().
      function jogIsTouch() {
        return true;
      }

      // A touch screen (phone, tablet, kiosk): the main pointer is coarse. No user-agent sniffing. Behavior only, never a size.
      function jogIsCoarse() {
        try {
          return !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches === true;
        } catch (e) {
          return false;
        }
      }

      // The side of a header button (padlock, help, size, settings, minimize) as it is seen: 32 px for any pointer, touched over 40.
      function jogHeaderBtnPx() {
        return JOG_HEADER_BTN_PX;
      }

      // A phone-width window: the floating panel must not stay open over the page.
      function jogIsPhone() {
        return window.innerWidth < JOG_PHONE_PX;
      }

      // Height of a touched control: at least JOG_TOUCH_MIN_PX.
      function jogTouchPx(px) {
        return Math.max(px, JOG_TOUCH_MIN_PX);
      }

      // Smallest letter of the text that is touched: 12 px (the floor of the family).
      function jogTouchFontMin(px) {
        return Math.max(px, JOG_TOUCH_FONT_MIN_PX);
      }

      // Rules for the jog panel: nothing dragged on it moves the page behind, its changes never make DWC lay out the whole page again, and the
      // touched controls follow the compact rule with letters of at least 12 px (inline styles are overridden with !important).
      function jogTouchStyle() {
        if (document.getElementById(JOG_TOUCH_STYLE_ID)) return;
        var P = "#" + JOG_PANEL_ID;
        var small = [];
        ["button", "input", "select"].forEach(function (t) {
          [6, 7, 8, 9, 10].forEach(function (n) {
            small.push(P + " " + t + '[style*="font-size:' + n + 'px"]', P + " " + t + '[style*="font-size: ' + n + 'px"]');
          });
        });
        var css = [
          P + ",\n" + P + " *{overscroll-behavior:contain;}",
          // criteria C13.7 (2026-11-23): a change inside the panel (the position every 100 ms, a label, a tab) stays inside it: no layout of the whole page
          P + "{contain:layout style paint;}",
          // every key is seen at 36 and touched over 40 (an invisible 2 px edge), with 8 px between them; a field or a select is 36 too
          // (the header and the status bar are left out: their 32 px buttons are inline, see below)
          P + " button:not([data-jog-h-area=\"header\"] button, [data-jog-h-area=\"status\"] > button),\n" + P + " select,\n" + P + " input:not([type=range]):not([type=checkbox]){min-height:" + JOG_TOUCH_MIN_PX + "px!important;}",
          P + " button:not([data-jog-h-area=\"header\"] button, [data-jog-h-area=\"status\"] > button){min-width:" + JOG_TOUCH_MIN_PX + "px;}",
          P + " :is(div,span):has(> button):not([data-jog-h-area=\"header\"] *, [data-jog-stops]){gap:" + JOG_TOUCH_GAP_PX + "px!important;}",
          P + " button:not([data-jog-h-area=\"header\"] button, [data-jog-h-area=\"status\"] > button, [data-jog-stop]){position:relative;}",
          P + " button:not([data-jog-h-area=\"header\"] button, [data-jog-h-area=\"status\"] > button, [data-jog-stop])::before{content:\"\";position:absolute;inset:-" + (JOG_HIT_PX - JOG_TOUCH_MIN_PX) / 2 + "px;}",
          // a row with a check box or a switch is touched over its whole label (the box keeps its drawn size)
          P + " label:has(> input[type=checkbox]){min-height:" + JOG_TOUCH_MIN_PX + "px;}",
          // the header is ONE row (15-size-handle.js jogHeaderOrder, owner 2026-11-23): the whole title on the left, the padlock and the four 32 px actions
          // (help, size, settings, minimize) on the right, 8 px apart
          P + " [data-jog-h-area=\"header\"] > button{display:none!important;}", // a stray button outside the two groups
          P + " [data-jog-h-area=\"header\"]{gap:" + JOG_TOUCH_GAP_PX + "px!important;padding:0 2px!important;}", // 2 px: the title "Jog" keeps its whole word at the narrowest size
          P + " [data-jog-h-area=\"header\"] button{position:relative;min-height:" + JOG_HEADER_BTN_PX + "px;min-width:" + JOG_HEADER_BTN_PX + "px;}",
          // seen at 32 px, touched over 40: the invisible edge reaches 4 px around each button, half of the 8 px gap (the edges never overlap)
          P + " :is([data-jog-h-area=\"header\"] button, [data-jog-h-area=\"status\"] > button)::before{content:\"\";position:absolute;inset:-" + (JOG_HIT_PX - JOG_HEADER_BTN_PX) / 2 + "px;}",
          P + " [data-jog-h-area=\"header\"] .help-tip::after{display:none;}", // the family's 44 px edge of the help icon would reach over the next buttons
          small.join(",\n") + "{font-size:" + JOG_TOUCH_FONT_MIN_PX + "px!important;}",
        ].join("\n");
        var st = document.createElement("style");
        st.id = JOG_TOUCH_STYLE_ID;
        st.textContent = css;
        document.head.appendChild(st);
      }

      // Scrollbar of the body of the panel: 4 px, faint, no track; with a finger (kiosk) none at all (scrolling by touch still works).
      function jogScrollMount(body) {
        body.className = "workshop-jog-scroll";
        if (document.getElementById("workshop-jog-scroll-css")) return;
        var st = document.createElement("style");
        st.id = "workshop-jog-scroll-css";
        st.textContent =
          ".workshop-jog-scroll::-webkit-scrollbar{width:4px;background:transparent}" +
          ".workshop-jog-scroll::-webkit-scrollbar-track{background:transparent}" +
          ".workshop-jog-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.22);border-radius:2px}" +
          "@media (pointer:coarse){.workshop-jog-scroll::-webkit-scrollbar{display:none}}";
        document.head.appendChild(st);
      }

      // STOP (soft stop, the same as releasing the knob) acts at once.
      function jogStopAll() {
        jogPointerId = null;
        if (jogKnobEl) jogKnobEl.style.transform = "translate(-50%,-50%)";
        if (jogRingEl) jogRingEl.style.boxShadow = "";
        jogSendStopXY();
        jogStopZHold();
      }

      // E-STOP: real RRF M112 (cuts everything; afterwards it needs M999 and a new homing). One touch, no confirmation.
      function jogEmergencyStop(btn) {
        btn.style.background = "#ff1744";
        setTimeout(function () {
          btn.style.background = "#b71c1c";
        }, 400);
        postCode("M112").catch(function (e) {
          console.error("[WorkshopJog] error sending M112:", e);
        });
      }

      function jogStopButton(label, title, bg, border, onTouch) {
        var b = document.createElement("button");
        b.type = "button";
        b.title = title;
        b.textContent = label;
        b.setAttribute("data-tip-pass", "1"); // works even in help mode (12-tips.js)
        b.setAttribute("data-jog-stop", ""); // nothing is dragged or resized within 48 px of it (15-pos.js)
        b.style.cssText = [
          "flex:1 1 0",
          "min-width:0", // a cell of the STOP row: the text stays on one line inside it, never past its column (note 11)
          "height:" + JOG_TOUCH_STOP_PX + "px",
          "border-radius:6px",
          "border:" + border,
          "background:" + bg,
          "color:#fff",
          "font-size:13px",
          "font-weight:600",
          "line-height:1",
          "padding:0 4px",
          "white-space:nowrap",
          "overflow:hidden",
          "cursor:pointer",
          "touch-action:none",
          "-webkit-user-select:none",
          "user-select:none",
        ].join(";");
        // pointerdown: the action starts with the first touch, not when the finger lifts
        b.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          onTouch();
        });
        // keyboard (Enter / Space) arrives as a click without a pointer
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (ev.detail === 0) onTouch();
        });
        return b;
      }

      function jogStopMount(stopRow) {
        stopRow.appendChild(jogStopButton("STOP", i18nT('jog.jog_stop_does_not_cut_the'), "#e65100", "none", jogStopAll));
        var eStopBtn = jogStopButton("E-STOP", i18nT('jog.real_emergency_m112_one_tap'), "#b71c1c", "2px solid #fff", function () {
          jogEmergencyStop(eStopBtn);
        });
        stopRow.appendChild(eStopBtn);
      }

      // Narrow screen (phone): the jog and the control bar do not fit side by side, so opening the jog closes the bar (_shared/40-launcher.js).
      function jogCloseSidebarIfNarrow() {
        workshopAnnouncePanelOpened("jog");
      }
