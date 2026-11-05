      // ---- Size of the floating panel (pure part: numbers in, numbers out; 15-size.js and 15-size-handle.js put it on the panel) ----
      //
      // The size is ONE thing and only the handle in the bottom right corner of the panel changes it (the gear offers no size or zoom). Dragging
      // the handle changes the width, and the height follows the content:
      //  - the WIDTH is the zoom of the content: the panel is drawn for JOG_PANEL_W px, and a wider or narrower panel is that same drawing
      //    zoomed (width / JOG_PANEL_W, from JOG_SCALE_MIN to JOG_SCALE_MAX), so the knob, the tracks and the buttons keep their proportions and
      //    nothing breaks at any width;
      //  - the HEIGHT is the REAL content of the open tab at that zoom (`natural`, measured by 15-size.js): never lower (the controls are
      //    always in view) and never taller (a panel taller than its content shows a blank band between the controls and the STOP / E-STOP
      //    dock: the body does not stretch, seen with the knob-and-tabs design when the corner was dragged down). Only a window lower than
      //    the content (a phone) makes the panel lower, and then the body scrolls inside. With no height saved the panel is as tall as its
      //    content; until the content is measured, the old limits hold (everything but the body plus a little of it, up to the window).
      // When the content does not fit in the window at a zoom, the zoom cannot grow any more (it can shrink).
      // Both stay inside the window (a phone included) and out of the zone of DWC's Emergency stop button. The size is remembered per screen
      // (localStorage, JOG_SIZE_KEY = {w, h}); a size saved on a wide screen is fitted to a narrower window when it is applied, never rewritten.
      // Every size here is the OUTER one (what offsetWidth / offsetHeight say and what the finger drags): the style width and height of the panel
      // are JOG_SIZE_BORDER less.

      var JOG_PANEL_W = 208; // width of the content at zoom 1: the width it is drawn for
      var JOG_SCALE_MIN = 0.8; // zoom of the narrowest panel
      var JOG_SCALE_MAX = 1.8; // zoom of the widest panel
      var JOG_SIZE_BORDER = 4; // the border of the panel (2 px a side), outside its style width and height
      var JOG_SIZE_DEFAULT_W = JOG_PANEL_W + JOG_SIZE_BORDER; // 212: the original panel
      var JOG_SIZE_MIN_W = Math.round(JOG_PANEL_W * JOG_SCALE_MIN) + JOG_SIZE_BORDER; // 170
      var JOG_SIZE_MAX_W = Math.round(JOG_PANEL_W * JOG_SCALE_MAX) + JOG_SIZE_BORDER; // 378
      var JOG_SIZE_KEY = "workshopJogSize";
      var JOG_SIZE_FOOT_H = 20; // the strip under the dock that holds the handle: the handle never covers STOP / E-STOP
      var JOG_SIZE_ESS_GAP = 10; // px under the controls (before the zoom is taken off) that stay with them
      var JOG_SIZE_BODY_MIN = 60; // px (before the zoom) of the body that always stay in view
      var JOG_SIZE_WATCH_MS = 120; // wait after the body changes before it is measured again
      var JOG_SIZE_TAP_MS = 400; // two taps on the handle this close in time and place give the original size back
      var JOG_SIZE_TAP_PX = 10;
      var jogScale = 1; // zoom of the content now (set by jogSizeApply); the knob and the tracks divide their drawing by it

      // The zoom of a panel width, three decimals so the content follows the finger without steps.
      function jogSizeScaleOf(w) {
        return Math.round(clamp((w - JOG_SIZE_BORDER) / JOG_PANEL_W, JOG_SCALE_MIN, JOG_SCALE_MAX) * 1000) / 1000;
      }

      // What the panel is made of, in px before the zoom (header, status bar, dock) and after it (the strip of the handle, the border).
      // chrome = { header, status, dock, foot }.
      function jogSizeChromeH(scale, chrome) {
        return Math.round((chrome.header + chrome.status + chrome.dock) * scale) + chrome.foot + JOG_SIZE_BORDER;
      }

      // The outer height the panel has with all its content at `scale`. natural = { h, scale } = what was measured (the outer height of the
      // panel as tall as its content, at that zoom) or null when nothing was measured. The content zooms (the strip of the handle and the
      // border do not), so it is taken to the other zoom linearly. 0 when there is no measure.
      function jogSizeNaturalAt(natural, scale) {
        if (!natural || !(natural.h > 0) || !(natural.scale > 0)) return 0;
        var fixed = JOG_SIZE_FOOT_H + JOG_SIZE_BORDER;
        return Math.ceil(((natural.h - fixed) / natural.scale) * scale) + fixed;
      }

      // The outer height that always keeps the essential part in view (header, position, controls to move, STOP / E-STOP) at `scale`; 0 when the
      // open view marks no essential part (data-jog-essential) or nothing was measured. What is below that part scrolls inside the body.
      function jogSizeEssentialAt(natural, scale) {
        if (!natural || !(natural.ess > 0) || !(natural.scale > 0)) return 0;
        var fixed = JOG_SIZE_FOOT_H + JOG_SIZE_BORDER;
        var ess = Math.ceil((natural.ess / natural.scale) * scale) + fixed;
        return ess < jogSizeNaturalAt(natural, scale) ? ess : 0; // nothing to gain when the content is that low already
      }

      // What has to fit in the window for the zoom to grow: the essential part when the view has one (the rest scrolls), else all the content.
      function jogSizeBasis(natural) {
        if (!natural || !(natural.ess > 0) || !(natural.scale > 0)) return natural;
        var fixed = JOG_SIZE_FOOT_H + JOG_SIZE_BORDER;
        return natural.ess + fixed < natural.h ? { h: natural.ess + fixed, scale: natural.scale } : natural;
      }

      // The biggest zoom at which the whole content still fits in availH (the height of the window for the panel): never under JOG_SCALE_MIN
      // (a smaller panel is always possible) and never over JOG_SCALE_MAX. With no measure: JOG_SCALE_MAX.
      function jogSizeMaxScale(natural, availH) {
        if (!natural || !(natural.h > 0) || !(natural.scale > 0)) return JOG_SCALE_MAX;
        var fixed = JOG_SIZE_FOOT_H + JOG_SIZE_BORDER;
        var per = (natural.h - fixed) / natural.scale; // the content at zoom 1
        if (!(per > 0)) return JOG_SCALE_MAX;
        return clamp(Math.floor(((availH - fixed) / per) * 1000) / 1000, JOG_SCALE_MIN, JOG_SCALE_MAX);
      }

      // The widest panel (outer width) a zoom limit allows.
      function jogSizeMaxWOfScale(maxScale) {
        return Math.floor(JOG_PANEL_W * maxScale) + JOG_SIZE_BORDER;
      }

      // The lowest panel: the whole content of the open tab (chrome.natural, measured), and not more than availH (the window: a smaller
      // window scrolls the body inside as a backup). With no measure: everything but the body, and a little of the body.
      function jogSizeMinHeight(scale, chrome, availH) {
        var nat = jogSizeNaturalAt(chrome.natural, scale);
        if (!nat) return jogSizeChromeH(scale, chrome) + Math.round(JOG_SIZE_BODY_MIN * scale);
        nat = jogSizeEssentialAt(chrome.natural, scale) || nat; // a view with an essential part can be made as low as that part
        return availH > 0 ? Math.min(nat, availH) : nat;
      }

      // The tallest panel: the whole content of the open tab (chrome.natural, measured) and not more than availH. Taller than its content, the
      // panel shows a blank band under the controls (nothing fills it), so the height never passes the content. With no measure: availH.
      function jogSizeMaxHeight(scale, chrome, availH) {
        var nat = jogSizeNaturalAt(chrome.natural, scale);
        if (!nat) return availH;
        return availH > 0 ? Math.min(nat, availH) : nat;
      }

      // The panel inside the window for a SAVED size (size = {w, h} or null: the original). win = { vw, vh, margin, zone }, zone = what
      // DWC's Emergency stop button asks to leave free (jogZoneEmergency) or null. Returns the width, the height (null = as tall as the
      // content), the zoom and `reserve`: the height the panel has to leave at the top when it does not fit to the left of that button.
      function jogSizeFit(size, win, chrome) {
        var maxW = Math.max(JOG_SIZE_MIN_W, Math.min(JOG_SIZE_MAX_W, win.vw - 2 * win.margin));
        var w = Math.round(clamp(size && size.w ? size.w : JOG_SIZE_DEFAULT_W, JOG_SIZE_MIN_W, maxW));
        var reserve = win.zone && win.zone.left - win.margin < w ? Math.ceil(win.zone.bottom) : 0;
        // the content has to fit in the window: a zoom that makes it taller does not grow (a smaller one does)
        w = Math.max(JOG_SIZE_MIN_W, Math.min(w, jogSizeMaxWOfScale(jogSizeMaxScale(jogSizeBasis(chrome.natural), win.vh - 2 * win.margin - reserve))));
        var scale = jogSizeScaleOf(w);
        reserve = win.zone && win.zone.left - win.margin < w ? Math.ceil(win.zone.bottom) : 0;
        var h = null;
        if (size && size.h) {
          var availH = win.vh - 2 * win.margin - reserve;
          h = Math.round(clamp(size.h, jogSizeMinHeight(scale, chrome, availH), jogSizeMaxHeight(scale, chrome, availH)));
        }
        return { w: w, h: h, scale: scale, reserve: reserve };
      }

      // What a drag of the handle may reach from where the panel is: at = { left, top }. The panel grows to the right and down, so it
      // stops at the edge of the window and, while its top is in the band of the Emergency stop button, at the left of that button.
      function jogSizeLimits(win, at, chrome) {
        var right = win.vw - win.margin;
        if (win.zone && at.top < win.zone.bottom) right = Math.min(right, win.zone.left);
        var maxW = Math.max(JOG_SIZE_MIN_W, Math.min(JOG_SIZE_MAX_W, right - at.left));
        // chrome.natural (optional): no zoom at which the content is taller than the window
        if (chrome && chrome.natural) maxW = Math.max(JOG_SIZE_MIN_W, Math.min(maxW, jogSizeMaxWOfScale(jogSizeMaxScale(jogSizeBasis(chrome.natural), win.vh - 2 * win.margin))));
        return { minW: JOG_SIZE_MIN_W, maxW: maxW, maxH: win.vh - win.margin - at.top };
      }

      // The size a drag gives: start = { w, h } of the panel when the finger came down, dx / dy = how far it went. The height stays between the
      // lowest and the tallest panel of the zoom the width gives (both the content, once measured: dragging down past the content changes
      // nothing). If the room is less than the minimum, the minimum wins (the panel is then moved back inside by jogReclampPanel).
      function jogSizeDrag(start, dx, dy, lim, chrome) {
        var w = Math.round(clamp(start.w + dx, lim.minW, lim.maxW));
        var scale = jogSizeScaleOf(w);
        var h = Math.round(clamp(start.h + dy, jogSizeMinHeight(scale, chrome, lim.maxH), jogSizeMaxHeight(scale, chrome, lim.maxH)));
        return { w: w, h: h };
      }

      // Max height of the body while the panel is as tall as its content: the whole panel fits in the window. The limit is measured INSIDE the
      // zoom (it is divided by it). `fit` is what jogSizeFit answered.
      function jogSizeBodyMax(fit, chrome, margin) {
        return "calc((100vh - " + (jogSizeChromeH(fit.scale, chrome) + 2 * margin + fit.reserve) + "px) / " + fit.scale + ")";
      }

      // The saved text -> {w, h} (h = null when only the width was kept) or null for anything that is not a size.
      function jogSizeRead(raw) {
        try {
          var s = JSON.parse(raw);
          if (!s || typeof s.w !== "number" || !isFinite(s.w) || s.w <= 0) return null;
          return { w: s.w, h: typeof s.h === "number" && isFinite(s.h) && s.h > 0 ? s.h : null };
        } catch (e) {
          return null;
        }
      }

      // Whether a tap on the handle is the second of a double tap. prev = the last tap or null, now = { t, x, y }.
      function jogSizeIsDoubleTap(prev, now) {
        return !!prev && now.t - prev.t <= JOG_SIZE_TAP_MS && Math.hypot(now.x - prev.x, now.y - prev.y) <= JOG_SIZE_TAP_PX;
      }
