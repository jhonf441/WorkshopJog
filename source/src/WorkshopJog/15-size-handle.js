      // ---- The handle in the bottom right corner of the Jog panel: drag it to change the width and the height (state: 15-size.js) ----
      //
      // The same gesture as the camera viewer's corner: it stops its own pointer events, so the drag-to-move of the title bar does not fire with it;
      // the size is applied while the finger moves and remembered when it lets go. It sits in a strip of its own under the dock, so it never covers
      // STOP or E-STOP. Two quick taps on it give the original size back.

      function jogSizeHandleMake(js) {
        var handle = document.createElement("div");
        handle.setAttribute("data-jog-size-handle", "");
        handle.setAttribute("aria-label", i18nT('jog.resize_handle'));
        handle.title = i18nT('jog.resize_handle');
        handle.style.cssText =
          "position:absolute;right:0;top:0;width:44px;height:100%;cursor:nwse-resize;touch-action:none;" +
          "background:linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.55) 50%) right 4px bottom 4px / 12px 12px no-repeat;";
        handle.addEventListener("pointerdown", function (ev) {
          jogSizeDown(js, ev);
        });
        handle.addEventListener("pointermove", function (ev) {
          jogSizeMove(js, ev);
        });
        handle.addEventListener("pointerup", function (ev) {
          jogSizeEnd(js, ev, false);
        });
        handle.addEventListener("pointercancel", function (ev) {
          jogSizeEnd(js, ev, true);
        });
        js.handle = handle;
        return handle;
      }

      function jogSizeDown(js, ev) {
        ev.stopPropagation();
        ev.preventDefault(); // no focus for the tap (the on-screen keyboard), and the page behind does not take the gesture
        var panel = jogPanelEl;
        if (!panel || panel.dataset.fsLock === "1") return;
        js.drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, w: panel.offsetWidth, h: panel.offsetHeight, moved: false };
        js.handle.setPointerCapture(ev.pointerId);
      }

      function jogSizeMove(js, ev) {
        var d = js.drag;
        if (!d || ev.pointerId !== d.id) return;
        ev.stopPropagation();
        var dx = ev.clientX - d.x;
        var dy = ev.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) <= JOG_SIZE_TAP_PX) return; // a tap that wobbles is still a tap
        d.moved = true;
        // a mouse sends moves faster than the panel can be redrawn: only the last position of each frame is applied
        d.dx = dx;
        d.dy = dy;
        if (d.frame) return;
        var run = function () {
          d.frame = 0;
          if (js.drag !== d) return;
          js.size = jogSizeDrag(d, d.dx, d.dy, jogSizeLimits(jogSizeWin(), { left: jogPanelEl.offsetLeft, top: jogPanelEl.offsetTop }, jogSizeChrome()), jogSizeChrome());
          jogSizeApply();
          jogReclampPanel();
        };
        d.frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : (run(), 0);
      }

      // Let go (or the system took the gesture): a drag is remembered; a tap is the first or the second of a double tap.
      function jogSizeEnd(js, ev, cancelled) {
        var d = js.drag;
        if (!d || ev.pointerId !== d.id) return;
        js.drag = null;
        ev.stopPropagation();
        try {
          js.handle.releasePointerCapture(ev.pointerId);
        } catch (e) {
          /* already released */
        }
        if (d.moved) {
          if (d.frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(d.frame);
          // the last position, measured for real now that nothing moves any more
          js.size = jogSizeDrag(d, d.dx, d.dy, jogSizeLimits(jogSizeWin(), { left: jogPanelEl.offsetLeft, top: jogPanelEl.offsetTop }, jogSizeChrome()), jogSizeChrome());
          js.dirty = true;
          jogSizeApply();
          jogReclampPanel();
          jogSizeSave(js.size);
          return;
        }
        if (cancelled) return;
        var now = { t: Date.now(), x: ev.clientX, y: ev.clientY };
        if (jogSizeIsDoubleTap(js.tap, now)) {
          js.tap = null;
          jogSizeReset(js);
        } else {
          js.tap = now;
        }
      }
