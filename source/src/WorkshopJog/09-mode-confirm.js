      // ---- A mode button of the jog waits for the model (same rule as the bar: WorkshopControlBar/15-buttons-mode.js btnModeConfirm) ----
      // The macros of the mode (Modo Laser / CNC / FFF) answer "ok" before the machine really changes: after sending one, the model (state.machineMode,
      // read by the status poll of the jog) is looked at every 500 ms for up to 10 s; if it did not become the target a short note says so.

      var JOG_MODE_MACROS = { "mode/selectlaser.g": "Laser", "mode/selectcnc.g": "CNC", "mode/selectfff.g": "FFF" };
      var JOG_MODE_CONFIRM_MS = 10000;
      var JOG_MODE_LOOK_MS = 500;

      // Pure: the mode a macro or a G-code line (M98 P"0:/macros/mode/selectcnc.g") selects, or "" when it is not a mode macro
      function jogModeTargetOf(codeOrAction) {
        var m = String(codeOrAction || "").replace(/^\/+/, "").match(/(?:^|[/"])(mode\/select(?:laser|cnc|fff)\.g)"?\s*$/i);
        return m ? JOG_MODE_MACROS[m[1].toLowerCase()] || "" : "";
      }

      // Pure: what the wait says at this moment: "ok" (the model shows the target), "late" (10 s passed) or "wait"
      function jogModeConfirmState(current, target, elapsedMs) {
        if (current === target) return "ok";
        return elapsedMs > JOG_MODE_CONFIRM_MS ? "late" : "wait";
      }

      // Sends a macro of a button; a mode macro also waits for the model and says so (notify = the note of the button) when the mode did not change
      function jogPostMacro(code, label, notify) {
        var target = jogModeTargetOf(code);
        return postCode(code)
          .then(function () {
            if (!target) return;
            jogModeWatch(target, function () { return jogMachineMode; }, function (now) {
              notify(i18nT("jog.mode_not_changed", { mode: now || "?" }));
            });
          })
          .catch(function (e) {
            console.error("[WorkshopJog] error in macro '" + label + "':", e);
          });
      }

      // Waits for the model; onLate(current) is called once when the mode did not change in time. Returns the stop function.
      function jogModeWatch(target, readMode, onLate) {
        var t0 = Date.now();
        var timer = null;
        var stopped = false;
        function look() {
          if (stopped || pluginStopped) return;
          var s = jogModeConfirmState(readMode(), target, Date.now() - t0);
          if (s === "ok") return;
          if (s === "late") return onLate(readMode());
          timer = setTimeout(look, JOG_MODE_LOOK_MS);
        }
        look();
        return function () {
          stopped = true;
          clearTimeout(timer);
        };
      }
