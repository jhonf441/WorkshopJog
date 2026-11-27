      // ---- Why the jog does not move, under the controls (ESTANDAR 2, N3; 2026-11-05) ----
      // A missing session or a role that cannot move the machine is not an error and not a one-time flash: it is ONE persistent reason under the status
      // line (13 px, the color of its cause). The floating panel has no page bar with the sign-in chip, so the reason carries the way out itself
      // (project rule 2026-11-06): "Sign in" while nobody is, "Change role" when the role is too low; both open the name + PIN dialog. A real failure
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

      // The tap on a locked launcher, and the button next to the reason: the name + PIN dialog (a sign-in, or another person).
      // openAfter (the launcher): once the PIN is accepted the jog opens by itself when it is no longer locked (owner 2026-11-23, note 10: the
      // person had to tap a second time). The button inside the panel passes nothing: the panel is already open.
      // The permissions of the new person can arrive a moment after the PIN: workshopLoginThen (src/_shared/01-api-auth.js) asks again for up to 3 s.
      function jogPanelLockTap(openAfter) {
        if (typeof workshopLogin !== "function") return;
        if (openAfter && typeof workshopLoginThen === "function") {
          workshopLoginThen(function () { return jogShouldOpenAfterLogin(true, isJogOpen(), jogPanelLock()); }, jogExpand);
          return;
        }
        var asked = workshopLogin();
        if (!openAfter || !asked || typeof asked.then !== "function") return;
        asked.then(function (ok) {
          if (jogShouldOpenAfterLogin(ok, isJogOpen(), jogPanelLock())) jogExpand();
        }, function () {});
      }

      // Pure: open the jog after a sign-in? Only when the PIN was accepted, it is still closed and nothing locks it any more.
      function jogShouldOpenAfterLogin(ok, open, lock) {
        return !!ok && !open && !lock;
      }

      function jogReasonPaint() {
        if (!jogStatusEl || !jogStatusEl.parentNode) return;
        var state = typeof workshopSessionState === "function" ? workshopSessionState() : "";
        var kind = jogReasonKindOf(jogSignedOut(), jogRoleNow().move, state);
        // the sentence of the service (profile, ceiling, condition...) when it has answered, the one of the role otherwise (17-role-access.js)
        var svc = kind === "role" ? jogAccessNote("move") : null;
        var key = kind + "|" + (typeof workshopNoticeStamp === "function" ? workshopNoticeStamp() : "") + "|" + (svc ? svc.kind + svc.text : "");
        if (jogReasonEl && jogReasonEl.getAttribute("data-key") === key && jogReasonEl.parentNode) return;
        if (jogReasonEl && jogReasonEl.parentNode) jogReasonEl.parentNode.removeChild(jogReasonEl);
        jogReasonEl = null;
        if (!kind) return;
        jogReasonEl = workshopReasonEl(svc ? svc.kind : kind, svc ? svc.text : workshopNoticeText(kind, "operator"), i18nT("subjects_jog.jog_panel"));
        jogReasonEl.setAttribute("data-key", key);
        jogReasonEl.style.flexWrap = "wrap";
        var lock = jogPanelLockOf(kind);
        if (lock) {
          // the way out of the lock, in the panel itself (there is no page bar here): one small button after the words
          var b = document.createElement("button");
          b.type = "button";
          b.className = "wf-btn" + (lock.kind === "session" ? " wf-main" : "");
          var bIcon = document.createElement("span");
          bIcon.className = "wf-btn-icon mdi " + (lock.kind === "session" ? "mdi-account-lock-outline" : "mdi-account-switch-outline"); // the icon of the action, as in the shared notice
          bIcon.setAttribute("aria-hidden", "true");
          b.appendChild(bIcon);
          var bText = document.createElement("span");
          bText.textContent = i18nT(lock.kind === "session" ? "jog.lock_sign_in" : "jog.lock_change_role");
          b.appendChild(bText);
          b.style.cssText = "min-height:44px;padding:0 10px;font-size:12px;";
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
