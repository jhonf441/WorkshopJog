      // ---- Touch screens: sizes, no-scroll rules and the STOP / E-STOP row of the jog (F0, 2026-10-21) ----
      //
      // DESIGN.md: the Emergency stop is never blocked and never asks for confirmation. It is a protection action in RRF
      // (M112), so it fires on the first touch (pointerdown) and its buttons are at least JOG_TOUCH_STOP_PX high.

      var JOG_TOUCH_STOP_PX = 44; // STOP / E-STOP height on a touch screen
      var JOG_TOUCH_MIN_PX = 44; // nothing that is touched is smaller (a finger needs 44 px; was 32)
      var JOG_TOUCH_STYLE_ID = "emergency-fab-jog-touch-css";
      var JOG_PHONE_PX = 600; // under this width (a phone) the panel starts folded and its buttons are 44 px

      // A touch screen (phone, tablet, kiosk): the main pointer is coarse. No user-agent sniffing.
      function jogIsTouch() {
        try {
          return !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches === true;
        } catch (e) {
          return false;
        }
      }

      // The side of a header button (layout, settings, minimize, size): 44 px for a finger, 30 px for a mouse (the header holds more there: role chip, help).
      function jogHeaderBtnPx() {
        return jogIsTouch() ? 44 : 30;
      }

      // A phone-width window: the floating panel must not stay open over the page.
      function jogIsPhone() {
        return window.innerWidth < JOG_PHONE_PX;
      }

      // Height of a touched control: at least JOG_TOUCH_MIN_PX on a touch screen, the given one otherwise.
      function jogTouchPx(px) {
        return jogIsTouch() ? Math.max(px, JOG_TOUCH_MIN_PX) : px;
      }

      // Smallest letter of the text that is touched: 11 px on a touch screen.
      function jogTouchFontMin(px) {
        return jogIsTouch() ? Math.max(px, 11) : px;
      }

      // Rules for the jog panel: nothing dragged on it moves the page behind, and on a touch screen the touched
      // controls are at least 32 px high with letters of at least 11 px (inline styles are overridden with !important).
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
          "@media (pointer: coarse){",
          // every touched control is at least 44 x 44 px (a finger), and the buttons that sit in a row have 12 px between them
          P + " button,\n" + P + " select,\n" + P + " input:not([type=range]):not([type=checkbox]){min-height:" + JOG_TOUCH_MIN_PX + "px!important;}",
          P + " button{min-width:" + JOG_TOUCH_MIN_PX + "px;}",
          P + " :is(div,span):has(> button){gap:12px!important;}",
          // the header holds four buttons that always show (layout, settings, minimize, size): with 44 px buttons and 12 px between them nothing else
          // fits in the width of the panel, so on a touch screen the role chip, the "?" help and the full screen button give way
          P + " [data-jog-header-info] > button," + P + " [data-jog-h-area=\"header\"] > button{display:none!important;}", // the informing chips give way (the actions are in their own group)
          P + " [data-jog-h-area=\"header\"]{gap:4px!important;padding:0 6px!important;}", // the group of actions has its own 12 px between buttons
          small.join(",\n") + "{font-size:11px!important;}",
          "}",
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
          "min-width:" + JOG_TOUCH_STOP_PX + "px",
          "height:" + (jogIsTouch() ? JOG_TOUCH_STOP_PX : 30) + "px",
          "border-radius:6px",
          "border:" + border,
          "background:" + bg,
          "color:#fff",
          "font-size:" + (jogIsTouch() ? 14 : 12) + "px",
          "font-weight:bold",
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
