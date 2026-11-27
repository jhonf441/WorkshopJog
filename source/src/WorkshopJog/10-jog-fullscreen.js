      // ---- Jog panel: full screen mode (hides the other floating widgets while it lasts) ----

      // Reported live 2026-10-08: in the jog's full screen, another
      // floating widget appeared ON TOP (visible, interactive) while the
      // one that was open stayed BEHIND -- inconsistent stacking order.
      // Cause: Element.requestFullscreen() promotes the jog panel to
      // the browser's special "top layer" (by spec, above
      // the WHOLE normal document regardless of z-index) -- but that
      // top layer is exclusive to ONE element (the one that is
      // fullscreen); the other floating widgets live OUTSIDE that layer, in the normal
      // document, and their exact stacking behaviour against a top layer
      // varies between browsers -- there is no reliable way to guarantee
      // they stay hidden with z-index alone. Simpler and 100% reliable:
      // hide them explicitly while the jog is in full screen (it is a
      // "focus mode" for the jog) and return them to their previous state on exit.
      // Every floating widget of the family says so itself with the attribute data-workshop-float (the Jog does not
      // know their ids). It saves in the dataset WHICH ones it hid (so as not to reappear something
      // that the widget's own logic had already hidden before entering).
      function jogHideOtherWidgetsForFullscreen(hide) {
        Array.prototype.forEach.call(document.querySelectorAll("[data-workshop-float]"), function (el) {
          if (hide) {
            if (el.style.display !== "none") {
              el.dataset.jogFsHidden = "1";
              el.style.display = "none";
            }
          } else if (el.dataset.jogFsHidden === "1") {
            delete el.dataset.jogFsHidden;
            el.style.display = "";
          }
        });
      }

      function jogApplyFullscreen(on) {
        jogIsFullscreen = on;
        jogHideOtherWidgetsForFullscreen(on);
        try {
          localStorage.setItem(JOG_FS_KEY, on ? "1" : "0");
        } catch (e) {
          /* no critico */
        }
        if (!jogPanelEl) return;
        if (on) {
          jogPanelEl.dataset.fsLock = "1"; // ver guard en makeDraggableByHandle -- no arrastrar mientras esta en pantalla completa
          if (jogHeaderEl) jogHeaderEl.style.zoom = "";
          if (jogBodyEl) jogBodyEl.style.zoom = "";
          if (jogStopDockEl) jogStopDockEl.style.zoom = "";
          jogPanelEl.style.position = "fixed";
          jogPanelEl.style.left = "0";
          jogPanelEl.style.top = "0";
          jogPanelEl.style.width = "100vw";
          jogPanelEl.style.height = "100vh";
          jogPanelEl.style.display = "flex";
          jogPanelEl.style.flexDirection = "column";
          jogPanelEl.style.alignItems = "center";
          if (jogHeaderEl) jogHeaderEl.style.width = "100%";
          var req =
            jogPanelEl.requestFullscreen || jogPanelEl.webkitRequestFullscreen || jogPanelEl.mozRequestFullScreen;
          if (req) {
            req
              .call(jogPanelEl)
              .then(jogComputeAndApplyBodyScale)
              .catch(function () {
                // Rejected (needs a direct user gesture, not
                // supported, etc) -- continue with the CSS scaling alone.
                jogComputeAndApplyBodyScale();
              });
          } else {
            jogComputeAndApplyBodyScale();
          }
        } else {
          delete jogPanelEl.dataset.fsLock;
          var exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
          if (exit && (document.fullscreenElement || document.webkitFullscreenElement)) {
            exit.call(document).catch(function () {
              /* ya estaba afuera */
            });
          }
          // "position" is NOT cleared to "" -- unlike
          // display/flexDirection/etc (which were never set before
          // entering fullscreen, so "" returns them correctly to the
          // default), "position:fixed" is part of the panel's BASE
          // cssText (always needed, so that dragging with left/top
          // works) -- clearing it to "" left it at position:static,
          // taking the whole panel out of its floating place (it ended up
          // pushed into the page's normal flow, invisible at
          // the expected position -- reported live 2026-10-08: "exiting
          // full screen makes the button disappear"). It has to be
          // RESTORED explicitly, not just remove the override.
          jogPanelEl.style.position = "fixed";
          jogPanelEl.style.display = "";
          jogPanelEl.style.flexDirection = "";
          jogPanelEl.style.alignItems = "";
          // "width" has the same problem as "position" above --
          // it is also part of the base cssText (JOG_PANEL_W), restore
          // explicitly instead of clearing to "".
          jogPanelEl.style.width = JOG_PANEL_W + "px";
          jogPanelEl.style.height = "";
          if (jogHeaderEl) jogHeaderEl.style.width = "";
          if (jogBodyEl) {
            jogBodyEl.style.transform = "";
            // Go back to the normal limit (not to "" -- without a limit the panel
            // can grow workshop than the screen again, see JOG_BODY_MAX_H).
            jogBodyEl.style.maxHeight = JOG_BODY_MAX_H;
            jogBodyEl.style.overflowY = "auto";
            jogBodyEl.style.marginBottom = "";
          }
          jogReclampPanel();
        }
        jogFsPaint(on);
      }

      // The phone's full screen button: the family's icon (mdi-fullscreen / mdi-fullscreen-exit, 18 px, the font DWC already loads), its words in
      // aria-label and title. Before it said the two letters F S, an acronym nobody reads (ux, 2026-11-23, DESIGN 6).
      function jogFsPaint(on) {
        if (!jogFsBtn) return;
        var words = i18nT(on ? 'jog.exit_full_screen' : 'jog.full_screen');
        jogFsBtn.textContent = "";
        var ic = document.createElement("span");
        ic.className = "mdi " + (on ? "mdi-fullscreen-exit" : "mdi-fullscreen");
        ic.setAttribute("aria-hidden", "true");
        ic.style.cssText = "font-size:18px;line-height:1;color:inherit;pointer-events:none;";
        jogFsBtn.appendChild(ic);
        jogFsBtn.title = words;
        jogFsBtn.setAttribute("aria-label", words);
      }

      function jogToggleFullscreen() {
        jogApplyFullscreen(!jogIsFullscreen);
      }
