      // ---- Where the floating Jog sits: the saved corner + percentage, and the drag by the title bar (numbers: 09-pos.js; tests/jog-position.test.js) ----

      var JOG_POS_STOP_CLEAR = 48; // px: a drag does not start this close to STOP / E-STOP

      function jogPosLoad() {
        try {
          return jogPosRead(localStorage.getItem(JOG_POS_KEY));
        } catch (e) {
          return jogPosRead(null);
        }
      }

      function jogPosSave(pos) {
        try {
          localStorage.setItem(JOG_POS_KEY, JSON.stringify(pos));
        } catch (e) {
          /* not critical: it is just not remembered */
        }
      }

      // Puts the panel where the saved corner + percentage say for the size it has NOW, bounded to the visible area and out of DWC's top bar.
      // Saves nothing: the place only changes when somebody drags the panel, so a resize, a rotation or a growing panel never moves it for good.
      function jogPosPlace() {
        var el = jogPanelEl;
        if (!el) return;
        var r = jogPosToRect(jogPosLoad(), el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight, MARGIN);
        jogPutPanel(el, r.left, r.top);
      }

      // Whether the point of a pointer is within JOG_POS_STOP_CLEAR px of a visible STOP or E-STOP button of the panel.
      function jogPosNearStop(panel, x, y) {
        var stops = panel.querySelectorAll("[data-jog-stop]");
        for (var i = 0; i < stops.length; i++) {
          var r = stops[i].getBoundingClientRect();
          if (!(r.width > 0 && r.height > 0)) continue; // hidden
          if (x >= r.left - JOG_POS_STOP_CLEAR && x <= r.right + JOG_POS_STOP_CLEAR && y >= r.top - JOG_POS_STOP_CLEAR && y <= r.bottom + JOG_POS_STOP_CLEAR) return true;
        }
        return false;
      }

      // Drag by the title bar (so the knob and the buttons inside use their own gestures). The new place is saved as corner + percentage when the
      // finger lets go. Not while the panel is full screen, and not when the touch starts within 48 px of STOP.
      function jogPosDraggable(target, handle) {
        var dragging = false;
        var pointerId = null;
        var startX = 0;
        var startY = 0;
        var startLeft = 0;
        var startTop = 0;
        jogPosPlace();
        handle.addEventListener("pointerdown", function (ev) {
          if (target.dataset.fsLock === "1") return; // the full screen scales the panel by itself
          if (ev.target && ev.target.closest && ev.target.closest("a, button")) return; // a link or a button keeps its own tap
          if (jogPosNearStop(target, ev.clientX, ev.clientY)) return;
          ev.preventDefault();
          dragging = true;
          pointerId = ev.pointerId;
          startX = ev.clientX;
          startY = ev.clientY;
          startLeft = target.offsetLeft;
          startTop = target.offsetTop;
          handle.setPointerCapture(pointerId);
        });
        handle.addEventListener("pointermove", function (ev) {
          if (!dragging || ev.pointerId !== pointerId) return;
          var left = clamp(startLeft + ev.clientX - startX, MARGIN, window.innerWidth - target.offsetWidth - MARGIN);
          var top = clamp(startTop + ev.clientY - startY, MARGIN, window.innerHeight - target.offsetHeight - MARGIN);
          jogPutPanel(target, left, top); // it slides around DWC's top bar
        });
        function end(ev) {
          if (!dragging || ev.pointerId !== pointerId) return;
          dragging = false;
          try {
            handle.releasePointerCapture(pointerId);
          } catch (e) {
            /* already released */
          }
          jogPosSave(jogPosFromRect(target.offsetLeft, target.offsetTop, target.offsetWidth, target.offsetHeight, window.innerWidth, window.innerHeight, MARGIN));
          jogPosPlace();
        }
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
      }
