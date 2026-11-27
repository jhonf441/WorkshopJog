      // ---- Jog panel: Free / Straight, the two X / Y tracks of Straight mode and the knob (sections listed in 10-jog-panel.js) ----

      // The height of the knob; the X / Y tracks of Straight mode and the Z track take the same height so they line up.
      var JOG_RING_SIZE = 120;
      var JOG_TRACK_W = 32; // the width of every 1D track (X, Y of Straight mode and Z)
      // Axis "snapping" -- live request 2026-10-08: help
      // get straight movements in X/Y without losing the freedom of the
      // circle (unlike a separate "Straight" mode -- see below
      // -- this forces nothing, it only helps when the drag is already
      // CLOSE to a pure axis). If the angle of the vector with respect to the
      // nearest X or Y axis is less than JOG_SNAP_DEG, the other
      // component is forced to 0 -- the touch equivalent of a soft
      // magnet on each cardinal axis.
      var JOG_SNAP_DEG = 6;

      // -- X/Y mode: Free (circle, with axis snapping) or Straight
      // (two independent 1D sliders, total guarantee of a single
      // axis) -- live request 2026-10-08. The toggle lives above the
      // controls row so that it is seen before touching anything.
      function jogPanelAxisMode(jp) {
        var axisModeRow = document.createElement("div");
        axisModeRow.style.cssText = "display:flex;gap:4px;width:100%;";
        jp.body.appendChild(axisModeRow);

        var axisModeFreeBtn = jogMakeSmallButton(i18nT('jog.free'), i18nT('jog.the_usual_x_y_circle_with'));
        var axisModeRectoBtn = jogMakeSmallButton(i18nT('jog.straight'), i18nT('jog.x_and_y_as_separate_sliders'));
        axisModeRow.appendChild(axisModeFreeBtn);
        axisModeRow.appendChild(axisModeRectoBtn);

        // -- fila: perilla (o X/Y en modo Recto) | deslizante de Z --
        var row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;";
        jp.body.appendChild(row);
        jp.axisModeRow = axisModeRow;
        jp.axisModeFreeBtn = axisModeFreeBtn;
        jp.axisModeStraightBtn = axisModeRectoBtn;
        jp.row = row;
      }

      // Helper ONLY for the visual part (track + thumb) of a
      // 1D slider -- reused by X, Y (Straight mode) and Z. The event
      // wiring stays explicit and separate for each one (as it
      // already was for Z) instead of a more generic factory -- easier
      // to follow/debug than an abstraction with callbacks.
      function jogMakeAxisTrack(width, height, topLabel, bottomLabel, thumbSize) {
        var track = document.createElement("div");
        track.style.cssText = [
          "position:relative",
          "width:" + width + "px",
          "height:" + height + "px",
          "border-radius:" + Math.min(width, height) / 2 + "px",
          "background:#37474f",
          "border:2px solid rgba(255,255,255,0.3)",
          "touch-action:none",
          "flex:0 0 auto",
        ].join(";");
        [
          [topLabel, "top:2px;"],
          [bottomLabel, "bottom:2px;"],
        ].forEach(function (pair) {
          var lbl = document.createElement("span");
          lbl.textContent = pair[0];
          lbl.style.cssText =
            "position:absolute;left:50%;transform:translateX(-50%);font-size:12px;color:rgba(255,255,255,0.45);pointer-events:none;" +
            pair[1];
          track.appendChild(lbl);
        });
        var thumb = document.createElement("div");
        thumb.style.cssText = [
          "position:absolute",
          "left:50%",
          "top:50%",
          "width:" + thumbSize + "px",
          "height:" + thumbSize + "px",
          "border-radius:50%",
          "background:var(--wf-n-session-text,#90caf9)",
          "border:2px solid #fff",
          "box-shadow:0 1px 6px rgba(0,0,0,0.6)",
          "transform:translate(-50%,-50%)",
          "touch-action:none",
          "pointer-events:none",
        ].join(";");
        track.appendChild(thumb);
        return { track: track, thumb: thumb };
      }

      // -- X/Y in Straight mode: two independent 1D sliders.
      // Hidden by default (Free mode) -- jogApplyAxisMode
      // shows/hides them together with the circle.
      function jogPanelStraight(jp) {
        var xAxis = jogMakeAxisTrack(JOG_TRACK_W, JOG_RING_SIZE, "X+", "X-", 24);
        jogXTrackEl = xAxis.track;
        jogXThumbEl = xAxis.thumb;
        jogXTrackEl.style.display = "none";
        jp.row.appendChild(jogXTrackEl);

        var yAxis = jogMakeAxisTrack(JOG_TRACK_W, JOG_RING_SIZE, "Y+", "Y-", 24);
        jogYTrackEl = yAxis.track;
        jogYThumbEl = yAxis.thumb;
        jogYTrackEl.style.display = "none";
        jp.row.appendChild(jogYTrackEl);
        jogStraightXWire();
        jogStraightYWire();
      }

      function jogStraightFromEvent(ev, track, thumb, setVal) {
        var rect = track.getBoundingClientRect();
        var cy = rect.top + rect.height / 2;
        var dy = ev.clientY - cy;
        var maxR = rect.height / 2 - 12; // 24px de thumb / 2
        var clamped = Math.max(-maxR, Math.min(maxR, dy));
        thumb.style.transform = "translate(-50%,-50%) translateY(" + clamped / jogScale + "px)";
        setVal(-(clamped / maxR));
      }

      // X: pointerdown on the track, pointermove/pointerup/pointercancel
      // on window (the same reason as the ring/Z -- setPointerCapture is
      // not reliable on this kiosk).
      function jogStraightXWire() {
        jogXTrackEl.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!jogCanMove()) return jogCannotMoveExplain();
          jogStraightXPointerId = ev.pointerId;
          try {
            jogXTrackEl.setPointerCapture(jogStraightXPointerId);
          } catch (e) {
            /* ignorar */
          }
          jogStraightFromEvent(ev, jogXTrackEl, jogXThumbEl, function (v) {
            jogStraightXVal = v;
          });
          jogSendXY(jogStraightXVal, jogStraightYPointerId !== null ? jogStraightYVal : 0, true);
        });
        jogWinOn("pointermove", function (ev) {
          if (jogStraightXPointerId === null || ev.pointerId !== jogStraightXPointerId) return;
          jogStraightFromEvent(ev, jogXTrackEl, jogXThumbEl, function (v) {
            jogStraightXVal = v;
          });
          jogSendXY(jogStraightXVal, jogStraightYPointerId !== null ? jogStraightYVal : 0, false);
        });
        function jogRectoXEndDrag(ev) {
          if (jogStraightXPointerId === null || ev.pointerId !== jogStraightXPointerId) return;
          var releaseId = jogStraightXPointerId;
          jogStraightXPointerId = null;
          jogStraightXVal = 0;
          try {
            jogXTrackEl.releasePointerCapture(releaseId);
          } catch (e) {
            /* ya liberado */
          }
          jogXThumbEl.style.transform = "translate(-50%,-50%)";
          if (jogStraightYPointerId !== null) {
            // Y is still held -- send the updated state (X=0, Y
            // as it was), NOT a full stop_xy.
            jogSendXY(0, jogStraightYVal, true);
          } else {
            jogSendXYStateOrStop();
          }
        }
        jogWinOn("pointerup", jogRectoXEndDrag);
        jogWinOn("pointercancel", jogRectoXEndDrag);
        jogXTrackEl.addEventListener("lostpointercapture", jogRectoXEndDrag);
      }

      // Y: mismo patron, eje separado.
      function jogStraightYWire() {
        jogYTrackEl.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!jogCanMove()) return jogCannotMoveExplain();
          jogStraightYPointerId = ev.pointerId;
          try {
            jogYTrackEl.setPointerCapture(jogStraightYPointerId);
          } catch (e) {
            /* ignorar */
          }
          jogStraightFromEvent(ev, jogYTrackEl, jogYThumbEl, function (v) {
            // the backend takes Y with the sign of the knob (up = negative, see dy = -uy there) and this slider gives up = +1:
            // without this sign Y+ (top) moved the machine to Y- and Y- (bottom) to Y+, the opposite of the knob
            jogStraightYVal = -v;
          });
          jogSendXY(jogStraightXPointerId !== null ? jogStraightXVal : 0, jogStraightYVal, true);
        });
        jogWinOn("pointermove", function (ev) {
          if (jogStraightYPointerId === null || ev.pointerId !== jogStraightYPointerId) return;
          jogStraightFromEvent(ev, jogYTrackEl, jogYThumbEl, function (v) {
            // the backend takes Y with the sign of the knob (up = negative, see dy = -uy there) and this slider gives up = +1:
            // without this sign Y+ (top) moved the machine to Y- and Y- (bottom) to Y+, the opposite of the knob
            jogStraightYVal = -v;
          });
          jogSendXY(jogStraightXPointerId !== null ? jogStraightXVal : 0, jogStraightYVal, false);
        });
        function jogRectoYEndDrag(ev) {
          if (jogStraightYPointerId === null || ev.pointerId !== jogStraightYPointerId) return;
          var releaseId = jogStraightYPointerId;
          jogStraightYPointerId = null;
          jogStraightYVal = 0;
          try {
            jogYTrackEl.releasePointerCapture(releaseId);
          } catch (e) {
            /* ya liberado */
          }
          jogYThumbEl.style.transform = "translate(-50%,-50%)";
          if (jogStraightXPointerId !== null) {
            jogSendXY(jogStraightXVal, 0, true);
          } else {
            jogSendXYStateOrStop();
          }
        }
        jogWinOn("pointerup", jogRectoYEndDrag);
        jogWinOn("pointercancel", jogRectoYEndDrag);
        jogYTrackEl.addEventListener("lostpointercapture", jogRectoYEndDrag);
      }

      // The knob: the ring, the Free / Straight buttons, the cross and labels, the knob itself and its drag.
      function jogPanelRing(jp) {
        var ring = document.createElement("div");
        ring.style.cssText = [
          "position:relative",
          "width:" + JOG_RING_SIZE + "px",
          "height:" + JOG_RING_SIZE + "px",
          "border-radius:50%",
          "touch-action:none",
          "flex:0 0 auto",
        ].join(";");
        jogRingStyle();
        ring.className = "workshop-jog-ring"; // fill, border and relief live in the class (jogRingStyle): the glow while dragging is the only inline box-shadow
        jp.row.appendChild(ring);
        jogRingEl = ring;
        jp.ring = ring;
        jogAxisModeWire(jp);
        jogRingMarks(jp);
        jogRingWire(jp);
      }

      // Switches between Free mode (circle) and Straight (separate
      // X/Y sliders) -- it cuts anything held from the mode being
      // abandoned, so as not to leave a "phantom" state.
      function jogApplyAxisMode(jp, mode) {
        jogAxisMode = mode;
        try {
          localStorage.setItem(JOG_AXIS_MODE_KEY, mode);
        } catch (e) {
          /* no critico */
        }
        var isRecto = mode === "straight";
        jp.ring.style.display = isRecto ? "none" : "";
        jogXTrackEl.style.display = isRecto ? "" : "none";
        jogYTrackEl.style.display = isRecto ? "" : "none";
        jogSegPaint(jp.axisModeFreeBtn, !isRecto);
        jogSegPaint(jp.axisModeStraightBtn, isRecto);
        if (isRecto && jogPointerId !== null) {
          jogPointerId = null;
          if (jogKnobEl) jogKnobEl.style.transform = "translate(-50%,-50%)";
          jogRingEl.style.boxShadow = "";
          jogSendStopXY();
        } else if (!isRecto && (jogStraightXPointerId !== null || jogStraightYPointerId !== null)) {
          jogStraightXPointerId = null;
          jogStraightYPointerId = null;
          jogStraightXVal = 0;
          jogStraightYVal = 0;
          jogXThumbEl.style.transform = "translate(-50%,-50%)";
          jogYThumbEl.style.transform = "translate(-50%,-50%)";
          jogSendStopXY();
        }
      }

      // A choice of a segment (Free / Straight, the axis of the Step tab): the chosen one filled with the primary blue and white text, the other one the
      // family outline (wf-btn: control border, transparent, normal text). Before, the other one was filled dark gray and looked disabled (ux, 2026-11-23).
      function jogSegPaint(btn, on) {
        if (on) {
          btn.style.background = "#1976d2";
          btn.style.borderColor = "#1976d2";
          btn.style.color = "#fff";
        } else {
          btn.style.removeProperty("background");
          btn.style.removeProperty("border-color");
          btn.style.removeProperty("color");
        }
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      }

      function jogAxisModeWire(jp) {
        jp.axisModeFreeBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        jp.axisModeFreeBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          jogApplyAxisMode(jp, "free");
        });
        jp.axisModeStraightBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        jp.axisModeStraightBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          jogApplyAxisMode(jp, "straight");
        });
      }

      // Crucecita de referencia + etiquetas de eje, puramente visuales; then the knob.
      function jogRingMarks(jp) {
        var ring = jp.ring;
        var crosshair = document.createElement("div");
        crosshair.style.cssText =
          "position:absolute;left:50%;top:50%;width:1px;height:100%;background:rgba(255,255,255,0.38);transform:translate(-50%,-50%);pointer-events:none;";
        ring.appendChild(crosshair);
        var crosshair2 = document.createElement("div");
        crosshair2.style.cssText =
          "position:absolute;left:50%;top:50%;width:100%;height:1px;background:rgba(255,255,255,0.38);transform:translate(-50%,-50%);pointer-events:none;";
        ring.appendChild(crosshair2);

        [
          ["Y+", "left:50%;top:2px;transform:translateX(-50%);"],
          ["Y-", "left:50%;bottom:2px;transform:translateX(-50%);"],
          ["X-", "left:3px;top:50%;transform:translateY(-50%);"],
          ["X+", "right:3px;top:50%;transform:translateY(-50%);"],
        ].forEach(function (pair) {
          var lbl = document.createElement("span");
          lbl.textContent = pair[0];
          lbl.style.cssText = "position:absolute;font-size:12px;font-weight:600;color:rgba(255,255,255,0.8);pointer-events:none;" + pair[1];
          ring.appendChild(lbl);
        });

        var KNOB_SIZE = 42;
        var knob = document.createElement("div");
        knob.style.cssText = [
          "position:absolute",
          "left:50%",
          "top:50%",
          "width:" + KNOB_SIZE + "px",
          "height:" + KNOB_SIZE + "px",
          "border-radius:50%",
          "background:var(--wf-n-session-text,#90caf9)",
          "border:2px solid #fff",
          "box-shadow:0 1px 6px rgba(0,0,0,0.6)",
          "transform:translate(-50%,-50%)",
          "touch-action:none",
          "pointer-events:none", // the events are caught by the ring, not the knob
        ].join(";");
        ring.appendChild(knob);
        jogKnobEl = knob;
        jp.knob = knob;
      }

      // Pure (tested by eye with the knob): the vector with the snap applied.
      function jogApplyAxisSnap(nx, ny) {
        var ax = Math.abs(nx);
        var ay = Math.abs(ny);
        if (ax < 0.001 && ay < 0.001) return [nx, ny];
        var angleFromX = (Math.atan2(ay, ax) * 180) / Math.PI; // 0..90, regardless of the quadrant
        if (angleFromX <= JOG_SNAP_DEG) return [nx, 0];
        if (angleFromX >= 90 - JOG_SNAP_DEG) return [0, ny];
        return [nx, ny];
      }

      function jogKnobFromEvent(jp, ev, force) {
        var rect = jp.ring.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = ev.clientX - cx;
        var dy = ev.clientY - cy;
        var maxR = rect.width / 2 - 4;
        var dist = Math.hypot(dx, dy);
        var scale = dist > maxR ? maxR / dist : 1;
        var nx = (dx * scale) / maxR;
        var ny = (dy * scale) / maxR;
        if (jogAxisSnapEnabled) {
          var snapped = jogApplyAxisSnap(nx, ny);
          nx = snapped[0];
          ny = snapped[1];
        }
        // The visual knob uses the values ALREADY snapped -- what is seen
        // has to match what is sent, otherwise the magnet's "click"
        // feels like a strange jump instead of a help.
        jp.knob.style.transform = "translate(-50%,-50%) translate(" + (nx * maxR) / jogScale + "px," + (ny * maxR) / jogScale + "px)";
        var mag = Math.min(Math.hypot(nx, ny), 1);
        jp.ring.style.boxShadow = "0 0 " + (4 + mag * 16).toFixed(0) + "px rgba(255,112,67," + (0.15 + mag * 0.55).toFixed(2) + ")";
        jogKnobNX = nx;
        jogKnobNY = ny;
        jogSendXY(nx, ny, force);
      }

      // IMPORTANT -- drag tracking at the `window` level, NOT
      // listening to pointermove/pointerup on the ring itself. Confirmed
      // live (2026-10-07): setPointerCapture() is not reliable on
      // this kiosk (Wayland + touch) -- if the finger strays just
      // outside the 120px circle (easy with a real finger), the
      // browser stops delivering events to the ring because the capture
      // never took. Listening on `window` the tracking does not depend on
      // which element the event lands on (hit-testing) nor on whether the capture
      // worked -- it only depends on the pointerId staying the same.
      // setPointerCapture is still attempted anyway (it does no harm when
      // it works, in other browsers/devices).
      function jogRingWire(jp) {
        var ring = jp.ring;
        ring.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!jogCanMove()) return jogCannotMoveExplain();
          jogPointerId = ev.pointerId;
          try {
            ring.setPointerCapture(jogPointerId);
          } catch (e) {
            /* ignorar */
          }
          jogKnobFromEvent(jp, ev, true);
        });
        jogWinOn("pointermove", function (ev) {
          if (jogPointerId === null || ev.pointerId !== jogPointerId) return;
          jogKnobFromEvent(jp, ev, false);
        });
        // Unlike movement tracking (which requires the exact pointerId,
        // so as not to mix the knob's finger with another finger
        // touching something else on a touch kiosk), release is more permissive
        // in what LANDS on this listener (the pointerId filter is exact since this listens on window
        // together with any other pointer of the page) -- but it is still
        // complemented by the BACKEND's watchdog (see jog_move.py)
        // for the edge case where NO release event ever arrives
        // for this particular pointerId.
        function ringEndDrag(ev) {
          if (jogPointerId === null || ev.pointerId !== jogPointerId) return;
          var releaseId = jogPointerId;
          jogPointerId = null;
          try {
            ring.releasePointerCapture(releaseId);
          } catch (e) {
            /* ya liberado */
          }
          jp.knob.style.transform = "translate(-50%,-50%)";
          ring.style.boxShadow = "";
          jogSendXYStateOrStop();
        }
        jogWinOn("pointerup", ringEndDrag);
        jogWinOn("pointercancel", ringEndDrag);
        // lostpointercapture: a direct signal from the browser that we NO LONGER
        // have the pointer (for whatever reason) -- an additional safety net
        // in browsers where the capture does work.
        ring.addEventListener("lostpointercapture", ringEndDrag);
      }
