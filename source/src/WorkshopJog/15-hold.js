      // ---- "Hold to enable": on a touch screen the jog moves only while a button is held (the three designs) ----
      //
      // Safety (2026-11-10): on a touch screen no control of the jog moves the machine unless the "Hold to enable" button is being pressed, and
      // letting go stops what is moving. A mouse cannot hold a button and use another control at the same time, so with a mouse the old gate
      // (machine state only) stays. The gate is jogCanMove(): the machine state (jogEnabled, 10-jog.js) AND this button. STOP, E-STOP and Home do not
      // go through it (STOP has to work always; Home has its own two-tap confirmation). The software STOP does not replace the machine's physical
      // stop: it is a soft stop of the jog only.

      var jogHold = { held: false, btns: [] };

      // Whether this screen needs the button for the jog to move.
      function jogHoldMode() {
        return jogIsCoarse();
      }

      // Whether the button allows moving now.
      function jogHoldOk() {
        return !jogHoldMode() || jogHold.held;
      }

      // The ONE gate of every movement control: the machine is ready and the button allows it.
      function jogCanMove() {
        return jogEnabled && jogHoldOk();
      }

      // A control that cannot move now never ends silent (user report 2026-11-11: "I try to move the controls and they go back to their place"):
      // the machine, the service, the session or the role say why in the status line (and the sign-in opens when nobody is signed in); on a touch
      // screen without the button held, the note says to hold it. Once every 1.5 s, so a finger that keeps touching does not repeat it.
      // Returns `result`, so a guard can be `return jogCannotMoveExplain(false);` on its own line.
      var jogExplainAt = 0;
      function jogCannotMoveExplain(result) {
        var now = Date.now();
        if (now - jogExplainAt < 1500) return result;
        jogExplainAt = now;
        if (!jogEnabled || !jogRoleNow().move) jogBlockedExplain();
        else if (!jogHoldOk() && typeof jogShowNotice === "function") jogShowNotice(i18nT("pendant.hold_to_enable_note"), 3000);
        return result;
      }

      // Everything that shows the state of the button or depends on it is painted again.
      function jogHoldRepaint() {
        var on = jogHoldOk();
        jogHold.btns.forEach(function (b) {
          if (!b.isConnected) return;
          b.setAttribute("data-on", on ? "1" : "0");
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        jogSetControlsEnabled(jogEnabled);
        if (typeof jogPendantPaint === "function") jogPendantPaint(null);
      }

      // Held / let go. Letting go is a soft stop of everything the jog is doing.
      function jogHoldSet(held) {
        if (jogHold.held === held) return;
        jogHold.held = held;
        if (!held && jogHoldMode()) {
          jogStopAll(); // 16-touch.js
          jogReleaseAllHolds();
        }
        jogHoldRepaint();
      }

      // The button. `text` is its label. Pressed = enabled.
      function jogHoldButtonMake(text) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-jog-hold", "");
        b.setAttribute("data-tip-pass", "1");
        b.className = "wf-btn";
        b.textContent = text;
        b.style.cssText = "box-sizing:border-box;min-height:44px;min-width:44px;font-weight:700;touch-action:none;-webkit-user-select:none;user-select:none;width:100%;";
        var pid = null;
        function end(ev) {
          if (pid === null || (ev && ev.pointerId !== pid)) return;
          pid = null;
          jogHoldSet(false);
        }
        b.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          pid = ev.pointerId;
          try {
            b.setPointerCapture(pid);
          } catch (e) {
            /* it still ends with the events below */
          }
          jogHoldSet(true);
        });
        b.addEventListener("pointerup", end);
        b.addEventListener("pointercancel", end);
        b.addEventListener("lostpointercapture", end);
        jogHold.btns.push(b);
        b.setAttribute("data-on", "0");
        return b;
      }

      // The window loses the focus or the jog closes: nothing stays enabled.
      function jogHoldReset() {
        jogHold.held = false;
        jogHoldRepaint();
      }

      // The hold-to-enable button in the dock (touch screens only), between STOP (bottom left corner) and E-STOP.
      function jogHoldDockMount(stopRow) {
        if (!jogIsCoarse()) return;
        var btn = jogHoldButtonMake(i18nT("pendant.hold_to_enable"));
        btn.style.cssText += ";width:auto;min-width:0;height:" + JOG_TOUCH_STOP_PX + "px;min-height:" + JOG_TOUCH_STOP_PX + "px;font-size:12px;line-height:1.15;padding:0 4px;white-space:normal;";
        stopRow.style.gridTemplateColumns = "minmax(0,1fr) minmax(0,1.5fr) minmax(0,1fr)"; // STOP, the two-line hold label, E-STOP
        stopRow.insertBefore(btn, stopRow.lastChild);
      }
