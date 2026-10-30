      // ---- Start-up chip of the Jog (2026-10-20) ----
      //
      // A person who installs the Jog on THEIR machine may not have what one of its functions calls (src/_shared/16-startup.js):
      //   failsafe  = move without limits: the board macro that stops it if the page dies, and the line in sys/daemon.g that runs it
      // (the air and light macros are the control bar's: its start-up card asks for them, the Jog does not ship a second copy)
      // green = ready, orange = only the example (everything commented) or the daemon line is still to be added, red = missing.
      // Nothing here moves the machine or writes over a file of the person.

      var JOG_STARTUP_FAILSAFE = "0:/sys/workshop/macros/jogFreeFailsafe.g";

      // Pure: state of the failsafe from the text of the macro (null = missing) and of daemon.g (null = missing).
      // The macro missing is red; present but not called from daemon.g is orange (the line is added the first time the mode is armed).
      function jogStartupStateFailsafe(macroText, daemonText) {
        if (macroText === null || macroText === undefined) return "missing";
        return String(daemonText || "").indexOf("jogFreeFailsafe") >= 0 ? "configured" : "example";
      }

      function jogStartupRead(path) {
        return tzGetText(path).then(
          function (t) {
            return t;
          },
          function () {
            return null;
          }
        );
      }

      var JOG_STARTUP_GROUPS = {
        failsafe: { label: "startup_jog.g_failsafe", description: "startup_jog.g_failsafe_desc", icon: "service" },
      };

      var JOG_STARTUP_ROWS = [
        {
          id: "failsafe",
          group: "failsafe", groupLabel: JOG_STARTUP_GROUPS.failsafe.label, groupDescription: JOG_STARTUP_GROUPS.failsafe.description, groupIcon: JOG_STARTUP_GROUPS.failsafe.icon,
          label: "startup_jog.failsafe", help: "startup_jog.failsafe_tip",
          what: "startup_jog.failsafe_what", why: "startup_jog.failsafe_for", ifMissing: "startup_jog.failsafe_missing",
          texts: { configured: "startup_jog.failsafe_ok", example: "startup_jog.failsafe_no_daemon", missing: "startup_jog.failsafe_none" },
          check: function () {
            return Promise.all([jogStartupRead(JOG_STARTUP_FAILSAFE), jogStartupRead("0:/sys/daemon.g")]).then(function (r) {
              return jogStartupStateFailsafe(r[0], r[1]);
            });
          },
        },
      ];

      // The shared start-up input. Its chip is NOT put in the header any more (2026-10-21): the first thing to do lives in the gear (a card at the top
      // of the settings sheet, jogStartupCard) and the gear shows an orange dot while something is pending (jogStartupDotMake).
      var jogStartupInput = null;
      var jogGearDot = null;

      function jogStartupBadge(res) {
        if (jogGearDot) jogGearDot.style.display = res && res.ready === false ? "block" : "none";
      }

      function jogStartupCreate() {
        jogStartupInput = workshopStartupInput({ plugin: "WorkshopJog", rows: JOG_STARTUP_ROWS, createOnStart: true, subtitle: "startup_jog.modal_sub", onChange: jogStartupBadge });
        return jogStartupInput;
      }

      // Starts the checks, then appends the last button of the header (the chip itself stays out of the header).
      function jogStartupMount(header, lastButton) {
        var chip = jogStartupCreate();
        chip.refresh();
        header.appendChild(lastButton);
      }

      // The orange dot on the gear button.
      function jogStartupDotMake() {
        var d = document.createElement("span");
        d.style.cssText = "position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:5px;background:#e65100;border:2px solid #263238;display:none;pointer-events:none;";
        jogGearDot = d;
        if (jogStartupInput) jogStartupBadge(jogStartupInput.summary());
        return d;
      }

      // The card at the top of the settings sheet: what to do first, and a big button. onOpen closes the sheet and opens the dialog.
      function jogStartupCard(onOpen) {
        var card = document.createElement("div");
        if (!jogStartupInput) return card;
        var res = jogStartupInput.summary();
        var pending = res && res.ready === false ? res.pending : 0;
        var ready = !!res && res.ready === true;
        var color = pending ? "#e65100" : ready ? "#2e7d32" : "#1976d2";
        card.style.cssText = "margin:10px 12px 0 12px;padding:10px 12px;border-radius:10px;border:2px solid " + color + ";background:" + (pending ? "rgba(230,81,0,0.14)" : ready ? "rgba(46,125,50,0.14)" : "rgba(25,118,210,0.14)") + ";";
        var row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:8px;";
        var badge = document.createElement("span");
        badge.textContent = ready ? "✓" : "1";
        badge.style.cssText = "flex:none;width:22px;height:22px;border-radius:11px;background:" + color + ";color:#fff;font-size:13px;font-weight:bold;display:flex;align-items:center;justify-content:center;";
        var title = document.createElement("span");
        title.textContent = i18nT("startup_jog.first_title");
        title.style.cssText = "font-size:14px;font-weight:bold;color:#fff;";
        row.appendChild(badge);
        row.appendChild(title);
        card.appendChild(row);
        var text = document.createElement("div");
        text.textContent = ready ? i18nT("startup_jog.first_ready") : i18nT("startup_jog.first_intro") + (pending ? " " + i18nT("startup_jog.first_pending", { n: pending }) : "");
        text.style.cssText = "font-size:12px;color:rgba(255,255,255,0.85);margin:6px 0 8px;";
        card.appendChild(text);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = ready ? i18nT("startup_jog.first_review") : i18nT("startup_jog.first_button");
        btn.style.cssText = "width:100%;min-height:44px;border-radius:6px;border:1px solid rgba(255,255,255,0.35);background:" + (ready ? "#455a64" : "#1976d2") + ";color:#fff;font-size:13px;font-weight:bold;cursor:pointer;";
        btn.addEventListener("click", onOpen);
        card.appendChild(btn);
        return card;
      }
