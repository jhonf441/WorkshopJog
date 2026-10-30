      // ---- Arranque de WorkshopJog ----

      var JOG_ICON =
        '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><line x1="12" y1="1" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="23"/><line x1="1" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="23" y2="12"/></g>';

      // Launcher in the sidebar (WorkshopControlBar), if installed.
      workshopRegisterPanel("jog", {
        title: i18nT('common.jog'),
        icon: JOG_ICON,
        order: 20,
        description:
          i18nT('main.opens_the_floating_jog_panel_when'),
        toggle: jogToggle,
        state: function () {
          var open = isJogOpen();
          var closing = !!(jogPanelEl && jogPanelEl.dataset.closing === "1");
          return {
            open: open,
            busy: closing,
            statusText: closing ? i18nT('main.stopping_movement_and_closing') : open ? i18nT('main.open_on_this_screen') : i18nT('main.closed'),
          };
        },
      });

      // Runs the cleanup registered by the panel (window listeners,
      // keyboard, Advanced tab poll...).
      function jogTeardownPanel() {
        jogPanelTeardownFns.forEach(function (fn) {
          try {
            fn();
          } catch (e) {
            /*  continue with the rest */
          }
        });
        jogPanelTeardownFns = [];
      }

      // Without a sidebar installed, the jog shows its own floating button.
      workshopFallbackLauncher("jog", JOG_ICON, "Jog", 20, jogToggle, isJogOpen);

      jogAjMachLoad(); // velocidad/curva de la maquina (sys/workshop/config/jog.json, 18-settings.js)
      workshopWhenReady(createJogWidgets);
      workshopWatchDom(function () {
        if (jogPanelEl && !document.getElementById(JOG_PANEL_ID)) {
          jogTeardownPanel(); // the deleted panel's listeners, out
          jogPanelEl = null;
          createJogWidgets();
        }
      });
      workshopGuardFocus(function () {
        return [jogPanelEl];
      });

      // Jog timers: the status one starts right away (do not wait for the first
      // interval to know whether it is enabled); the heartbeat always
      // runs but is a cheap no-op while no knob is grabbed
      // nor Z held (see jogHeartbeat). jogCheckEnabled also publishes
      // /machine/status in the registry for the sidebar.
      jogCheckEnabled();
      var jogStatusPollTimer = setInterval(jogCheckEnabled, JOG_STATUS_POLL_MS);
      var jogHeartbeatTimer = setInterval(jogHeartbeat, JOG_HEARTBEAT_MS);
      var jogControlTimer = setInterval(jogControlTick, 1000); // who has the control (17-control.js)
      var jogIdentityOff = workshopOnIdentity(jogRoleSyncSafe); // the panel is rebuilt for the new role (17-role.js)

      workshopOnStop(function () {
        clearInterval(jogHeartbeatTimer);
        clearInterval(jogStatusPollTimer);
        clearInterval(jogControlTimer);
        jogIdentityOff();
        // Nada sostenido despues de detener: stop explicito al backend.
        jogPointerId = null;
        jogSendStopXY();
        jogStopZHold();
        jogTeardownPanel();
        var panel = document.getElementById(JOG_PANEL_ID);
        if (panel) panel.remove();
        jogPanelEl = null;
        workshopUnregisterPanel("jog");
      });
      workshopWatchEnabled();
