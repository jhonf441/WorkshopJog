      // ---- The Jog by role: build-time hiding and rebuild when the role changes (F3-J, 2026-10-21) ----
      // The rule (what each role sees) is pure and lives in 08-role.js. Here: the panel is BUILT for the view that is true now
      // (jogRoleKey), and rebuilt when the view changes (somebody logs in or out, or the machine changes to a mode the operator may
      // not run). Nothing is toggled in place, so a role never leaves a half hidden panel.

      var jogRoleKey = null; // key of the view the panel in the page was built for (null = no panel yet)

      // Hides every child of `root` that is neither a kept element, nor one that contains a kept element, nor inside one. The kept ones
      // (the position card) may sit anywhere in the tree (in design 2 they are inside the block of controls).
      function jogRoleHideExcept(root, keep) {
        Array.prototype.slice.call(root.children || []).forEach(function (c) {
          var inside = keep.some(function (k) { return k === c || (c.contains && c.contains(k)); });
          var isKept = keep.some(function (k) { return k === c || (k.contains && k.contains(c)); });
          if (isKept) return;
          if (inside) jogRoleHideExcept(c, keep);
          else c.style.display = "none";
        });
      }

      // Called at the end of createJogPanel with the pieces of the panel. A viewer keeps the position card, the maximum speeds and STOP.
      function jogRoleApplyBuild(view, parts) {
        jogRoleKey = view.key;
        if (view.move) return;
        jogRoleHideExcept(parts.body, parts.keep);
        if (parts.quick) parts.quick.style.display = "none"; // Home / X / Y / Z / Probe in the dock: they move the machine
      }

      function jogRoleRebuild() {
        if (pluginStopped || !jogPanelEl) return;
        jogReleaseAllHolds();
        jogTeardownPanel();
        var panel = document.getElementById(JOG_PANEL_ID);
        if (panel) panel.remove();
        jogPanelEl = null;
        createJogWidgets();
      }

      // The response of the machine (a file shared by every screen) and the maker of macro buttons (a second system next to the bar buttons)
      // are for technician and admin; the buttons themselves are pressed by everybody. pages = [[id, label], ...] of the settings sheet.
      function jogRolePages(pages) {
        if (jogRoleNow().advanced) return pages;
        return pages.filter(function (p) { return p[0] !== "speed" && p[0] !== "macros"; });
      }

      // The tab of the settings sheet to open: the saved one unless this role does not have it.
      function jogRoleTab(saved) {
        if (!saved || (!jogRoleNow().advanced && (saved === "speed" || saved === "macros"))) return "see";
        return saved;
      }

      function jogRoleSyncSafe() {
        try {
          jogRoleSync();
        } catch (e) {
          console.error("[WorkshopJog] role:", e);
        }
      }

      // Called when the identity changes and every second (the mode may change what an operator can run).
      function jogRoleSync() {
        if (pluginStopped || jogRoleKey === null) return;
        if (jogRoleNow().key !== jogRoleKey) jogRoleRebuild();
      }

      // ---- Shortcut to the page of Motors (the crash sensitivity is edited only there) ----

      // Opens a page of DWC without reloading (the router of the root instance); a normal navigation when there is no router.
      function jogGoToPage(path) {
        if (workshopHostPush(path)) return;
        window.location.href = path;
      }

      // A row with a text and a button, or null when this role has no access or Motors is not installed (hidden, not disabled).
      // el(tag, css, text) is the small element maker of the caller.
      function jogMotorsLinkMake(el) {
        if (!jogRoleNow().motorsLink) return null;
        var path = jogMotorsPath(workshopPathExists);
        if (!path) return null;
        var row = el("div", "display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap;");
        row.appendChild(el("span", "flex:1 1 170px;font-size:12px;color:#b0bec5;", i18nT("free.crash_in_motors")));
        var b = el("button", "padding:6px 12px;border-radius:6px;border:1px solid #fff;background:#455a64;color:#fff;cursor:pointer;", i18nT("free.open_motors"));
        b.type = "button";
        b.addEventListener("click", function () {
          jogGoToPage(path);
        });
        row.appendChild(b);
        return row;
      }

      // Signed out: the service has users and this browser has no session (the role is then a viewer and nothing moves).
      function jogSignedOut() {
        var id = typeof workshopIdentity === "function" ? workshopIdentity() : null;
        return !!(id && id.configured && typeof workshopAuthToken === "function" && !workshopAuthToken());
      }

      // Guard of the quick buttons (Home, Probe...): true = blocked. A blocked tap never ends silent: it says why in the status line
      // (red for 5 s) and, when the reason is that nobody is signed in, opens the name + PIN sign.
      function jogBlockedExplain() {
        if (jogMachineFree()) return false;
        if (!jogStatusEl) return true;
        var signedOut = jogSignedOut();
        jogUpdateStatusText();
        if (signedOut || !jogRoleNow().move) {
          jogStatusEl.textContent = i18nT(signedOut ? "jog.sign_in_needed" : "jog.role_view_only");
        }
        jogStatusEl.style.color = "#ef9a9a";
        clearTimeout(jogBlockedExplain.timer);
        jogBlockedExplain.timer = setTimeout(jogUpdateStatusText, 5000);
        if (signedOut && typeof workshopLogin === "function") {
          workshopLogin().then(function () {
            jogUpdateStatusText();
          });
        }
        return true;
      }

      // A touch on the ring or the sliders while the jog is blocked (they ignore the finger then: pointer-events none) lands on the panel body:
      // it says why, and opens the sign-in when nobody is signed in. Listens on the body of the panel (called once from 10-jog.js).
      function jogBlockedWatch(body) {
        body.addEventListener("pointerdown", function (ev) {
          if (jogEnabled && jogRoleNow().move) return;
          var over = [jogRingEl, jogXTrackEl, jogYTrackEl, jogZTrackEl].some(function (el) {
            if (!el) return false;
            var r = el.getBoundingClientRect();
            return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
          });
          if (over) jogBlockedExplain();
        });
      }
