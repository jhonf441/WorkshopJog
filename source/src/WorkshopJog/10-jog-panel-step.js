      // ---- Jog panel: the Step tab (sections listed in 10-jog-panel.js) ----
      //
      // Jog by steps: choose axis + distance (slider with typical CNC pendant values), +/- moves exactly that distance only once
      // (G91/G1/G90 -- a bounded movement, not continuous, it does not need a watchdog nor to go through the jog's backend). It reuses the
      // SAME maximum speed as the slider above (jogMaxFeedXY/Z) instead of adding a third separate speed control.
      //
      // st is the explicit state of the Step tab of one panel:
      //   values     the distances (factory 0.01 .. 100, editable in Settings)
      //   axis       the chosen axis; index: the chosen distance (1 mm from the factory)
      //   axisRow / axisBtns   the row of axis buttons and the buttons by axis
      //   distLabel  repaints the chosen distance (jogStepCellsMount)
      //   queue      the steps in line, one after the other

      var JOG_STEP_HOLD_MS = 350;

      function jogPanelStep(jp) {
        var values = jogAjSteps();
        var st = { values: values, axis: "X", index: jogAjStepIndex(values), axisRow: null, axisBtns: {}, distLabel: null, queue: Promise.resolve() };
        jp.step = st;
        var stepSection = jp.stepSection;

        var stepAxisRow = document.createElement("div");
        stepAxisRow.style.cssText = "display:flex;gap:4px;width:100%;";
        stepSection.appendChild(stepAxisRow);
        stepAxisRow.style.flexWrap = "wrap";
        st.axisRow = stepAxisRow;
        jogStepAxesRender(st);
        jogAxesExtraHook = function () {
          jogStepAxesRender(st);
        };

        var stepDistRow = document.createElement("div");
        stepSection.appendChild(stepDistRow);
        st.distLabel = jogStepCellsMount(stepDistRow, st.values, function () {
          return st.index;
        }, function (i) {
          st.index = i;
        });

        var stepMoveRow = document.createElement("div");
        stepMoveRow.style.cssText = "display:flex;gap:4px;width:100%;";
        stepSection.appendChild(stepMoveRow);

        var stepMinusBtn = jogMakeSmallButton("-", i18nT('jog.tap_move_distance_hold_move_continuously'));
        var stepPlusBtn = jogMakeSmallButton("+", i18nT('jog.tap_move_distance_hold_move_continuously_2'));
        stepMoveRow.appendChild(stepMinusBtn);
        stepMoveRow.appendChild(stepPlusBtn);
        jogStepMinusBtn = stepMinusBtn;
        jogStepPlusBtn = stepPlusBtn;

        // Also used by the keyboard (short tap of an arrow / Page Up / Page Down).
        jogStepAxisFn = function (axis, sign) {
          return jogStepAxisMove(st, axis, sign);
        };
        jogStepApi = jogStepApiMake(st.values, {
          getIndex: function () { return st.index; },
          setIndex: function (i) { st.index = i; st.distLabel(); },
          getAxis: function () { return st.axis; },
          setAxis: function (a) { st.axis = a; jogStepAxisVisual(st); },
          move: jogStepAxisFn,
          cancel: function () { jogStepGen++; },
          pending: function () { return jogStepPendMm; },
        }); // what design 3 (12-jog3.js) needs of the Step tab
        jogStepPressWire(st, stepMinusBtn, -1);
        jogStepPressWire(st, stepPlusBtn, 1);
      }

      function jogStepAxisVisual(st) {
        Object.keys(st.axisBtns).forEach(function (ax) {
          jogSegPaint(st.axisBtns[ax], ax === st.axis);
        });
      }

      // X, Y, Z and the machine's extra axes (except those hidden in Settings)
      function jogStepAxesRender(st) {
        var ocultos = jogAjGet().axesHidden;
        var axes = jogBaseAxes.concat(
          jogAxesExtra.filter(function (L) {
            return ocultos.indexOf(L) < 0;
          })
        );
        if (!axes.length) axes = ["X", "Y", "Z"]; // a model with no axes yet: do not leave the tab empty
        if (axes.indexOf(st.axis) < 0) st.axis = axes[0];
        st.axisRow.textContent = "";
        st.axisBtns = {};
        axes.forEach(function (ax) {
          var btn = jogMakeSmallButton(ax, i18nT('jog.axis', { ax: ax }));
          btn.style.flex = "1 1 0";
          btn.style.minWidth = "28px";
          btn.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault(); // ver nota en viewBtn pointerdown (EmergencyFab camara)
          });
          btn.addEventListener("pointerup", function (ev) {
            ev.stopPropagation();
            st.axis = ax;
            jogStepAxisVisual(st);
          });
          st.axisBtns[ax] = btn;
          st.axisRow.appendChild(btn);
        });
        jogStepAxisVisual(st);
      }

      // One step of the chosen distance on `axis`.
      function jogStepAxisMove(st, axis, sign) {
        // The same "idle or busy" gate as the continuous jog -- see
        // jogCheckEnabled/jogSetControlsEnabled.
        if (!jogCanMove()) return jogCannotMoveExplain();
        jogNotifyWithoutHoming([axis]);
        var dist = sign * st.values[st.index];
        var feed = axis === "Z" ? jogMaxFeedZ() : jogMaxFeedXY();
        // extra axis: the jog's % over ITS RRF maximum (M203), without exceeding X/Y's
        if (jogIsAxisExtra(axis)) feed = Math.min(jogMaxFeedXY(), (jogAxisSpeed[axis] || jogMaxFeedZ()) * jogSpeedPercent / 100);
        // 2026-10-10 ("I press 3 times in a row and sometimes one or
        // two move"): each step was 3 loose requests (G91 / G1 / G90) and with quick
        // taps they got mixed up: one tap's G1 could arrive after
        // another's G90 and RRF took it as an ABSOLUTE position (rejected or
        // to elsewhere). Now each step is ONE block and they go in line.
        var block = jogBlockStep(jogMachineMode, [axis + dist.toFixed(3)], feed); // S0 only in Laser mode (09-mode.js)
        jogStepPendingN++;
        jogStepPendMm[axis] = (jogStepPendMm[axis] || 0) + dist;
        var gen = jogStepGen;
        st.queue = st.queue
          .then(function () {
            if (!jogCanMove()) return; // enable was let go while the step waited: it is not sent
            if (gen !== jogStepGen) return; // the finger left the wheel while the step waited: it is not sent
            return postCode(block);
          })
          .catch(function (e) {
            console.error("[WorkshopJog] error in step:", e);
          })
          .then(function () {
            jogStepPendingN--;
            jogStepPendMm[axis] -= dist;
            if (Math.abs(jogStepPendMm[axis]) < 1e-6) jogStepPendMm[axis] = 0;
          });
      }

      // Short tap (< JOG_STEP_HOLD_MS) = ONE step of the distance
      // chosen, as always. Held = continuous movement on that
      // axis at the speed of the MIN-MAX slider, until released (or
      // until the axis limit). The release is listened for on `window`
      // (the same reason as the knob: the finger can leave the button).
      function jogStepPressWire(st, btn, sign) {
        var holdTimer = null;
        var holding = false;
        var pid = null;
        function endPress(ev, cancelled) {
          if (pid === null || (ev && ev.pointerId !== pid)) return;
          pid = null;
          window.removeEventListener("pointerup", onUp, true);
          window.removeEventListener("pointercancel", onCancel, true);
          window.removeEventListener("blur", onBlur);
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
            if (!cancelled) jogStepAxisMove(st, st.axis, sign); // fue un toque
            return;
          }
          if (holding) {
            holding = false;
            var axis = jogStepHold && jogStepHold.axis;
            jogStepHold = null;
            btn.style.background = "#455a64";
            if (jogIsAxisExtra(axis)) postJogCommand("jog.stop_axis", { release: true });
            else if (axis === "Z") jogSendStopZ();
            else jogSendXYStateOrStop();
          }
        }
        function onUp(ev) {
          endPress(ev, false);
        }
        function onCancel(ev) {
          endPress(ev, true);
        }
        function onBlur() {
          endPress(null, true); // the screen lost focus: release
        }
        btn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault(); // ver nota en viewBtn pointerdown (EmergencyFab camara)
          if (btn.disabled || !jogCanMove() || pid !== null || jogStepHold) return;
          pid = ev.pointerId;
          // IN CAPTURE (true): the button's own pointerup does
          // stopPropagation, and on touch the event goes to the button (implicit
          // pointer capture) -- in the bubble phase it never reached window,
          // endPress did not run, the button stayed orange and the heartbeat kept
          // sending the movement up to the limit (bug 2026-10-08).
          window.addEventListener("pointerup", onUp, true);
          window.addEventListener("pointercancel", onCancel, true);
          window.addEventListener("blur", onBlur);
          holdTimer = setTimeout(function () {
            holdTimer = null;
            if (pid === null || !jogCanMove()) return;
            holding = true;
            jogStepHold = { axis: st.axis, sign: sign };
            btn.style.background = "#e65100";
            jogSendStepHold();
          }, JOG_STEP_HOLD_MS);
        });
        // Besides, the button itself ends the gesture (belt and braces: if
        // for whatever reason window's does not run, this one does).
        btn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          endPress(ev, false);
        });
        btn.addEventListener("pointercancel", function (ev) {
          endPress(ev, true);
        });
        btn.addEventListener("lostpointercapture", function (ev) {
          endPress(ev, true);
        });
        jogPanelTeardownFns.push(function () {
          window.removeEventListener("pointerup", onUp, true);
          window.removeEventListener("pointercancel", onCancel, true);
          window.removeEventListener("blur", onBlur);
          if (holdTimer) clearTimeout(holdTimer);
          if (holding) {
            holding = false;
            jogStepHold = null;
          }
        });
      }
