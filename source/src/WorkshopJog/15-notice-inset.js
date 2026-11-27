      // ---- Nothing covers a stop, the notices either (criteria C13.9, 2026-11-23) ----
      //
      // When the Jog's STOP / E-STOP sit in the lower half of the window (the panel docked at the bottom, or a phone where it takes the width), the notices
      // center (_shared/09-notices.js, v3) keeps that strip free: setInset("bottom", px, "WorkshopJog") with px = from the window's bottom edge to the top of
      // the highest stop button, plus 8 px. 0 when the jog is closed or floats in the upper half. Said again whenever the panel opens, closes, is placed
      // (drag, resize, rotation, a change of its size); only a change is sent.

      var JOG_NOTICE_INSET_SOURCE = "WorkshopJog";
      var JOG_NOTICE_INSET_GAP = 8;
      var jogNoticeInsetLast = -1;

      // Pure: the inset for a stop strip whose top is at stopTop (viewport px, null = none on screen), in a window vh high.
      function jogNoticeInsetPx(stopTop, vh, open) {
        if (!open || typeof stopTop !== "number" || !(vh > 0) || stopTop < vh / 2) return 0;
        return Math.max(0, Math.ceil(vh - stopTop + JOG_NOTICE_INSET_GAP));
      }

      // The top of the highest STOP / E-STOP of the panel that is on screen (each design draws its own: the attribute marks them), or null.
      function jogStopStripTop() {
        if (!jogPanelEl || typeof jogPanelEl.querySelectorAll !== "function") return null;
        var top = null;
        Array.prototype.forEach.call(jogPanelEl.querySelectorAll("[data-jog-stop]"), function (b) {
          if (!b.offsetParent || typeof b.getBoundingClientRect !== "function") return;
          var r = b.getBoundingClientRect();
          if (r.height > 0 && (top === null || r.top < top)) top = r.top;
        });
        return top;
      }

      // The notices center of the page (installed by the first plugin that asks; this asks too, so the strip is kept free even before any notice).
      function jogNoticeCenter() {
        if (typeof workshopNotices === "function") return workshopNotices();
        return typeof window !== "undefined" ? window.__workshopNotices || null : null;
      }

      function jogNoticeInsetSync() {
        var c = jogNoticeCenter();
        if (!c || typeof c.setInset !== "function") return;
        var open = isJogOpen();
        var px = jogNoticeInsetPx(open ? jogStopStripTop() : null, window.innerHeight, open);
        if (px === jogNoticeInsetLast) return;
        jogNoticeInsetLast = px;
        try {
          c.setInset("bottom", px, JOG_NOTICE_INSET_SOURCE);
        } catch (e) {
          /* an old center: the notices keep their place */
        }
      }

      // The panel goes away (plugin stopped, panel rebuilt): nothing of the jog is kept free any more.
      function jogNoticeInsetClear() {
        jogNoticeInsetLast = -1;
        var c = jogNoticeCenter();
        if (c && typeof c.setInset === "function") {
          try {
            c.setInset("bottom", 0, JOG_NOTICE_INSET_SOURCE);
          } catch (e) {
            /* nothing to clear */
          }
        }
      }
