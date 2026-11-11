      // ---- Why the jog does not move, under the controls (ESTANDAR 2, N3; 2026-11-05) ----
      // A missing session or a role that cannot move the machine is not an error and not a one-time flash: it is ONE persistent reason under the status
      // line (13 px, the color of its cause). The floating panel has no page bar with the sign-in chip, so the reason carries the way out itself
      // (owner rule 2026-11-06): "Sign in" while nobody is, "Change role" when the role is too low; both open the name + PIN dialog. A real failure
      // (a STOP that failed) keeps its red line.
      var jogReasonEl = null;

      // Pure: the cause of a jog that cannot move for a person: "resolving" (the session is being checked: calm, never red) | "session" | "role" | "" (it may move)
      function jogReasonKindOf(signedOut, canMove, state) {
        if (state === "resolving") return "resolving";
        if (signedOut) return "session";
        return canMove ? "" : "role";
      }

      // Pure: the lock of the launcher (the bar does not open a jog that needs a session or a role; it signs in instead). null = it may open.
      // While the session is being checked nothing is locked yet (and nothing moves either: the panel says "checking").
      function jogPanelLockOf(kind) {
        if (kind === "session") return { kind: "session" };
        if (kind === "role") return { kind: "role", needed: "operator" };
        return null;
      }

      function jogPanelLock() {
        if (pluginStopped) return null;
        var state = typeof workshopSessionState === "function" ? workshopSessionState() : "";
        return jogPanelLockOf(jogReasonKindOf(jogSignedOut(), jogRoleNow().move, state));
      }

      // The tap on a locked launcher, and the button next to the reason: the name + PIN dialog (a sign-in, or another person)
      function jogPanelLockTap() {
        if (typeof workshopLogin === "function") workshopLogin();
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
        jogReasonEl.style.flexWrap = "wrap";
        var lock = jogPanelLockOf(kind);
        if (lock) {
          // the way out of the lock, in the panel itself (there is no page bar here): one small button after the words
          var b = document.createElement("button");
          b.type = "button";
          b.className = "wf-btn" + (lock.kind === "session" ? " wf-main" : "");
          b.textContent = i18nT(lock.kind === "session" ? "jog.lock_sign_in" : "jog.lock_change_role");
          b.style.cssText = "min-height:28px;padding:0 10px;font-size:12px;";
          b.setAttribute("data-tip-pass", "1");
          b.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
          b.addEventListener("click", function (ev) {
            ev.stopPropagation();
            jogPanelLockTap();
          });
          jogReasonEl.appendChild(b);
        }
        jogStatusEl.parentNode.insertBefore(jogReasonEl, jogStatusEl.nextSibling);
      }
