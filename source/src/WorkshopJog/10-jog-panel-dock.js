      // ---- Jog panel: the dock pinned under the body (quick Home / Z here, STOP / E-STOP) (sections listed in 10-jog-panel.js) ----

      // -- STOP / E-STOP: always visible at the very top (neither
      // of the two depends on jogEnabled/the active tab on purpose --
      // they have to work even if the panel is "disabled" by
      // machine state, which is precisely the case where they could be most
      // needed). See the discussion with the user 2026-10-08:
      // - STOP: "soft" stop, the same as releasing the
      //   knob/Z already triggers but with a single tap. It does NOT cut motors/heaters,
      //   it does NOT need M999 nor rehome. It still cannot cancel the
      //   segment RRF already accepted (the same limitation as always, see
      //   jog_move.py) -- useful above all for "advanced mode"
      //   (keyboard/wheel), where there is not always such a clean
      //   "release" event as with a touch button.
      // - E-STOP: real RRF M112. It cuts everything immediately but leaves
      //   the machine in an emergency state (it needs M999 + rehome
      //   afterwards). DESIGN.md: the emergency stop never asks for
      //   confirmation, so it fires on the first touch (16-touch.js).
      // Pinned under the body (not inside it): the stop buttons never scroll
      // out of view, in either design, whatever tab or section is open.
      function jogPanelDock(jp) {
        var jogDock = document.createElement("div");
        jogDock.style.cssText = "width:100%;box-sizing:border-box;flex:none;background:#263238;border-top:1px solid rgba(255,255,255,0.18);";
        jp.panel.appendChild(jogDock);
        jogStopDockEl = jogDock;
        jogSizeMount(jp.panel); // the saved size and the size handle in the header (15-size.js)
        jogHeaderOrder(jp.header); // layout, size, gear, minimize in one group at the right (15-size-handle.js)
        jogDock.style.touchAction = "none"; // dragging on the dock does not scroll the page behind
        jp.dock = jogDock;
      }

      // quick actions, always at hand (two taps: they move): Home (all), Home X / Y / Z, raise Z
      function jogPanelQuick(jp) {
        var jogQuick = document.createElement("div");
        // Home, X, Y, Z and Z here always on ONE line (owner, 2026-11-23): equal columns, compact like every button of a floating panel
        jogQuick.style.cssText = "display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:" + JOG_TOUCH_GAP_PX + "px;padding:10px 8px 0 8px;"; // one size for every pointer (2026-11-21)
        jp.dock.appendChild(jogQuick);
        var jogQH = jog2Helpers();
        var jogQCss = "min-height:" + jogTouchPx(30) + "px;border-radius:6px;font-size:13px;padding:0;min-width:0;overflow:hidden;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:2px;";
        [["Home", "G28", null], ["X", "G28 X", "X"], ["Y", "G28 Y", "Y"], ["Z", "G28 Z", "Z"]].forEach(function (h) {
          var qb = jogQH.buttonDouble(h[0], i18nT("pendant.tap_again"), jogQCss, function () {
            if (jogBlockedExplain()) return;
            postCode(h[1]).catch(function (e) { console.error("[WorkshopJog] home " + h[0] + ":", e); });
          });
          qb.title = h[2] ? i18nT('jog.home_axis', { axis: h[2] }) : i18nT('jog.home_all_axes_g28');
          // the house for every Home key and the bold letter of the axis, like the pendant (a narrow cell cut the word "Home" to "Ho..."); the words stay in aria-label and title
          jogHomeKeyFill(qb, h[2]);
          qb.setAttribute("aria-label", qb.title);
          if (h[2]) jogQHomeButtons[h[2]] = qb;
          jogQuick.appendChild(qb);
        });
        // the action is kept in jogZHereAct so the pendant (12-jog3p.js) runs the SAME one from its own keys: same blocked check, same G30, same notices
        jogZHereAct = jogZHereRun;
        var jogQZHere = jogQH.buttonDouble(i18nT('jog.z_here'), i18nT('jog.z_here_2'), jogQCss, function () { jogZHereAct(); });
        jogZHereBtn = jogQZHere;
        jogQZHere.title = i18nT('jog.z_here_help');
        // a cell like Home, X, Y, Z: the arrow onto the floor over the words "Z here" (an icon alone was not understood); aria-label and title say all
        jogZHereKeyFill(jogQZHere);
        jogQZHere.setAttribute("aria-label", i18nT('jog.z_here') + ": " + i18nT('jog.z_here_help'));
        jogQuick.appendChild(jogQZHere); // its own cell, on the same line as the four above
        jp.quick = jogQuick;
      }

      // Z here (2026-11-04, it replaced the Probe button): homes Z at the X and Y where the head is, with the Z probe (G30: it lowers Z until the probe
      // touches and sets Z there, without moving X or Y; G28 Z would first go to the probe point of homez.g). X and Y have to be homed (the point
      // means something), Z does not (this is what homes it). It moves Z down: two taps.
      function jogZHereRun() {
        if (jogBlockedExplain()) return;
        jogFetchStatus(600)
          .then(function (st) {
            var ax = (st && st.move && st.move.axes) || [];
            var without = ["X", "Y"].filter(function (L) {
              var a = ax.filter(function (x) { return x && x.letter === L; })[0];
              return !a || !a.homed;
            });
            if (without.length) return jogNotifyWithoutHoming(without);
            return postCode("G30")
              .then(function (r) { return r && r.text ? r.text() : ""; })
              .then(function (t) {
                var text = String(t || "").trim();
                jogShowNotice(/error|warning/i.test(text) ? text.slice(0, 140) : i18nT('jog.z_here_done'), 8000);
              });
          })
          .catch(function (e) { console.error("[WorkshopJog] z here:", e); });
      }

      // (2026-11-23: the old fit of these labels is gone. Its loop could never shrink the font -- it started at the 12 px floor -- so all it did was
      // clear the font size and read the layout of five buttons after every resize and every label change: forced reflows for nothing, note 15.
      // The labels are short: the house and a letter, the Z here icon, "Tap" while armed.)

      // STOP / E-STOP (and hold-to-enable between them on a touch screen): one row of equal cells of 48 px, the text on one line (note 11: E-STOP
      // could overflow its column). The hold button, a two-line label, is a little wider (15-hold.js sets the columns).
      function jogPanelStops(jp) {
        var stopRow = document.createElement("div");
        stopRow.setAttribute("data-jog-stops", "");
        stopRow.style.cssText = "display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:8px;width:100%;box-sizing:border-box;padding:6px 8px 8px 8px;";
        jp.dock.appendChild(stopRow);
        jogFreeMount(jp.body); // "Move without limits" + its notice, below STOP / E-STOP (11-free.js)

        jogStopMount(stopRow); // STOP + E-STOP (16-touch.js)
        jogHoldDockMount(stopRow); // a touch screen: the hold-to-enable button between STOP and E-STOP (15-hold.js)
        jp.stopRow = stopRow;
      }
