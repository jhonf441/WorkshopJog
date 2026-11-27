      // ---- Jog panel: the Z track, the speed slider and the mouse wheel over the knob (sections listed in 10-jog-panel.js) ----

      var JOG_Z_THUMB_PX = 24;

      // -- Z slider (replaces the Z+/Z- on/off buttons,
      // 2026-10-08 fourth round) -- explicit user request after
      // explaining why Z felt worse than X/Y on release: the
      // knob is analog (people naturally "ease off" toward the
      // center an instant before releasing, so the last
      // unavoidable stretch -- RRF cannot cancel an already accepted G1 -- comes out
      // small almost always), but an on/off button has no way to
      // ease off, so that last stretch came out at full speed almost
      // always. Exactly the same mechanism as the ring (vertical drag
      // = magnitude -1..1, release = send stop again), so Z
      // inherits the same natural mitigation. See jog_move.py for the
      // backend side (z went from being a sign to a continuous value).
      function jogPanelZ(jp) {
        var zTrack = document.createElement("div");
        zTrack.style.cssText = [
          "position:relative",
          "width:" + JOG_TRACK_W + "px",
          "height:" + JOG_RING_SIZE + "px",
          "border-radius:" + JOG_TRACK_W / 2 + "px",
          "background:#37474f",
          "border:2px solid rgba(255,255,255,0.3)",
          "touch-action:none",
          "flex:0 0 auto",
        ].join(";");
        jp.row.appendChild(zTrack);
        jogZTrackEl = zTrack;

        [
          ["Z+", "top:2px;"],
          ["Z-", "bottom:2px;"],
        ].forEach(function (pair) {
          var lbl = document.createElement("span");
          lbl.textContent = pair[0];
          lbl.style.cssText =
            "position:absolute;left:50%;transform:translateX(-50%);font-size:12px;color:rgba(255,255,255,0.45);pointer-events:none;" +
            pair[1];
          zTrack.appendChild(lbl);
        });

        var zThumb = document.createElement("div");
        zThumb.style.cssText = [
          "position:absolute",
          "left:50%",
          "top:50%",
          "width:" + JOG_Z_THUMB_PX + "px",
          "height:" + JOG_Z_THUMB_PX + "px",
          "border-radius:50%",
          "background:var(--wf-n-session-text,#90caf9)",
          "border:2px solid #fff",
          "box-shadow:0 1px 6px rgba(0,0,0,0.6)",
          "transform:translate(-50%,-50%)",
          "touch-action:none",
          "pointer-events:none", // the events are caught by the track, not the thumb
        ].join(";");
        zTrack.appendChild(zThumb);
        jogZThumbEl = zThumb;
        jp.zTrack = zTrack;
        jp.zThumb = zThumb;
        jogZTrackWire(jp);
      }

      // Mismo patron que jogKnobFromEvent -- 1 sola dimension
      // (vertical) en vez de 2.
      function jogZFromEvent(jp, ev, force) {
        var rect = jp.zTrack.getBoundingClientRect();
        var cy = rect.top + rect.height / 2;
        var dy = ev.clientY - cy;
        var maxR = rect.height / 2 - JOG_Z_THUMB_PX / 2;
        var clamped = Math.max(-maxR, Math.min(maxR, dy));
        jp.zThumb.style.transform = "translate(-50%,-50%) translateY(" + clamped / jogScale + "px)";
        // Up = Z+ (negative dy), so the sign is inverted.
        var nz = -(clamped / maxR);
        jogSendZ(nz, force);
      }

      // The same reason as the ring (see the big comment above
      // jogRingWire): listen on `window`, not on the track, because
      // setPointerCapture is not reliable on this kiosk.
      function jogZTrackWire(jp) {
        var zTrack = jp.zTrack;
        zTrack.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!jogCanMove()) return jogCannotMoveExplain();
          jogZPointerId = ev.pointerId;
          try {
            zTrack.setPointerCapture(jogZPointerId);
          } catch (e) {
            /* ignorar */
          }
          jogZFromEvent(jp, ev, true);
        });
        jogWinOn("pointermove", function (ev) {
          if (jogZPointerId === null || ev.pointerId !== jogZPointerId) return;
          jogZFromEvent(jp, ev, false);
        });
        function zTrackEndDrag(ev) {
          if (jogZPointerId === null || ev.pointerId !== jogZPointerId) return;
          var releaseId = jogZPointerId;
          try {
            zTrack.releasePointerCapture(releaseId);
          } catch (e) {
            /* ya liberado */
          }
          jogStopZHold();
        }
        jogWinOn("pointerup", zTrackEndDrag);
        jogWinOn("pointercancel", zTrackEndDrag);
        zTrack.addEventListener("lostpointercapture", zTrackEndDrag);
      }

      // -- control de velocidad (slider continuo, reemplaza los 3
      // botones fijos de antes) --
      function jogPanelSpeed(jp) {
        var speedRow = document.createElement("div");
        speedRow.style.cssText = "display:flex;align-items:center;gap:6px;width:100%;";
        jp.body.appendChild(speedRow);

        // Plain text, not emoji -- the kiosk's font does not have those
        // glyphs and they look like a "broken image" icon (the same reason
        // documented above for the icons).
        var speedIconSlow = document.createElement("span");
        speedIconSlow.textContent = "MIN";
        speedIconSlow.style.cssText = "font-size:12px;color:rgba(255,255,255,0.45);flex:0 0 auto;";
        speedRow.appendChild(speedIconSlow);

        var speedSlider = document.createElement("input");
        speedSlider.type = "range";
        speedSlider.min = "5";
        speedSlider.max = "100";
        speedSlider.step = "1";
        speedSlider.value = String(jogSpeedPercent);
        speedSlider.title = i18nT('jog.maximum_jog_speed');
        speedSlider.style.cssText = "flex:1 1 auto;width:0;height:44px;touch-action:pan-x;cursor:pointer;";
        speedRow.appendChild(speedSlider);

        var speedIconFast = document.createElement("span");
        speedIconFast.textContent = "MAX";
        speedIconFast.style.cssText = "font-size:12px;color:rgba(255,255,255,0.45);flex:0 0 auto;";
        speedRow.appendChild(speedIconFast);

        // stopPropagation on pointerdown/up (not on the "input" event --
        // that one does not exist on the panel/header so there is nothing to
        // override), the same pattern as the other controls: the slider is
        // a child of the draggable panel, without this dragging the thumb
        // would also drag the whole panel.
        speedSlider.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
        });
        speedSlider.addEventListener("input", function () {
          jogSpeedPercent = parseFloat(speedSlider.value);
          saveSpeedPercent(jogSpeedPercent);
          jogUpdateStatusText();
        });
        jp.speedRow = speedRow;
        jp.speedSlider = speedSlider;
      }

      // -- mouse wheel over the knob -- adjusts the maximum
      // speed (the same % already controlled by the slider above). It does not
      // depend on the keyboard mode being active nor on the selected tab --
      // the knob itself is always visible, it makes sense for the wheel to always work
      // when the mouse is over it, whatever tab is open.
      // The listener must be able to cancel the page scroll (passive: false), so it is added only while a mouse is over the knob
      // (pointerenter comes before the first wheel turn) and taken away when it leaves: a touch screen never has a scroll-blocking
      // listener waiting (Chrome's "[Violation] Added non-passive event listener to a scroll-blocking 'wheel' event", 2026-11-23).
      function jogPanelWheel(jp) {
        var ring = jp.ring;
        function jogRingWheel(ev) {
          if (ev.ctrlKey || ev.metaKey) return; // Ctrl+wheel = Chrome's zoom
          ev.preventDefault();
          var delta = ev.deltaY < 0 ? 2 : -2;
          jogSpeedPercent = clamp(jogSpeedPercent + delta, 5, 100);
          jp.speedSlider.value = String(jogSpeedPercent);
          saveSpeedPercent(jogSpeedPercent);
          jogUpdateStatusText();
        }
        ring.addEventListener("pointerenter", function (ev) {
          if (ev.pointerType === "mouse") ring.addEventListener("wheel", jogRingWheel, { passive: false });
        });
        ring.addEventListener("pointerleave", function () {
          ring.removeEventListener("wheel", jogRingWheel, { passive: false });
        });
      }
