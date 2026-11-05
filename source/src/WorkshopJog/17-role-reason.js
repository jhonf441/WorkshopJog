      // ---- Why the jog does not move, under the controls (ESTANDAR 2, N3; 2026-11-05) ----
      // A missing session or a role that cannot move the machine is not an error and not a one-time flash: it is ONE persistent reason under the status
      // line (13 px, the color of its cause, no sign-in button: the chip of the bar has it). A real failure (a STOP that failed) keeps its red line.
      var jogReasonEl = null;

      // Pure: the cause of a jog that cannot move for a person: "resolving" (the session is being checked: calm, never red) | "session" | "role" | "" (it may move)
      function jogReasonKindOf(signedOut, canMove, state) {
        if (state === "resolving") return "resolving";
        if (signedOut) return "session";
        return canMove ? "" : "role";
      }

      function jogReasonPaint() {
        if (!jogStatusEl || !jogStatusEl.parentNode) return;
        var state = typeof workshopSessionState === "function" ? workshopSessionState() : "";
        var kind = jogReasonKindOf(jogSignedOut(), jogRoleNow().move, state);
        var key = kind + "|" + (typeof workshopNoticeStamp === "function" ? workshopNoticeStamp() : "");
        if (jogReasonEl && jogReasonEl.getAttribute("data-key") === key && jogReasonEl.parentNode) return;
        if (jogReasonEl && jogReasonEl.parentNode) jogReasonEl.parentNode.removeChild(jogReasonEl);
        jogReasonEl = null;
        if (!kind) return;
        jogReasonEl = workshopReasonEl(kind, workshopNoticeText(kind, "operator"));
        jogReasonEl.setAttribute("data-key", key);
        jogStatusEl.parentNode.insertBefore(jogReasonEl, jogStatusEl.nextSibling);
      }
