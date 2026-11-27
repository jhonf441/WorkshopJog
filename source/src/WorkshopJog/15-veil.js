      // ---- The veil of the Jog's own sheets (settings, move without limits) never covers a stop (owner's safety rule, 2026-11-23) ----
      //
      // workshopVeilClear (_shared/45-layers.js) keeps DWC's top bar (its Emergency stop) and the control bar (its STOP) out of the veil. The Jog's own
      // STOP / E-STOP live in its floating panel, so the veil sits one layer UNDER the panel (JOG_VEIL_Z < the panel's 2147483646): the panel stays seen
      // and pressable over the dimmed page while a sheet is open. The sheet is centred in the room beside the panel when that room holds a sheet
      // (JOG_VEIL_MIN_SHEET); on a narrow screen it stays centred and the panel may cover part of it (the stops win).

      var JOG_VEIL_Z = 2147483645;
      var JOG_VEIL_MIN_SHEET = 320;
      var JOG_VEIL_GAP = 8;

      // Pure: the padding that moves the sheet beside the panel, or null when the panel is not on screen or no side holds a sheet.
      // panel = its box {left, right} (viewport px), vw = window width, insetRight = what the veil leaves free on the right (the control bar).
      function jogVeilRoom(panel, vw, insetRight) {
        if (!panel || !(panel.right > panel.left)) return null;
        var end = vw - (insetRight || 0);
        var leftRoom = panel.left - JOG_VEIL_GAP;
        var rightRoom = end - panel.right - JOG_VEIL_GAP;
        if (rightRoom >= JOG_VEIL_MIN_SHEET && rightRoom >= leftRoom) return { left: Math.ceil(panel.right + JOG_VEIL_GAP), right: 0 };
        if (leftRoom >= JOG_VEIL_MIN_SHEET) return { left: 0, right: Math.ceil(end - panel.left + JOG_VEIL_GAP) };
        return null;
      }

      // After workshopVeilClear(veil) and once the sheet is in the veil: one layer under the panel, the sheet beside it when it fits.
      function jogVeilUnderPanel(veil) {
        if (!veil || !veil.style) return veil;
        veil.style.zIndex = String(JOG_VEIL_Z);
        // the veil now starts under DWC's bar: the sheet fits in it (its own 100vh - 32 px reached over the bar by a few pixels)
        if (veil.firstChild && veil.firstChild.style) veil.firstChild.style.maxHeight = "calc(100% - 16px)";
        var r = jogPanelEl && isJogOpen() && typeof jogPanelEl.getBoundingClientRect === "function" ? jogPanelEl.getBoundingClientRect() : null;
        var room = jogVeilRoom(r, window.innerWidth, parseFloat(veil.style.right) || 0);
        if (!room) return veil;
        veil.style.paddingLeft = room.left + "px";
        veil.style.paddingRight = room.right + "px";
        veil.style.boxSizing = "border-box";
        if (veil.firstChild && veil.firstChild.style) veil.firstChild.style.maxWidth = "100%"; // the sheet fits the room beside the panel
        return veil;
      }
