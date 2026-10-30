      // ---- 3. Floating jog (round X/Y knob + Z) ----
      //
      // 2026-10-07: the jog's real engine (ramp, feed quantization,
      // watchdog, G91/G90) moved to a Python backend (jog_move.py,
      // WorkshopService/dsf plugin) that runs in its OWN thread with its
      // OWN direct connection to DCS -- this JS chunk NO LONGER sends the
      // movement G-code itself. Reason: after several rounds of fixes on the
      // browser side (setPointerCapture, watchdogs, HTTP pipelining)
      // the jog kept failing -- "it released by itself" and "it kept
      // moving after release" kept happening because the real cause
      // was never the code of THIS file: it was the kiosk's own Chromium
      // (unreliable pointer capture on Wayland+touch, the main
      // thread shared with the camera stream added the same day,
      // kiosk relaunches, cache). A dedicated Python thread does not
      // depend on any of that.
      //
      // What DOES stay here: the whole UI (knob, Z buttons, speed
      // slider) and sending the TARGET state -- on every pointerdown/
      // pointermove of the knob, or Z press, a jog.* operation of the API
      // P"jog" is sent with the current vector/sign (see jogSendXY/jogSendZ). A
      // light heartbeat (JOG_HEARTBEAT_MS) resends that same state
      // while it is still held, even if there is no new pointermove
      // (a perfectly still finger does not always generate events) -- so
      // the backend's watchdog (the one that really cuts the
      // movement if the browser stops refreshing) never expires from
      // a plain hold without tremor. On release an explicit
      // S"stop_xy"/S"stop_z" is sent as well.
      //
      // Safety: the panel disables itself (dimmed knob, no
      // touch response) unless `state.status` of the object model is
      // "idle" or "busy" (the same check that also runs, on its own,
      // INSIDE the backend before sending each movement -- this one
      // here is only for the UI, the real enforcement is server-side and does not
      // depend on this JS code behaving well).

      var JOG_STATUS_POLL_MS = 2000;
      // Heartbeat: while the knob is held or a Z button is
      // held, the current state is resent every JOG_HEARTBEAT_MS --
      // the backend's watchdog (jog_move.py, ~900ms) needs signals
      // more frequent than that so as not to cut a legitimate hold; this
      // interval gives a comfortable margin (3x) without flooding with requests.
      var JOG_HEARTBEAT_MS = 300;

      // Speed control: a continuous slider (0-100%) instead of fixed
      // presets -- `jogSpeedPercent` scales linearly between
      // JOG_FEED_MIN and JOG_FEED_MAX (mm/min) for X/Y; Z uses the SAME
      // speed knob but always slower (JOG_Z_FEED_RATIO).
      // These constants also exist (duplicated on purpose, see
      // jog_move.py) on the Python side -- here they are only used for the
      // status text ("Ready · X mm/min"), the real calculation that actually
      // moves the machine is the backend's. The chosen % is sent as
      // the speed argument in every jog.xy / jog.z.
      var JOG_FEED_MIN = 60;
      var JOG_FEED_MAX = 6000;
      var JOG_Z_FEED_RATIO = 0.35;
      var JOG_SPEED_PERCENT_KEY = "emergencyFabJogSpeedPercent";
      var JOG_EXPANDED_KEY = "emergencyFabJogExpanded";

      function loadSpeedPercent() {
        try {
          // Settings (gear): "always start at N %" (18-settings.js; it is
          // read directly because this runs before that file loads)
          var aj = JSON.parse(localStorage.getItem("workshopJogSettings") || "{}");
          if (typeof aj.speedStart === "number" && aj.speedStart >= 1 && aj.speedStart <= 100) return aj.speedStart;
          var raw = localStorage.getItem(JOG_SPEED_PERCENT_KEY);
          if (raw === null) return 50;
          var v = parseFloat(raw);
          if (v >= 1 && v <= 100) return v;
        } catch (e) {
          /* ignorar -- default 50% */
        }
        return 50;
      }

      function saveSpeedPercent(v) {
        try {
          localStorage.setItem(JOG_SPEED_PERCENT_KEY, String(v));
        } catch (e) {
          /* no critico */
        }
      }

      function jogMaxFeedXY() {
        return JOG_FEED_MIN + (jogSpeedPercent / 100) * (JOG_FEED_MAX - JOG_FEED_MIN);
      }

      function jogMaxFeedZ() {
        return jogMaxFeedXY() * JOG_Z_FEED_RATIO;
      }

      var jogSpeedPercent = loadSpeedPercent();
      var jogEnabled = false; // fail safe: deshabilitado hasta confirmar state.status "idle" o "busy"
      var jogStatusFailCount = 0; // fallos consecutivos de /machine/status -- ver catch() en jogCheckEnabled
      var jogLastMachineStatus = null;
      var jogLastJobFile = null; // file name of the job in progress, for the block text
      // LIVE job (a program through the bridge): RRF does not see it as a job
      // (state.status stays "busy", never "processing"), so the jog was not
      // blocked (reported 2026-10-08). WorkshopService publishes
      // plugins.WorkshopService.data.liveJob = {activo, nombre, desde}
      // with job.start / job.end (API). It is blocked while active AND
      // the machine is "busy": if it stays "idle" (live job paused, or a
      // job that ended without "end"), it is NOT blocked -- an old mark
      // can never leave the jog stuck forever.
      var jogLiveJob = null;
      // Hysteresis: between lines of a live job RRF goes through "idle" for an
      // instant and the jog unblocked and reblocked (seen 2026-10-08,
      // stop_xy/stop_z sent loose in the middle of the job). With an open job it
      // unblocks only after JOG_LIVE_IDLE_MS in a row without "busy".
      var JOG_LIVE_IDLE_MS = 5000;
      var jogLiveBusyTs = 0;
      // Reason if the Pi service is missing (no channel for the jog); null = it is there
      var jogWithoutService = null;
      // "How it works" is explained right here (2026-10-10: the GitHub link
      // gave 404 while the repos are private, and without the Pi service
      // there is no workshop page to send to either)
      var jogExplainsOpen = false;
      var JOG_EXPLAINS_COMMUNICATION =
        i18nT('jog.the_system_sends_the_jog_to');
      // The name of the live job in brackets, only when it says something: the default name (in either language) is the
      // same words as the message ("live job (Live job)" read as a repeat).
      function jogNameLive() {
        var n = jogLiveJob && jogLiveJob.name ? String(jogLiveJob.name).trim() : "";
        return n && !workshopDefaultKey(n, ["svc.live_job_default_name"]) ? " (" + n + ")" : "";
      }

      function jogLiveJobBlocks() {
        if (!jogLiveJob) return false;
        if (jogLastMachineStatus === "busy") return true;
        return Date.now() - jogLiveBusyTs < JOG_LIVE_IDLE_MS;
      }
      var jogPointerId = null;
      var jogZHeldSign = 0; // -1, 0 o 1 -- Z+/Z- sostenido ahora mismo (perilla/boton Z Y teclado, ver jogHeartbeat)
      var jogZPointerId = null;
      var jogKeyboardXYHeld = false; // true mientras alguna flecha este sostenida (modo avanzado) -- ver jogHeartbeat
      var jogKbNX = 0; // vector of the held arrows -- the heartbeat resends THIS one, not jogCurrentNX/NY
      var jogKbNY = 0;
      // Step: +/- HELD = continuous movement (request 2026-10-08:
      // "that the + and - buttons can be left pressed for long movements").
      // {axis: "X"|"Y"|"Z", sign: 1|-1} while held; the
      // heartbeat resends it just like the knob (backend jog_move.py:
      // it only stops if it stops receiving, it respects limits with a margin).
      var jogStepHold = null;
      var jogKnobNX = 0; // last vector of the knob (Free mode) -- ditto, separate from the keyboard
      var jogKnobNY = 0;
      // Cosas a deshacer al ocultar el jog (listeners en window, timers)
      // -- ver jogWinOn() dentro de createJogPanel y jogTeardownPanel().
      var jogPanelTeardownFns = [];
      // "PageUp"/"PageDown"/"Numpad9"/"Numpad3" (ev.code) or null --
      // declared HERE (not inside createJogPanel, where it is used) for
      // the same reason as jogKeyboardXYHeld above: jogHeartbeat is
      // in this same outer scope and needs to see it. Confirmed
      // live 2026-10-08: leaving it inside createJogPanel threw
      // "ReferenceError: jogHeldZKey is not defined" on EVERY tick of the
      // heartbeat (300ms) -- unlike jogKeyboardXYHeld (which had
      // been moved here correctly at the time), this one was left
      // behind when jogHeartbeat started to need it.
      var jogHeldZKey = null;
      // Last vector sent to the knob (so that the heartbeat knows
      // what to resend while it is still held without a new pointermove).
      var jogCurrentNX = 0;
      var jogCurrentNY = 0;
      var jogXYLastSendAt = 0;
      var jogZLastSendAt = 0;
      // Do not send more often than this even if pointermove fires faster
      // -- fine cadence is no longer needed (the backend's tick handles that), only
      // avoid a flood of redundant requests.
      var JOG_SEND_MIN_GAP_MS = 50;

      // Imantacion al eje en modo Libre -- ver jogApplyAxisSnap mas abajo.
      var jogAxisSnapEnabled = true;

      // Straight mode -- live request 2026-10-08: besides the snapping
      // (a help, it does not force), an EXPLICIT mode with X and Y as separate
      // 1D sliders (same mechanism as Z's), for when
      // total guarantee of a single axis is wanted. "free" = the usual
      // circle (with snapping). Declared HERE (outer scope, not
      // inside createJogPanel) because jogHeartbeat needs them --
      // see the jogHeldZKey lesson above, do not repeat that bug.
      var JOG_AXIS_MODE_KEY = "emergencyFabJogAxisMode";
      var jogAxisMode = "free"; // "free" | "recto"
      var jogStraightXPointerId = null;
      var jogStraightYPointerId = null;
      var jogStraightXVal = 0; // -1..1, solo valido mientras jogStraightXPointerId !== null
      var jogStraightYVal = 0;

      // Set by createJogPanel: it turns off the keyboard mode (which lives in that
      // closure) when closing the panel -- see jogCollapse.
      var jogKeyboardOffHook = null;
      var jogKbRepaint = null; // repaints the keyboard card (set where the card is built)
      var jogPanelEl = null;
      var jogHeaderEl = null;
      var jogStopDockEl = null; // STOP / E-STOP row, pinned under the scrolling body
      var jogBodyEl = null;
      var jogRingEl = null;
      var jogKnobEl = null;
      var jogStatusEl = null;
      var jogAxisMaxEl = null;
      var jogZTrackEl = null; // deslizante de Z (reemplazo de los viejos botones Z+/Z- on/off)
      // X/Y in Straight mode -- declared here (outer scope), NOT inside
      // createJogPanel, for the same reason as jogHeldZKey above:
      // jogSetControlsEnabled (outer scope) needs them.
      var jogXTrackEl = null;
      var jogXThumbEl = null;
      var jogYTrackEl = null;
      var jogYThumbEl = null;
      var jogZThumbEl = null;
      var jogHomeButtons = []; // [Home, X, Y, Z] -- gate propio, mas estricto (idle a secas, ver jogSetHomeEnabled)
      var jogStepMinusBtn = null;
      var jogStepPlusBtn = null;
      var jogStepAxisFn = null; // (axis, sign): one step of the chosen distance (Step tab)

      var JOG_PANEL_ID = "emergency-fab-jog-panel";
      var JOG_PANEL_W = 208;

      // Panel size (request 2026-10-08: "the jog should be able to adjust
      // its size a little, in Chrome or on the phone it stays the same"): buttons
      // A- / A+ in the title bar, from JOG_SCALE_MIN to JOG_SCALE_MAX.
      // It belongs to THIS screen (localStorage). It is applied with CSS zoom on
      // header and body (not on the panel: so the drag's left/top stay
      // in screen px) and the panel's width is multiplied by hand. The
      // controls that read getBoundingClientRect (knob, Z, Straight) keep
      // giving correct values (they are proportions); only the drawing of their
      // "thumb" is divided by jogScale (see jogScale in those places).
      var JOG_SCALE_KEY = "workshopJogScale";
      var JOG_SCALE_MIN = 0.8;
      var JOG_SCALE_MAX = 1.8;
      var JOG_SCALE_STEP = 0.1;
      var jogScale = 1;
      try {
        jogScale = parseFloat(localStorage.getItem(JOG_SCALE_KEY)) || 1;
      } catch (e) {
        jogScale = 1;
      }
      jogScale = Math.min(JOG_SCALE_MAX, Math.max(JOG_SCALE_MIN, jogScale));

      function jogApplyScale(z) {
        jogScale = Math.round(Math.min(JOG_SCALE_MAX, Math.max(JOG_SCALE_MIN, z)) * 10) / 10;
        try {
          localStorage.setItem(JOG_SCALE_KEY, String(jogScale));
        } catch (e) {
          /* no critico */
        }
        if (!jogPanelEl || jogPanelEl.dataset.fsLock === "1") return; // pantalla completa se escala sola
        if (jogHeaderEl) jogHeaderEl.style.zoom = String(jogScale);
        if (jogBodyEl) jogBodyEl.style.zoom = String(jogScale);
        if (jogStopDockEl) jogStopDockEl.style.zoom = String(jogScale);
        jogPanelEl.style.width = Math.round(JOG_PANEL_W * jogScale) + "px";
        jogHeightMaxBody();
        if (jogScaleLabel) jogScaleLabel.title = i18nT('jog.jog_size_this_screen_only', { v: Math.round(jogScale * 100) });
        jogReclampPanel();
      }
      var jogScaleLabel = null;
      // Below 372: the home/step rows are no longer always visible
      // at the same time (see tabs below), but the stop/e-stop row
      // and the tab bar are added -- it is still only an
      // ESTIMATE for the initial clamp, the real size is set by the
      // layout.
      var JOG_PANEL_H_ESTIMATE = 390;
      // Maximum height of the panel body (outside full screen) --
      // live request 2026-10-08: with the Advanced tab open the
      // panel grew workshop than the screen and the minimize button became
      // unreachable. 28px of header + 4px of border + MARGIN above
      // and below; what does not fit scrolls INSIDE the body.
      // the dock (quick actions + STOP / E-STOP, 84 px) sits under the body and never scrolls away
      var JOG_STOP_DOCK_H = jogIsTouch() ? 100 : 84;
      var JOG_STATUS_BAR_H = 44; // fixed status bar under the header
      var JOG_BODY_MAX_H = "calc(100vh - " + (28 + 4 + 2 * MARGIN + JOG_STOP_DOCK_H + JOG_STATUS_BAR_H) + "px)";

      // -- full screen on mobile -- explicit user request
      // for when DWC is opened from a phone (it does not apply to the kiosk,
      // which is already fullscreen by nature running in --app mode). It is
      // implemented with a transform:scale() on the whole panel (it does not
      // rewrite every internal measure) -- pointer events are still
      // tested against the ALREADY transformed box in modern
      // browsers, so nothing needs to be touched in the
      // knob/buttons logic.
      var JOG_FS_KEY = "emergencyFabJogFullscreen";
      var jogIsFullscreen = false;
      // Reported live 2026-10-08: "having full screen and
      // minimizing does not remember that it was in full screen" --
      // jogCollapse() has to exit full screen FOR REAL
      // (hiding the panel is not enough, a fullscreen element
      // hidden with display:none ends up in a strange/undefined state
      // of the browser), but that does not have to erase the user's
      // INTENTION. This in-memory flag (not localStorage -- it is enough
      // for it to last the session, it is "you minimized while in fullscreen")
      // keeps that intention apart from JOG_FS_KEY (which is the
      // longer-term preference, for the restore on page load) so
      // that jogExpand() can ask for fullscreen again -- it can, because
      // that tap on the bar's launcher IS the direct gesture that
      // requestFullscreen() needs.
      var jogWasFullscreenBeforeCollapse = false;
      var jogFsBtn = null;

      // A phone: touch screen and narrow window (16-touch.js). Not the user-agent: the kiosk is a touch screen too, but its
      // window is wider than JOG_NARROW_PX, so it does not get the full screen button.
      function isMobileViewport() {
        return jogIsTouch() && jogIsNarrow();
      }

      // 2026-10-08, second round: v1 only scaled the panel with a
      // CSS transform INSIDE the normal page -- on a real phone that does NOT hide
      // the browser's address bar/UI, so it "does not do real fullscreen"
      // (reported live). Fix: use the real Fullscreen API
      // (Element.requestFullscreen()) on the panel -- that does hide all the
      // browser chrome. A fullscreen element is forced by the browser to 100%x100% of the
      // screen (position:fixed;top:0;left:0 by spec, overriding any
      // manual left/top), so the scaling is now applied to BODY
      // (not the whole panel): the header stays at normal size
      // at the top (better too, so the exit button does not end up huge),
      // and the body grows with a transform + is centered with the panel's
      // flexbox. If the browser does not support/rejects requestFullscreen
      // (old iOS Safari, etc), the CSS scaling alone keeps working,
      // without the chrome hidden -- better than nothing.
      var JOG_FS_MAX_SCALE = 2.2; // cap so that it does not end up huge on a very tall and narrow screen

      function jogComputeAndApplyBodyScale() {
        if (!jogPanelEl || !jogBodyEl) return;
        // Measure WITHOUT scaling and without the max-height/scroll of a PREVIOUS
        // call (e.g. the Home tab, shorter) -- reported live
        // 2026-10-08: "in advanced mode it did not scale to fit the
        // full screen, tapping reload makes it look right". A page
        // reload starts jogBodyEl clean so it "worked"
        // there, but changing tabs INSIDE the same fullscreen
        // session did not -- the previous tab's max-height
        // was still active while the new tab's offsetHeight
        // was measured, clipping naturalH to a wrong value (the OLD
        // limit, not Advanced's real height). transform was already
        // cleared before measuring, but maxHeight/overflowY were not.
        jogBodyEl.style.transform = "";
        jogBodyEl.style.maxHeight = "";
        jogBodyEl.style.overflowY = "";
        var headerH = jogHeaderEl ? jogHeaderEl.offsetHeight : 28;
        var availW = window.innerWidth * 0.94;
        var availH = window.innerHeight * 0.94 - headerH - (jogStopDockEl ? jogStopDockEl.offsetHeight : 0);
        var naturalW = jogBodyEl.offsetWidth || JOG_PANEL_W;
        var naturalH = jogBodyEl.offsetHeight || JOG_PANEL_H_ESTIMATE;
        var scale = Math.min(availW / naturalW, availH / naturalH, JOG_FS_MAX_SCALE);
        // Reported live 2026-10-08: "advanced mode is not seen
        // scaled" -- before this had a floor of 1.0 (never shrink,
        // only enlarge or leave as is + scroll). Advanced is quite
        // workshop than Home/Step, so it often did not fit even at scale
        // 1 -- it was left UNscaled (with scroll) while the other
        // tabs did get enlarged, an inconsistent experience between
        // tabs. Now shrinking is allowed too (floor 0.6, no
        // less, so the text/buttons do not become illegible) --
        // all the tabs end up "fitted to the screen" consistently. The scroll
        // below stays as a safety net
        // only, for the extreme case of adding MANY
        // macro buttons.
        scale = Math.max(0.6, scale);
        jogBodyEl.style.transformOrigin = "top center";
        jogBodyEl.style.transform = "scale(" + scale.toFixed(3) + ")";
        // Safety net: if even at this scale the content does not fit
        // (many macro buttons added, for example), it scrolls INSIDE the
        // panel instead of being cut off outside the
        // screen (reported live 2026-10-08: "if I add several
        // buttons that part shifts and ends up outside the screen").
        jogBodyEl.style.maxHeight = Math.round(availH) + "px";
        jogBodyEl.style.overflowY = "auto";
        // Note: BODY does not need extra height reserved in the
        // panel layout to compensate for the visual enlargement of the
        // transform -- the panel is already a fixed 100vh (it does not adjust to its
        // content) and the max-height+scale combination is built
        // on purpose so that naturalH*scale never exceeds availH (see
        // big comment above), so the scaled content
        // always fits within the space already reserved under the header.
      }

      // Reported live 2026-10-08: in the jog's full screen, the
      // camera's floating button appeared ON TOP (visible,
      // interactive) while the camera panel (if it was
      // open) stayed BEHIND -- inconsistent stacking order.
      // Cause: Element.requestFullscreen() promotes the jog panel to
      // the browser's special "top layer" (by spec, above
      // the WHOLE normal document regardless of z-index) -- but that
      // top layer is exclusive to ONE element (the one that is
      // fullscreen); other floating widgets of THIS SAME plugin
      // (camera, shutdown button) live OUTSIDE that layer, in the normal
      // document, and their exact stacking behaviour against a top layer
      // varies between browsers -- there is no reliable way to guarantee
      // they stay hidden with z-index alone. Simpler and 100% reliable:
      // hide them explicitly while the jog is in full screen (it makes sense
      // anyway -- it is a "focus mode" for the jog, not for using the camera at
      // the same time) and return them to their previous state on exit.
      // It saves in the dataset WHICH ones it hid (so as not to reappear something
      // that the camera's own logic had already hidden before entering).
      function jogHideOtherWidgetsForFullscreen(hide) {
        ["emergency-fab-cam-panel", "emergency-fab-sidebar"].forEach(function (id) {
          var el = document.getElementById(id);
          if (!el) return;
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
          var saved = loadPos("emergencyFabJogPanelPos");
          var left = saved ? saved.left : 16;
          var top = saved ? saved.top : window.innerHeight - JOG_PANEL_H_ESTIMATE - 16;
          jogPanelEl.style.left = clamp(left, MARGIN, window.innerWidth - JOG_PANEL_W - MARGIN) + "px";
          jogPanelEl.style.top = clamp(top, MARGIN, window.innerHeight - JOG_PANEL_H_ESTIMATE - MARGIN) + "px";
          jogReclampPanel();
          jogApplyScale(jogScale);
        }
        // Plain ASCII text, not unicode symbols -- the same reason
        // documented for the camera icons: it is not worth
        // risking a broken glyph in some odd mobile browser for a
        // simple button.
        if (jogFsBtn) jogFsBtn.textContent = on ? i18nT('jog.exit') : "FS";
      }

      function jogToggleFullscreen() {
        jogApplyFullscreen(!jogIsFullscreen);
      }

      // If the user exits full screen with the browser's/OS's
      // native gesture (Esc, swipe gesture, etc) instead of our "Exit"
      // button, keep the panel UI in sync anyway.
      document.addEventListener("fullscreenchange", function () {
        if (jogIsFullscreen && !document.fullscreenElement) {
          jogApplyFullscreen(false);
        }
      });

      // Service answers to the moving operations (jog.xy | jog.z | jog.axis; see
      // WorkshopService dsf/api_ops.py and handlers/jog.py; the owner of the movement decides):
      //   error motion_denied     cannot be forced: show the reason, drop the gesture
      //   error confirm_required  nothing moved: show the reason and, on a double tap,
      //                           send the same operation (movement zeroed) with confirm (valid 60 s)
      var JOG_OPS_MOVE = { "jog.xy": true, "jog.z": true, "jog.axis": true };
      var jogConfirmPending = null; // {pedido: {op, args}, motivo} while the confirm box is up
      var jogConfirmArmedUntil = 0;
      var jogBlock = null; // data.jogBlock of the service ({motivo, confirmar, at}) or null

      function jogShowNotice(text, ms) {
        if (!jogNoticeEl) return;
        jogNoticeEl.textContent = text;
        jogNoticeEl.style.display = "block";
        clearTimeout(jogNoticeTimer);
        if (ms) {
          jogNoticeTimer = setTimeout(function () {
            if (jogNoticeEl && !jogConfirmPending) jogNoticeEl.style.display = "none";
          }, ms);
        }
      }

      // Same operation with the movement zeroed: sent with confirm, it records the
      // confirmation without moving anything (the gesture was already released).
      function jogCodeConfirmed(request) {
        var a = Object.assign({}, request.args || {});
        ["x", "y", "z", "value"].forEach(function (k) {
          if (k in a) a[k] = 0;
        });
        return { op: request.op, args: a };
      }

      function jogRequestConfirmation(request, reason) {
        if (jogConfirmPending) return; // a heartbeat repeated the answer: one box only
        jogConfirmPending = { requested: request, reason: reason };
        jogConfirmArmedUntil = 0;
        if (!jogNoticeEl) return;
        clearTimeout(jogNoticeTimer);
        jogNoticeEl.textContent = "";
        jogNoticeEl.style.display = "block";
        var t = document.createElement("div");
        t.textContent = i18nT('jog.to_move_anyway_confirm_with_a_2', { reason: reason });
        jogNoticeEl.appendChild(t);
        var row = document.createElement("div");
        row.style.cssText = "display:flex;gap:6px;justify-content:center;margin-top:6px;";
        var bOk = document.createElement("button");
        bOk.type = "button";
        bOk.textContent = i18nT('jog.move_anyway');
        bOk.style.cssText = "background:#e65100;color:#fff;border:0;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;";
        var bNo = document.createElement("button");
        bNo.type = "button";
        bNo.textContent = i18nT('jog.cancel');
        bNo.style.cssText = "background:#455a64;color:#fff;border:0;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;";
        function cerrar() {
          jogConfirmPending = null;
          jogConfirmArmedUntil = 0;
          if (jogNoticeEl) {
            jogNoticeEl.style.display = "none";
            jogNoticeEl.textContent = "";
          }
        }
        bNo.addEventListener("click", cerrar);
        bOk.addEventListener("click", function () {
          if (!jogConfirmArmedUntil || Date.now() > jogConfirmArmedUntil) {
            jogConfirmArmedUntil = Date.now() + 4000;
            bOk.textContent = i18nT('jog.tap_again');
            setTimeout(function () {
              if (jogConfirmPending && Date.now() > jogConfirmArmedUntil) bOk.textContent = i18nT('jog.move_anyway');
            }, 4100);
            return;
          }
          var c = jogConfirmPending ? jogCodeConfirmed(jogConfirmPending.requested) : null;
          cerrar();
          if (c) {
            workshopApi(c.op, c.args, { confirm: true }).then(
              function () {
                jogShowNotice(i18nT('jog.confirmed_move_the_jog_again_valid'), 4000);
              },
              function (e) {
                console.error("[WorkshopJog] error confirming:", e, c);
              }
            );
          }
        });
        row.appendChild(bOk);
        row.appendChild(bNo);
        jogNoticeEl.appendChild(row);
      }

      // Reads the service answer of a moving operation. A block or a confirm
      // request drops the gesture ONCE (the holds are cleared, so the heartbeat has
      // nothing left to resend: no retry loop).
      function jogCheckResponse(request, body) {
        var e = body && !body.ok ? body.error || {} : null;
        if (!e || (e.code !== "motion_denied" && e.code !== "confirm_required")) return;
        var confirmar = e.code === "confirm_required";
        var motivo = String((confirmar && e.confirm && e.confirm.reason) || e.message || "").trim() || i18nT('jog.the_service_does_not_allow_jogging');
        if (jogConfirmPending && confirmar) return;
        jogReleaseAllHolds();
        if (confirmar) jogRequestConfirmation(request, motivo);
        else jogShowNotice(i18nT('jog.jog_blocked_2', { reason: motivo }), 8000);
      }

      // API of WorkshopService (jog.*, air.set, light.set): one call, the answer is checked
      function postJogCommand(op, args) {
        var request = { op: op, args: args || {} };
        return workshopApiCall(op, request.args)
          .then(function (body) {
            if (JOG_OPS_MOVE[op]) jogCheckResponse(request, body);
            return body;
          })
          .catch(function (e) {
            console.error("[WorkshopJog] error sending:", e, op);
          });
      }

      // X/Y knob: updates the target vector in the backend (see
      // jog_move.py -- this handler ONLY updates state, it never sends
      // G-code itself). `force` skips the JOG_SEND_MIN_GAP_MS throttle
      // (used on pointerdown and on every heartbeat tick).
      // VISIBLE notice (request 2026-10-10: "it does not move but it does not say
      // why either"): outside the no-limits mode the backend does not move axes without homing;
      // when trying, an orange box says which ones and what to do.
      var jogNoticeEl = null;
      var jogNoticeTimer = null;
      function jogNotifyWithoutHoming(ejes) {
        if (!jogNoticeEl || jogFreeActive()) return;
        var missing = ejes.filter(function (L) {
          return jogWithoutHoming.indexOf(L) >= 0;
        });
        if (!missing.length) return;
        jogNoticeEl.textContent = i18nT('jog.it_does_not_move_not_homed', { axes: missing.join(", ") });
        jogNoticeEl.style.display = "block";
        clearTimeout(jogNoticeTimer);
        jogNoticeTimer = setTimeout(function () {
          if (jogNoticeEl) jogNoticeEl.style.display = "none";
        }, 5000);
      }

      function jogSendXY(nx, ny, force) {
        if (nx || ny) jogNotifyWithoutHoming(["X", "Y"].filter(function (L, i) { return i === 0 ? nx : ny; }));
        var now = Date.now();
        if (!force && now - jogXYLastSendAt < JOG_SEND_MIN_GAP_MS) return;
        jogXYLastSendAt = now;
        jogCurrentNX = nx;
        jogCurrentNY = ny;
        postJogCommand("jog.xy", { x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)), speed: Math.round(jogSpeedPercent) });
      }

      function jogSendStopXY() {
        return postJogCommand("jog.stop_xy", { release: true });
      }

      // `nz`: continuous -1..1 (2026-10-08, fourth round -- before it was only
      // -1/0/1, an on/off button). It saves the last value sent in
      // jogZHeldSign (like jogSendXY saves jogCurrentNX/NY) so
      // that the heartbeat can resend it without every caller
      // having to track it on its own.
      function jogSendZ(nz, force) {
        if (nz) jogNotifyWithoutHoming(["Z"]);
        var now = Date.now();
        jogZHeldSign = nz;
        if (!force && now - jogZLastSendAt < JOG_SEND_MIN_GAP_MS) return;
        jogZLastSendAt = now;
        postJogCommand("jog.z", { z: Number(nz.toFixed(3)), speed: Math.round(jogSpeedPercent) });
      }

      function jogSendStopZ() {
        return postJogCommand("jog.stop_z", { release: true });
      }

      // While the knob is still held or Z is still held, it resends the
      // current state even if there is no new pointermove -- see the
      // big comment on JOG_HEARTBEAT_MS above. jogKeyboardXYHeld (advanced
      // mode, defined below) is checked here too -- without this
      // the keyboard control sent a SINGLE update on keydown and the
      // backend's watchdog (~0.9s) cut the movement even though the
      // key was still pressed (reported live 2026-10-08: "if I leave the
      // key pressed it only does one travel and stops"). Z by
      // keyboard already shares jogZHeldSign with the Z buttons (see below),
      // so this Z line does not need to be touched.
      function jogHeartbeat() {
        if (pluginStopped) return;
        // Keyboard FIRST and regardless of the axis mode -- REGRESSION of
        // 608f3e7 (Straight mode), confirmed in the backend log
        // (workshop-service.log 2026-10-08 14:20-14:23: eleven in a row "watchdog xy:
        // no update from the browser"): the keyboard was only refreshed in the Free mode branch, so with Straight active
        // a held arrow sent a SINGLE update on keydown and the
        // backend's watchdog (0.9s) cut X/Y even though the key
        // was still pressed. Z was not affected because its line (at the
        // end) never depended on the mode -- hence "Z continues, X/Y does not".
        // The keyboard's OWN vector (jogKbNX/NY) is sent, not
        // jogCurrentNX/NY, which the knob/sliders also overwrite.
        if (jogKeyboardXYHeld) {
          jogSendXY(jogKbNX, jogKbNY, true);
        } else if (jogAxisMode === "straight") {
          // Straight mode: X and Y are INDEPENDENT sliders (each its own
          // pointerId), but the backend only has ONE combined "xy" state
          // (see jog.xy {x, y}) -- jog_move.py did not need to be touched
          // for this, the frontend simply combines the two held values (0 for the one that is not
          // grabbed) on every send, just as jogSendXY already did with the
          // circle's nx/ny.
          if (jogStraightXPointerId !== null || jogStraightYPointerId !== null) {
            jogSendXY(jogStraightXPointerId !== null ? jogStraightXVal : 0, jogStraightYPointerId !== null ? jogStraightYVal : 0, true);
          }
        } else if (jogPointerId !== null) {
          jogSendXY(jogKnobNX, jogKnobNY, true);
        }
        // jogZPointerId (slider) / jogHeldZKey (keyboard) -- NOT
        // jogZHeldSign !== 0, which is now a continuous value and could
        // legitimately be at 0 (the slider held right in the
        // center) without that meaning "released". The same criterion
        // XY already uses (jogPointerId, not the vector's magnitude).
        if (jogZPointerId !== null || jogHeldZKey !== null) jogSendZ(jogZHeldSign, true);
        // Hold +/- (Step tab): only if NO other X/Y source is
        // held. Before, both were sent in the same heartbeat and the
        // backend alternated (bug 2026-10-08: "in free mode moving to X-
        // made it go back and forth without advancing" -- there was a stuck +X).
        if (jogStepHold) {
          var otherXY = jogKeyboardXYHeld || jogPointerId !== null || jogStraightXPointerId !== null || jogStraightYPointerId !== null;
          if (jogIsAxisExtra(jogStepHold.axis) || (jogStepHold.axis === "Z" ? jogZPointerId === null && jogHeldZKey === null : !otherXY)) jogSendStepHold();
        }
      }

      // Y+ on screen is NEGATIVE ny (the same criterion as the arrows:
      // ArrowUp = [0, -1]).
      function jogSendStepHold() {
        var h = jogStepHold;
        if (!h) return;
        if (jogIsAxisExtra(h.axis)) postJogCommand("jog.axis", { axis: String(h.axis), value: Number(h.sign), speed: Math.round(jogSpeedPercent) });
        else if (h.axis === "Z") jogSendZ(h.sign, true);
        else jogSendXY(h.axis === "X" ? h.sign : 0, h.axis === "Y" ? -h.sign : 0, true);
      }

      // When releasing ONE X/Y source (knob, Straight slider or arrows)
      // while ANOTHER is still held, send the state of the one that remains
      // instead of a stop_xy -- otherwise, releasing the knob with an arrow
      // pressed cut the movement until the next heartbeat (a
      // "hesitation" of up to 300ms). Call AFTER clearing the flag of
      // the source that was released.
      function jogSendXYStateOrStop() {
        if (jogKeyboardXYHeld) {
          jogSendXY(jogKbNX, jogKbNY, true);
        } else if (jogAxisMode === "straight" && (jogStraightXPointerId !== null || jogStraightYPointerId !== null)) {
          jogSendXY(jogStraightXPointerId !== null ? jogStraightXVal : 0, jogStraightYPointerId !== null ? jogStraightYVal : 0, true);
        } else if (jogAxisMode !== "straight" && jogPointerId !== null) {
          jogSendXY(jogKnobNX, jogKnobNY, true);
        } else {
          jogSendStopXY();
        }
      }

      // Releases EVERYTHING that may be held (knob, X/Y/Z sliders,
      // arrows, Page Up/Down) and notifies the backend. It clears the
      // flags BEFORE sending the stops, so the heartbeat (300ms) can no longer
      // resend an "xy"/"z" after the stop. It returns a promise
      // that resolves when the backend acknowledged BOTH stops.
      function jogReleaseAllHolds() {
        if (jogStepHold && jogIsAxisExtra(jogStepHold.axis)) postJogCommand("jog.stop_axis", { release: true });
        jogStepHold = null;
        jogPointerId = null;
        jogStraightXPointerId = null;
        jogStraightYPointerId = null;
        jogStraightXVal = 0;
        jogStraightYVal = 0;
        jogKeyboardXYHeld = false;
        jogKbNX = 0;
        jogKbNY = 0;
        jogHeldZKey = null;
        jogZPointerId = null;
        jogZHeldSign = 0;
        jogResetZVisual();
        if (jogKnobEl) jogKnobEl.style.transform = "translate(-50%,-50%)";
        if (jogRingEl) jogRingEl.style.boxShadow = "";
        if (jogXThumbEl) jogXThumbEl.style.transform = "translate(-50%,-50%)";
        if (jogYThumbEl) jogYThumbEl.style.transform = "translate(-50%,-50%)";
        return Promise.all([jogSendStopXY(), jogSendStopZ()]);
      }

      // VISIBLE disabled: these buttons have a fixed inline style, so
      // with only `disabled` they looked identical to active ones (reported:
      // "in a home all they are still active").
      // Buttons that only make sense in certain modes (request
      // 2026-10-08: "disable the buttons that are not of the current mode"):
      // jogModeOnly(b, ["Laser"]) marks them, and jogSetBtnEnabled -- the
      // single path to enable/disable -- leaves them disabled
      // outside those modes, with the reason in the tooltip. Without a known mode
      // (the status has not arrived yet) nothing is blocked.
      var jogMachineMode = null; // state.machineMode: "FFF" | "Laser" | "CNC"
      var jogWithoutHoming = []; // X/Y/Z axes without homing (from the same state poll)
      // 2026-10-10 ("assign new axes to move from the jog"): RRF axes
      // that are not X/Y/Z (U, V, W, A, B, C...). They appear in the Step tab with
      // tap/hold +/-, like X/Y/Z; they are hidden from the gear.
      var jogAxesExtra = [];
      var jogQHomeButtons = {}; // quick "Home X / Y / Z" buttons by letter: only the axes the machine has are shown
      var jogBaseAxes = ["X", "Y", "Z"]; // X / Y / Z the machine really has (until the first status: all three)
      var jogAxisSpeed = {}; // letra -> velocidad maxima de RRF (M203, mm/min)
      var jogAxesExtraHook = null; // set by the Step tab to redraw its buttons
      function jogIsAxisExtra(ax) {
        return !!ax && ["X", "Y", "Z"].indexOf(ax) < 0;
      }
      // modeOnly: the mode is its ONLY gate (e.g. Air): it is re-evaluated here
      // each time the mode changes, because nothing else refreshes it.
      var jogModeOnlyButtons = [];
      function jogModeOnly(b, modes, onlyMode) {
        if (!b) return b;
        b.dataset.tjModes = modes.join(",");
        if (onlyMode) {
          jogModeOnlyButtons.push(b);
          jogSetBtnEnabled(b, true);
        }
        return b;
      }
      function jogSetBtnEnabled(b, en) {
        if (!b) return;
        var modos = b.dataset && b.dataset.tjModes;
        if (modos) {
          var modeOk = !jogMachineMode || modos.split(",").indexOf(jogMachineMode) >= 0;
          if (b.dataset.tjTitle === undefined) b.dataset.tjTitle = b.title || "";
          b.title = modeOk ? b.dataset.tjTitle : i18nT('jog.only_in_mode_now', { modes: modos.replace(/,/g, " / "), mode: jogMachineMode });
          en = en && modeOk;
        }
        b.disabled = !en;
        b.style.opacity = en ? "1" : "0.35";
        b.style.cursor = en ? "pointer" : "not-allowed";
      }

      // "Free" = no job in progress. 2026-10-08, decided with the user
      // after testing it on the machine: it is NOT blocked by "busy" (homing,
      // macro, loose G-code). During a homeall RRF alternates busy/idle
      // between movements and the block flickered; besides, DWC's CNC
      // Movement panel can move the machine anyway, so that block
      // added no real safety. The only thing blocked is a JOB
      // (processing/paused/simulating/...), a stable state while it lasts.
      function jogMachineFree() {
        // 2026-10-13: plus the owner of the movement (reservation of another page, bridge orders)
        return (jogLastMachineStatus === "idle" || jogLastMachineStatus === "busy") && !jogLiveJobBlocks() && !jogWithoutService && !jogBlockFirm() && !workshopMotionBlock(["jog", PLUGIN_ID]) && jogRoleNow().move;
      }

      function jogApplyEnableState() {
        jogSetControlsEnabled(jogEnabled);
        jogSetHomeEnabled(jogMachineFree());
        jogUpdateStatusText();
      }

      // Readable reason why the jog is blocked -- values of
      // state.status of RRF's object model, translated.
      var JOG_BLOCK_REASONS = {
        processing: i18nT('jog.job_in_progress'),
        simulating: i18nT('jog.simulating_a_job'),
        paused: i18nT('jog.job_paused'),
        pausing: i18nT('jog.pausing_job'),
        resuming: i18nT('jog.resuming_job'),
        cancelling: i18nT('jog.cancelling_job'),
        changingTool: i18nT('jog.changing_tool'),
        halted: i18nT('jog.emergency_stop_m999_to_reset'),
        off: i18nT('jog.machine_off'),
        updating: i18nT('jog.updating_firmware'),
        starting: i18nT('jog.starting'),
        disconnected: i18nT('jog.no_connection_with_the_board'),
      };

      // A block the service cannot lift (confirmar false) and published less than 30 s ago
      // greys the jog; an older one is ignored (the page's own checks cover those cases).
      function jogBlockFirm() {
        return !!(jogBlock && !jogBlock.confirm && Date.now() / 1000 - (Number(jogBlock.at) || 0) < 30);
      }

      function jogUpdateStatusText() {
        if (!jogStatusEl) return;
        if (jogWithoutService || !jogLastMachineStatus) {
          // without service or without a response from DSF: text + link to the explanation
          jogStatusEl.textContent = jogWithoutService ? i18nT('jog.blocked', { reason: jogWithoutService }) : i18nT('jog.no_connection_with_the_system_service');
          var a = document.createElement("a");
          a.href = "#";
          a.textContent = jogExplainsOpen ? i18nT('jog.hide') : i18nT('jog.how_it_works');
          a.style.color = "#90caf9";
          a.addEventListener("click", function (ev) {
            ev.preventDefault();
            jogExplainsOpen = !jogExplainsOpen;
            jogUpdateStatusText();
          });
          jogStatusEl.appendChild(a);
          if (jogExplainsOpen) {
            var ex = document.createElement("div");
            ex.textContent = JOG_EXPLAINS_COMMUNICATION;
            ex.style.cssText = "margin-top:4px;color:#b0bec5;line-height:1.35;";
            jogStatusEl.appendChild(ex);
          }
          jogStatusEl.style.color = "#ffb74d";
          return;
        }
        if (!jogRoleNow().move) {
          // a role that cannot move the machine (a viewer, or an operator outside the modes it may run): position only
          jogStatusEl.textContent = i18nT(jogSignedOut() ? 'jog.sign_in_needed' : 'jog.role_view_only');
          jogStatusEl.style.color = "#b0bec5";
          return;
        }
        if (jogEnabled && jogWithoutHoming.length && !jogFreeActive()) {
          jogStatusEl.textContent = i18nT('jog.not_homed_they_do_not_move', { axes: jogWithoutHoming.join(", ") });
          jogStatusEl.style.color = "#ffb74d";
        } else if (jogEnabled && jogBlock && jogBlock.confirm) {
          jogStatusEl.textContent = i18nT('jog.ready_but_it_needs_confirmation', { reason: jogBlock.reason });
          jogStatusEl.style.color = "#ffb74d";
        } else if (jogEnabled) {
          jogStatusEl.textContent = i18nT('jog.ready_mm_min', { feed: jogMaxFeedXY().toFixed(0), v: jogLiveJob ? i18nT('jog.careful_live_job_open_paused', { v: jogNameLive() }) : "" });
          jogStatusEl.style.color = jogLiveJob ? "#ffb74d" : "#b0bec5";
        } else if (jogBlockFirm()) {
          jogStatusEl.textContent = i18nT('jog.blocked_by_the_service_2', { reason: jogBlock.reason });
          jogStatusEl.style.color = "#ffb74d";
        } else if (jogLiveJobBlocks()) {
          jogStatusEl.textContent = i18nT('jog.blocked_live_job_running', { v: jogNameLive() });
          jogStatusEl.style.color = "#ffb74d";
        } else if (jogLastMachineStatus) {
          jogStatusEl.textContent =
            i18nT('jog.blocked_2', { v: JOG_BLOCK_REASONS[jogLastMachineStatus] || jogLastMachineStatus, v2: jogLastJobFile && jogLastMachineStatus !== "busy" ? " (" + jogLastJobFile + ")" : "" });
          jogStatusEl.style.color = "#ffb74d";
        }
      }

      function jogSetControlsEnabled(enabled) {
        if (jogRingEl) {
          jogRingEl.style.opacity = enabled ? "1" : "0.35";
          jogRingEl.style.pointerEvents = enabled ? "auto" : "none";
        }
        [jogXTrackEl, jogYTrackEl, jogZTrackEl].forEach(function (el) {
          if (!el) return;
          el.style.opacity = enabled ? "1" : "0.35";
          el.style.pointerEvents = enabled ? "auto" : "none";
        });
        jogSetBtnEnabled(jogStepMinusBtn, enabled);
        jogSetBtnEnabled(jogStepPlusBtn, enabled);
      }

      // Home is a real movement toward the limits -- unlike
      // the jog (which tolerates "busy", see jogCheckEnabled), this requires
      // plain "idle": it makes no sense to home while the jog itself
      // is in progress or anything else is happening.
      function jogSetHomeEnabled(enabled) {
        // Remove the buttons that are no longer on the page (the "Go" ones of
        // saved positions are recreated when redrawing the list).
        jogHomeButtons = jogHomeButtons.filter(function (b) {
          return b.isConnected;
        });
        jogHomeButtons.forEach(function (b) {
          jogSetBtnEnabled(b, enabled);
        });
      }

      function jogResetZVisual() {
        if (jogZThumbEl) jogZThumbEl.style.transform = "translate(-50%,-50%)";
      }

      // Cuts the Z hold NOW (button released, or disabled by
      // machine state) -- it centralizes clearing the local state, the visual
      // feedback AND notifying the backend, in a single place.
      function jogStopZHold() {
        jogZHeldSign = 0;
        jogZPointerId = null;
        jogResetZVisual();
        jogSendStopZ();
      }

      // A single read of /machine/status for the whole jog (2026-10-09,
      // "the sliders hesitate"): the position poll (jogAdvPoll) and
      // this check every 2 s each asked for their own copy (~38 KB, which DSF builds
      // on every request); with the system loaded (load ~5) the jog's orders
      // arrived late and the backend's watchdog (0.9 s) cut the
      // movement. If there is a reading from less than maxAgeMs ago, it is reused.
      var jogStatusCache = { at: 0, status: null, pending: null };
      var jogMacroPaintHook = null; // set by the "Macro buttons" section (it lights the ACTIVE ones)
      // Manager of the macro buttons (create / order / delete): it lives in Settings (18-settings.js, tab "Macro buttons");
      // createJogPanel sets {mount(parentEl)}. The jog only shows and presses the buttons.
      var jogMacroAdmin = null;
      // 2026-10-12: /machine/status is no longer requested (DWS at 100% of a core during
      // a job): it is read from DWC's store (01-dwc-state.js), which its own
      // session with DSF keeps up to date. maxAgeMs stays for compatibility.
      function jogFetchStatus(maxAgeMs) {
        return workshopReadState().then(function (status) {
          jogStatusCache.status = status;
          jogStatusCache.at = Date.now();
          return status;
        });
      }

      function jogCheckEnabled() {
        if (pluginStopped) return;
        jogFetchStatus(1500)
          .then(function (status) {
            jogStatusFailCount = 0;
            var s = status && status.state && status.state.status;
            jogLastMachineStatus = s || null;
            var mm = status && status.state && status.state.machineMode;
            mm = jogModeKnown(mm); // an unknown or missing mode is null (no mode assumptions)
            if (mm !== jogMachineMode) {
              jogMachineMode = mm;
              jogModeOnlyButtons.forEach(function (b) {
                jogSetBtnEnabled(b, true);
              });
            }
            var jf = status && status.job && status.job.file && status.job.file.fileName;
            jogLastJobFile = jf ? String(jf).split("/").pop() : null;
            var pcc = status && workshopPluginOf(status.plugins, "service");
            var lj = pcc && pcc.data && pcc.data.liveJob;
            jogLiveJob = lj && lj.active ? lj : null;
            var jb = pcc && pcc.data && pcc.data.jogBlock;
            jogBlock = jb && jb.reason ? workshopServiceTexts(jb) : null; // republished on every check; null when nothing blocks; reason as {key, params}
            // axes without homing: outside the no-limits mode the backend does not move them, except with M564 H0 (noMovesBeforeHoming false)
            var axesOM = (status && status.move && status.move.axes) || [];
            var extras = axesOM
              .filter(function (a) {
                return a && a.letter && a.visible !== false && jogIsAxisExtra(a.letter);
              })
              .map(function (a) {
                jogAxisSpeed[a.letter] = a.speed;
                return a.letter;
              });
            if (extras.join() !== jogAxesExtra.join()) {
              jogAxesExtra = extras;
              if (jogAxesExtraHook) jogAxesExtraHook();
            }
            if (axesOM.length) {
              var present = axesOM.filter(function (a) { return a && a.letter && a.visible !== false; }).map(function (a) { return a.letter; });
              ["X", "Y", "Z"].forEach(function (L) {
                if (jogQHomeButtons[L]) jogQHomeButtons[L].style.display = present.indexOf(L) >= 0 ? "" : "none";
              });
              var base = ["X", "Y", "Z"].filter(function (L) { return present.indexOf(L) >= 0; });
              if (base.join() !== jogBaseAxes.join()) {
                jogBaseAxes = base;
                if (jogAxesExtraHook) jogAxesExtraHook(); // the step tab draws only the axes that exist
              }
            }
            jogWithoutHoming = axesOM
              .filter(function (a) {
                return !(status.move && status.move.noMovesBeforeHoming === false) && a && ["X", "Y", "Z"].indexOf(a.letter) >= 0 && !a.homed;
              })
              .map(function (a) {
                return a.letter;
              });
            try {
              jogFreeUpdate(workshopServiceTexts(pcc && pcc.data && pcc.data.jogFree)); // no-limits mode (11-free.js); its texts in the language of this DWC
            } catch (e) {
              console.error("[WorkshopJog] no-limits:", e);
            }
            if (jogLiveJob && s === "busy") jogLiveBusyTs = Date.now();
            // The same poll feeds the sidebar (state of "shut down
            // when finished" = global.powerOffOnFinish, which is what
            // sys/daemon.g really reads, and whether there is a job in progress).
            // try/catch: an error in the bar must NEVER fall into the catch()
            // below, which would count it as a network failure and disable
            // the jog.
            try {
              workshopPublishStatus(status);
            } catch (e) {
              console.error("[WorkshopJog] barra lateral:", e);
            }
            try {
              if (jogMacroPaintHook) jogMacroPaintHook(status);
            } catch (e) {
              /* solo visual */
            }
            var wasEnabled = jogEnabled;
            // "idle" OR "busy" -- real ROOT CAUSE of "it keeps releasing"
            // (2026-10-07, confirmed live with curl): while the jog
            // is sending G1s continuously, the machine is physically in
            // motion, so state.status is NEVER "idle" -- it is
            // "busy" (RRF reports "busy" as soon as ANY code is
            // running, whether job or manual). Requiring only "idle" here made
            // the jog cut itself every ~2s (this
            // same poll, JOG_STATUS_POLL_MS) as soon as it detected its
            // own movement -- it affected the knob AND the Z buttons
            // equally (neither depends on pointer events for this),
            // which is exactly what was reported. "busy"
            // is safe to allow: it is only "a manual code
            // is running now" (exactly what the jog IS). What
            // still has to be blocked is everything else: "processing"
            // (a real file job running -- it MUST cut the
            // jog), "paused"/"pausing"/"resuming"/"cancelling",
            // "changingTool", "halted", "simulating", "off",
            // "disconnected", etc.
            // "idle" or "busy" (the jog itself puts RRF in "busy") -- see
            // jogMachineFree(): only a JOB blocks.
            // Without the Pi service (WorkshopService, through DSF in SBC mode) there is
            // no channel to send the jog through (2026-10-10): it says why and
            // explains it in the same panel (JOG_EXPLAINS_COMMUNICATION).
            jogWithoutService = !status.sbc
              ? i18nT('jog.the_duet_is_not_in_sbc')
              : !pcc
                ? i18nT('jog.the_system_service_is_missing')
                : !(pcc.pid > 0)
                  ? i18nT('jog.the_system_service_is_stopped_plugins')
                  : null;
            jogEnabled = (s === "idle" || s === "busy") && !jogLiveJobBlocks() && !jogWithoutService && !jogBlockFirm() && jogRoleNow().move;
            // blocked (job, no service...): the keyboard mode cannot stay on, and cannot be turned on
            if (!jogEnabled && jogKeyboardOffHook) jogKeyboardOffHook();
            else if (jogKbRepaint) jogKbRepaint();
            if (typeof jogFreeBlockPaint === "function") jogFreeBlockPaint();

            // Maximum speed CONFIGURED per axis (M203, move.axes[].speed
            // in mm/min, the same field motor_status.py already uses on the
            // Python side) -- read-only from the object model, it is not requested separately.
            if (jogAxisMaxEl) {
              var axes = status && status.move && status.move.axes;
              if (axes && axes.length) {
                var axisTxt = axes
                  .filter(function (a) {
                    return a && a.visible !== false && a.letter;
                  })
                  .map(function (a) {
                    return a.letter + a.speed.toFixed(0);
                  })
                  .join(" ");
                jogAxisMaxEl.textContent = i18nT('jog.max_axes_mm_min', { axisTxt: axisTxt });
              }
            }
            if (wasEnabled && !jogEnabled) {
              // The machine started a job while the panel was
              // open -- cut the jog NOW, do not wait for the knob or the Z button
              // to be released (they may still be pressed). The
              // backend will refuse to move on its own anyway (the same
              // status check there), this is only so that the UI/the
              // "stop" notice comes out immediately instead of waiting for the
              // backend's next tick.
              // It releases EVERYTHING (knob, sliders, keyboard), not just the
              // knob.
              jogReleaseAllHolds();
            }
            jogSetControlsEnabled(jogEnabled);
            jogSetHomeEnabled(jogMachineFree());
            jogUpdateStatusText();
          })
          .catch(function () {
            // Tolerate a SINGLE network/server failure without cutting the jog --
            // this poll competes for CPU/network with the camera stream
            // (added by another session the same day) and an isolated
            // /machine/status timeout does not mean that the backend's
            // real connection to the jog (which no longer even goes through this browser)
            // is failing too. Only at the SECOND consecutive failure is the
            // connection really assumed lost and cut (a real fail safe,
            // not at the first hiccup).
            jogStatusFailCount++;
            if (jogStatusFailCount >= 2) {
              jogLastMachineStatus = null;
              jogEnabled = false;
              jogSetControlsEnabled(false);
              jogSetHomeEnabled(false);
              jogUpdateStatusText();
            }
          });
      }

      // Variant of makeDraggable that drags `target` taking the gesture
      // from a separate `handle` (the title bar), not from the
      // whole element -- so that the knob/buttons inside the panel can
      // use their own drag gestures (the knob) without moving the
      // panel by accident.
      function makeDraggableByHandle(target, handle, posKey, w, h, defaultLeft, defaultTop) {
        var saved = loadPos(posKey);
        var left = saved ? saved.left : defaultLeft;
        var top = saved ? saved.top : defaultTop;
        left = clamp(left, MARGIN, window.innerWidth - w - MARGIN);
        top = clamp(top, MARGIN, window.innerHeight - h - MARGIN);
        jogPutPanel(target, left, top); // never over the Emergency stop

        var dragging = false;
        var pointerId = null;
        var startX = 0;
        var startAnd = 0;
        var startLeft = 0;
        var startTop = 0;

        handle.addEventListener("pointerdown", function (ev) {
          ev.preventDefault(); // ver nota en makeDraggable()
          // While the panel is in full screen mode (see
          // jogApplyFullscreen) it is scaled with a CSS transform -- the
          // offsetLeft/offsetTop math below assumes 1:1 with
          // screen px, so dragging here would feel wrong
          // (too fast/slow depending on the scale). Simpler:
          // disable dragging entirely while it lasts.
          if (target.dataset.fsLock === "1") return;
          dragging = true;
          pointerId = ev.pointerId;
          startX = ev.clientX;
          startAnd = ev.clientY;
          startLeft = target.offsetLeft;
          startTop = target.offsetTop;
          handle.setPointerCapture(pointerId);
        });

        handle.addEventListener("pointermove", function (ev) {
          if (!dragging || ev.pointerId !== pointerId) return;
          var dx = ev.clientX - startX;
          var dy = ev.clientY - startAnd;
          var newLeft = clamp(startLeft + dx, MARGIN, window.innerWidth - target.offsetWidth - MARGIN);
          var newTop = clamp(startTop + dy, MARGIN, window.innerHeight - target.offsetHeight - MARGIN);
          jogPutPanel(target, newLeft, newTop); // it slides around the Emergency stop
        });

        function endDrag(ev) {
          if (!dragging || ev.pointerId !== pointerId) return;
          dragging = false;
          try {
            handle.releasePointerCapture(pointerId);
          } catch (e) {
            /* ya liberado */
          }
          savePos(posKey, target.offsetLeft, target.offsetTop);
        }

        handle.addEventListener("pointerup", endDrag);
        handle.addEventListener("pointercancel", endDrag);

        window.addEventListener("resize", function () {
          // The same fix as in makeDraggable() -- clamp from the
          // SAVED position, not the current one, so that it returns to its place when
          // the window recovers its size (see the big comment
          // there).
          var saved2 = loadPos(posKey);
          var baseLeft = saved2 ? saved2.left : defaultLeft;
          var baseTop = saved2 ? saved2.top : defaultTop;
          var l = clamp(baseLeft, MARGIN, window.innerWidth - target.offsetWidth - MARGIN);
          var t = clamp(baseTop, MARGIN, window.innerHeight - target.offsetHeight - MARGIN);
          jogPutPanel(target, l, t);
        });
      }

      // The panel changes height by itself (changing tab, opening a
      // collapsible Advanced section, adding macros...) without anyone dragging it --
      // if it grows downward from where it was, the bottom edge
      // may end up off screen. It re-clamps from the
      // SAVED position (the same criterion as the resize handler, so
      // that it returns to its place when it shrinks again) and saves nothing.
      function jogReclampPanel() {
        if (!jogPanelEl || jogPanelEl.dataset.fsLock === "1") return;
        if (jogPanelEl.style.display === "none") return;
        jogHeightMaxBody();
        var saved = loadPos("emergencyFabJogPanelPos");
        var baseLeft = saved ? saved.left : jogPanelEl.offsetLeft;
        var baseTop = saved ? saved.top : jogPanelEl.offsetTop;
        jogPutPanel(
          jogPanelEl,
          clamp(baseLeft, MARGIN, window.innerWidth - jogPanelEl.offsetWidth - MARGIN),
          clamp(baseTop, MARGIN, window.innerHeight - jogPanelEl.offsetHeight - MARGIN)
        );
      }

      // ---- Emergency stop zone (request 2026-10-12) ----
      // The jog NEVER covers DWC's red Emergency stop button
      // (EmergencyBtn.vue: last button of the app-bar, top right,
      // with the mdi-flash icon; on a phone only the icon remains). The zone goes
      // from MARGIN to the left of the button to the right edge and from
      // the top to MARGIN below the bar. If the button is not found
      // (DWC still being built, another language does not matter: it is looked up by icon)
      // the last 160 px of the bar are reserved. Without a bar: no zone.
      function jogZoneEmergency() {
        var bar = document.querySelector("header.v-app-bar") || document.querySelector(".v-app-bar");
        if (!bar) return null;
        var br = bar.getBoundingClientRect();
        if (br.width === 0 || br.height === 0 || br.bottom <= 0) return null;
        var icon = bar.querySelector(".mdi-flash");
        var btn = icon && icon.closest ? icon.closest("button, .v-btn") : null;
        var r = btn ? btn.getBoundingClientRect() : null;
        var izq = r && r.width > 0 ? r.left : br.right - 160;
        var down = Math.max(br.bottom, r && r.width > 0 ? r.bottom : 0);
        return { left: Math.max(0, izq - MARGIN), top: 0, right: window.innerWidth, bottom: down + MARGIN };
      }

      // Pure logic (tested with node, without DOM): moves the rectangle
      // (l, t, w, h) out of the zone z as little as possible. It first tries to the
      // left of the zone (same height); if it does not fit there, or going down
      // is closer and fits on the screen, it puts it right below. vh is
      // the window height.
      function jogAvoidZone(l, t, w, h, z, vh) {
        if (!z || l >= z.right || l + w <= z.left || t >= z.bottom || t + h <= z.top) return { left: l, top: t };
        var izq = z.left - w;
        var cabeIzq = izq >= MARGIN;
        var entersDown = z.bottom + h <= vh - MARGIN;
        if (cabeIzq && (!entersDown || l - izq <= z.bottom - t)) return { left: izq, top: t };
        return { left: l, top: z.bottom };
      }

      // Puts the panel at (left, top) already bounded to the screen, moved
      // out of the emergency zone.
      function jogPutPanel(el, left, top) {
        var p = jogAvoidZone(left, top, el.offsetWidth, el.offsetHeight, jogZoneEmergency(), window.innerHeight);
        el.style.left = p.left + "px";
        el.style.top = p.top + "px";
      }

      // Maximum body height: the whole panel (title bar + body)
      // fits on the screen. If on this screen the jog does not fit to the
      // left of the emergency button (narrow phone or jog enlarged
      // with A+), it may have to go BELOW DWC's bar: that height is
      // subtracted so that it still fits whole. The limit is measured INSIDE the
      // zoom: it is divided by jogScale.
      function jogHeightMaxBody() {
        if (!jogBodyEl || !jogPanelEl || jogPanelEl.dataset.fsLock === "1") return;
        var reserve = 0;
        var z = jogZoneEmergency();
        if (z && z.left - MARGIN < Math.round(JOG_PANEL_W * jogScale)) reserve = Math.ceil(z.bottom);
        var v = "calc((100vh - " + (Math.round((36 + JOG_STOP_DOCK_H + JOG_STATUS_BAR_H) * jogScale) + 4 + 2 * MARGIN + reserve) + "px) / " + jogScale + ")";
        if (jogBodyEl.style.maxHeight !== v) jogBodyEl.style.maxHeight = v;
      }

      // ---- Phantom touch (request 2026-10-12: "the jog header buttons
      // press what is behind") ----
      // Cause: the jog buttons act on pointerup (minimize hides the
      // panel, A-/A+ shrink/enlarge it, the gear opens the settings sheet).
      // On touch Chromium generates the "click" of the tap AFTER pointerup/
      // touchend and directs it to whatever is under the finger at that moment
      // (it looks the element up again). Since the panel already hid or changed
      // size, the click falls on DWC (or another button) behind. The
      // preventDefault of pointerdown does not prevent it (it only stops mousedown/up).
      // Fix for ALL the panel's buttons at once: each touch
      // pointerup inside the panel is noted, and the click that arrives right after
      // (800 ms, same place) is discarded if it is NOT from the same element that was
      // touched. Text fields/selectors receive their normal click (it is
      // the same element). A new touch (pointerdown) clears the note.
      var jogTouch = null;
      function jogNoteTouch(ev) {
        if (ev.pointerType === "mouse") return;
        jogTouch = { el: ev.target, x: ev.clientX, y: ev.clientY, t: Date.now() };
      }
      function jogSwallowClickGhost(ev) {
        var g = jogTouch;
        if (!g) return;
        jogTouch = null;
        if (Date.now() - g.t > 800) return;
        if (Math.abs(ev.clientX - g.x) > 40 || Math.abs(ev.clientY - g.y) > 40) return;
        if (g.el && g.el.isConnected && g.el.contains && g.el.contains(ev.target)) return;
        ev.stopPropagation();
        ev.preventDefault();
      }
      function jogForgetTouch() {
        jogTouch = null;
      }

      // Token for the asynchronous "close" (see jogCollapse): if it is opened again
      // while the acknowledgement of the stops was still awaited, the
      // pending close is cancelled.
      var jogCloseToken = 0;

      function jogExpand() {
        jogCloseToken++;
        try {
          localStorage.setItem(JOG_EXPANDED_KEY, "1");
        } catch (e) {
          /* no critico */
        }
        if (jogPanelEl) {
          jogPanelEl.style.display = "";
          jogPanelEl.style.pointerEvents = "";
          delete jogPanelEl.dataset.closing;
        }
        jogReclampPanel();
        jogCloseSidebarIfNarrow();
        if (jogWasFullscreenBeforeCollapse) {
          jogWasFullscreenBeforeCollapse = false;
          jogApplyFullscreen(true);
        }
        workshopNotify();
      }

      function isJogOpen() {
        return !!(jogPanelEl && jogPanelEl.style.display !== "none" && jogPanelEl.dataset.closing !== "1");
      }

      function jogToggle() {
        if (isJogOpen()) jogCollapse();
        else jogExpand();
      }

      // Close the jog (the panel's "-" button or the bar's launcher).
      // Safety (explicit user request): if something was held
      // (knob, Z slider, a pressed arrow/Page key), FIRST
      // everything is released and the backend's acknowledgement is awaited, and ONLY AFTER THAT
      // the panel is hidden. In the meantime the panel stays inert
      // (pointer-events:none) so that nothing can be grabbed again.
      // It also turns off the keyboard mode: with the panel closed the arrows
      // must NOT move the machine (see jogKeyboardOffHook).
      // `silent`: applying the saved state when loading the page -- there is
      // nothing held yet, it is hidden directly without sending stops.
      function jogCollapse(silent) {
        // closing the jog turns off the no-limits mode (nobody is watching it)
        if (!silent && jogFreeActive()) postJogCommand("jog.free", { on: false });
        // Reported live 2026-10-08: closing the panel while in
        // full screen left the camera/the bar hidden
        // forever -- full screen has to be exited for real (and the
        // intention remembered for when it is opened again).
        jogWasFullscreenBeforeCollapse = jogIsFullscreen;
        if (jogIsFullscreen) jogApplyFullscreen(false);
        try {
          localStorage.setItem(JOG_EXPANDED_KEY, "0");
        } catch (e) {
          /* no critico */
        }
        if (jogKeyboardOffHook) jogKeyboardOffHook();
        var token = ++jogCloseToken;

        function finish() {
          if (token !== jogCloseToken) return; // se reabrio mientras tanto
          // The same fix as cameraCollapse() -- take the focus out of the
          // panel BEFORE hiding it (otherwise the browser reassigns the
          // focus and may trigger the on-screen keyboard).
          if (jogPanelEl && document.activeElement && jogPanelEl.contains(document.activeElement)) {
            document.activeElement.blur();
          }
          if (jogPanelEl) {
            jogPanelEl.style.display = "none";
            jogPanelEl.style.pointerEvents = "";
            delete jogPanelEl.dataset.closing;
          }
          workshopNotify();
        }

        if (silent) {
          finish();
          return;
        }
        workshopWithoutTouchGhost(); // the closing tap must not reach what is under the panel (keyboard bug)
        if (jogPanelEl) {
          jogPanelEl.dataset.closing = "1";
          jogPanelEl.style.pointerEvents = "none";
        }
        workshopNotify();
        jogReleaseAllHolds();
        // 2026-10-10 ("minimizing the jog has a delay"): before it was hidden
        // only with the acknowledgement of the stops (up to 1.5 s with the Pi busy).
        // The controls are already released and inert (pointer-events none) and
        // the stops go out anyway: it is hidden NOW.
        finish();
      }

      function isJogExpanded() {
        try {
          var ol = JSON.parse(localStorage.getItem("workshopJogSettings") || "{}").openOnLoad;
          if (ol === "open") return !jogIsPhone(); // a phone starts folded (open it covers the page); the launcher opens it
          if (ol === "closed") return false;
          return !jogIsPhone() && localStorage.getItem(JOG_EXPANDED_KEY) === "1";
        } catch (e) {
          return false;
        }
      }

      // Small rectangular button -- for the home/step/etc. rows.
      function jogMakeSmallButton(label, title) {
        var b = document.createElement("button");
        b.type = "button";
        b.title = title;
        b.textContent = label;
        b.className = "wf-btn"; // the design family button (gray outline); only the layout of the narrow panel is inline
        b.style.cssText = [
          "flex:1 1 0",
          "min-width:0",
          "padding:0",
          "font-size:11px",
          "touch-action:none",
          "-webkit-user-select:none",
          "user-select:none",
        ].join(";");
        return b;
      }

      function createJogPanel() {
        if (document.getElementById(JOG_PANEL_ID)) return;
        jogHomeButtons = []; // if the panel is recreated, do not drag buttons of the old one

        // Every listener this panel hangs on `window` (knob/slider
        // drags, keyboard) goes through here so it can be removed
        // in jogTeardownPanel() -- before, hiding the jog removed the panel
        // from the DOM but left these listeners alive: with "Keyboard: ON",
        // the arrows KEPT moving the machine with no panel on
        // screen, and every Reactivate added one more copy of each.
        function jogWinOn(type, fn) {
          window.addEventListener(type, fn);
          jogPanelTeardownFns.push(function () {
            window.removeEventListener(type, fn);
          });
        }

        var panel = document.createElement("div");
        panel.id = JOG_PANEL_ID;
        jogTouchStyle(); // overscroll-behavior, minimum sizes on touch screens (16-touch.js)
        workshopInjectFamily(); // the design family (wf-* classes): the tabs and buttons of the panel
        panel.style.cssText = [
          "position:fixed",
          "width:" + JOG_PANEL_W + "px;max-width:calc(100vw - " + 2 * MARGIN + "px);max-height:calc(100vh - " + 2 * MARGIN + "px)", // never bigger than the window (the body scrolls inside)
          "z-index:2147483646", // one point below the sidebar (section 0), which stays ALWAYS on top
          "background:#263238",
          "color:#fff",
          "border:2px solid " + jogAjGet().border,
          "border-radius:10px",
          "box-shadow:0 2px 10px rgba(0,0,0,0.5)",
          "font-family:Roboto,Helvetica,Arial,sans-serif",
          "-webkit-user-select:none",
          "user-select:none",
          "overflow:hidden",
        ].join(";");

        // -- barra de titulo (handle de arrastre + minimizar) --
        var header = document.createElement("div");
        header.style.cssText = [
          "height:36px",
          "flex:none",
          "background:transparent;border-bottom:1px solid rgba(255,255,255,0.12)",
          "display:flex",
          "align-items:center",
          "justify-content:space-between",
          "gap:2px",
          "padding:0 6px",
          "cursor:move",
          "touch-action:none",
          "font-size:12px",
        ].join(";");
        var title = document.createElement("span");
        title.textContent = i18nT('common.jog');
        title.style.cssText = "flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"; // narrow panel: the title gives way, the chips stay
        header.appendChild(title);

        // Only in a mobile viewport (a real phone, not the kiosk) -- see
        // isMobileViewport(). Explicit request: when opening DWC from a
        // phone, offer to enlarge the panel to full screen.
        if (isMobileViewport()) {
          jogFsBtn = document.createElement("button");
          jogFsBtn.type = "button";
          jogFsBtn.title = i18nT('jog.full_screen');
          jogFsBtn.textContent = "FS";
          jogFsBtn.style.cssText = [
            "width:" + (jogIsTouch() ? 40 : 28) + "px",
            "height:" + (jogIsTouch() ? 30 : 20) + "px",
            "border-radius:4px",
            "border:none",
            "background:rgba(255,255,255,0.15)",
            "color:#fff",
            "font-size:11px",
            "font-weight:bold",
            "line-height:18px",
            "padding:0",
            "cursor:pointer",
            "touch-action:none",
            "margin-right:4px",
          ].join(";");
          jogFsBtn.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
          });
          jogFsBtn.addEventListener("pointerup", function (ev) {
            ev.stopPropagation();
            jogToggleFullscreen();
          });
          header.appendChild(jogFsBtn);
        }

        var minBtn = document.createElement("button");
        minBtn.type = "button";
        minBtn.title = i18nT('jog.minimize');
        minBtn.textContent = "–"; // guion/minus
        // 2026-10-16 ("the jog does not minimize on the Pi"): with the mouse it worked and with the finger it did not. The button measured 20 x 20 px:
        // the finger fell on the title bar (which drags the panel and captures the pointer) and the pointerup never reached
        // the button. Now it measures 40 x 32 px and also minimizes with touchend / click (only once per touch).
        minBtn.style.cssText = [
          // same look as the gear (22 x 20); the finger target is larger thanks to a transparent border that is part of the
          // button but not painted (background-clip), so it is easy to hit and does not look bigger than its neighbours
          "flex:none",
          "box-sizing:content-box",
          "width:22px",
          "height:20px",
          "border-radius:11px", // 4px painted radius + the 7px transparent border: background-clip shrinks the radius by the border width
          "border:7px solid transparent",
          "margin:0 -3px 0 0",
          "background:rgba(255,255,255,0.15)",
          "background-clip:padding-box", // AFTER the background shorthand: the shorthand resets it and the border would be painted
          "color:#fff",
          "font-size:14px",
          "line-height:18px",
          "padding:0",
          "cursor:pointer",
          "touch-action:manipulation",
        ].join(";");
        var minLast = 0;
        function minTouch(ev) {
          ev.stopPropagation();
          if (ev.cancelable) ev.preventDefault();
          if (Date.now() - minLast < 700) return; // pointerup + touchend + click of the same tap
          minLast = Date.now();
          jogCollapse();
        }
        minBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault(); // ver nota en viewBtn pointerdown (EmergencyFab camara)
        });
        minBtn.addEventListener("pointerup", minTouch);
        minBtn.addEventListener("touchend", minTouch, { passive: false });
        minBtn.addEventListener("click", minTouch);
        // (A- / A+ left the header on 2026-10-16: the panel size is a slider in Ajustes > Apariencia)
        header.insertBefore(tjTipMakeHelpBtn(), jogFsBtn && jogFsBtn.parentNode === header ? jogFsBtn : null); // "?" modo ayuda (12-tips.js)
        jogGearMount(header); // gear (settings) and the optional A- / A+ (15-gear.js)
        jogStartupMount(header, minBtn); // start-up chip, then the minimize button (19-startup.js)
        panel.appendChild(header);
        jogHeaderEl = header;
        // (the status lights are not shown in the jog header any more, 2026-10-13)

        // -- fixed status bar (under the header, never scrolls): homing, blocks, warnings --
        var jogStatusBar = document.createElement("div");
        jogStatusBar.style.cssText = "flex:none;width:100%;box-sizing:border-box;padding:6px 10px;background:#263238;border-bottom:1px solid rgba(255,255,255,0.12);display:flex;flex-direction:column;gap:4px;position:relative;";
        panel.appendChild(jogStatusBar);

        // -- cuerpo --
        var body = document.createElement("div");
        body.style.cssText = "padding:8px;display:flex;flex-direction:column;align-items:center;gap:8px;";
        // The header (drag + minimize) stays ALWAYS visible: what does
        // not fit on the screen scrolls inside the body, it does not push
        // the panel out of the window (see JOG_BODY_MAX_H).
        body.style.maxHeight = JOG_BODY_MAX_H;
        body.style.overflowY = "auto";
        body.style.overflowX = "hidden"; jogScrollMount(body); jogBlockedWatch(body); // thin scrollbar (16-touch.js), explain a blocked touch (17-role.js)
        panel.appendChild(body);
        jogBodyEl = body;
        setTimeout(function () {
          jogApplyScale(jogScale); // after building everything (header + body already in the panel)
        }, 0);

        var statusThe = document.createElement("div");
        statusThe.style.cssText = "font-size:11px;color:#b0bec5;max-height:32px;overflow-y:auto;";
        jogStatusBar.appendChild(statusThe);
        jogStatusEl = statusThe;
        jogNoticeEl = document.createElement("div");
        jogNoticeEl.style.cssText = "display:none;position:absolute;left:0;top:100%;z-index:5;width:100%;box-sizing:border-box;padding:6px;border-radius:6px;background:rgba(255,152,0,0.18);border:1px solid #ffb74d;color:#ffe0b2;font-size:11px;font-weight:bold;line-height:1.35;text-align:center;";
        jogStatusBar.appendChild(jogNoticeEl);
        // Position: at the top, before the controls, the same in both options (13-position.js)
        var jogPosT = jogPosCard();
        body.appendChild(jogPosT.mini); // the compact position/speed bar that pins when the card scrolls away (13-position.js)
        body.appendChild(jogPosT.card);

        // Maximum speed CONFIGURED per axis (M203, read from the object
        // model in jogCheckEnabled) -- it is not the jog's speed itself
        // (that is already seen in jogStatusEl), it is the real ceiling RRF is going to
        // respect whatever this panel asks for, so that the user knows
        // beforehand how far each axis can go.
        var axisMaxThe = document.createElement("div");
        axisMaxThe.style.cssText = "font-size:10px;color:rgba(255,255,255,0.4);text-align:center;";
        axisMaxThe.textContent = i18nT('jog.axis_max');
        body.appendChild(axisMaxThe);
        jogAxisMaxEl = axisMaxThe;

        // -- STOP / E-STOP: always visible at the very top (neither
        // of the two depends on jogEnabled/the active tab on purpose --
        // they have to work even if the panel is "disabled" by
        // machine state, which is precisely the case where they could be most
        // needed). See the discussion with the user 2026-10-08:
        // - STOP: "soft" stop, the same as releasing the
        //   knob/Z already triggers but with a single tap. It does NOT cut motors/heaters,
        //   it does NOT need M999 nor rehome. It still cannot cancel the
        //   segment RRF already accepted (the same limitation as always, see
        //   jog_move.py) -- useful above all for "advanced mode"
        //   (keyboard/wheel), where there is not always such a clean
        //   "release" event as with a touch button.
        // - E-STOP: real RRF M112. It cuts everything immediately but leaves
        //   the machine in an emergency state (it needs M999 + rehome
        //   afterwards). DESIGN.md: the emergency stop never asks for
        //   confirmation, so it fires on the first touch (16-touch.js).
        // Pinned under the body (not inside it): the stop buttons never scroll
        // out of view, in either design, whatever tab or section is open.
        var jogDock = document.createElement("div");
        jogDock.style.cssText = "width:100%;box-sizing:border-box;flex:none;background:#263238;border-top:1px solid rgba(255,255,255,0.18);";
        panel.appendChild(jogDock);
        jogStopDockEl = jogDock;
        jogDock.style.touchAction = "none"; // dragging on the dock does not scroll the page behind
        // quick actions, always at hand (two taps: they move): Home (all), Home X / Y / Z, raise Z
        var jogQuick = document.createElement("div");
        jogQuick.style.cssText = "display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:6px 8px 0 8px;";
        jogDock.appendChild(jogQuick);
        var jogQH = jog2Helpers();
        var jogQCss = "min-height:" + jogTouchPx(30) + "px;border-radius:6px;font-size:11px;padding:0 1px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:clip;";
        [["Home", "G28", null], ["X", "G28 X", "X"], ["Y", "G28 Y", "Y"], ["Z", "G28 Z", "Z"]].forEach(function (h) {
          var qb = jogQH.buttonDouble(h[0], h[0] + "?", jogQCss, function () {
            if (jogBlockedExplain()) return;
            postCode(h[1]).catch(function (e) { console.error("[WorkshopJog] home " + h[0] + ":", e); });
          });
          qb.title = h[2] ? i18nT('jog.home_axis', { axis: h[2] }) : i18nT('jog.home_all_axes_g28');
          if (h[2]) jogQHomeButtons[h[2]] = qb;
          jogQuick.appendChild(qb);
        });
        // Probe: measures the surface under the head with the Z probe (G30 S-1) and says the height.
        // It changes no zero (it only reads). It moves Z down until the probe touches: two taps.
        var jogQProbe = jogQH.buttonDouble(i18nT('jog.probe'), i18nT('jog.probe_2'), jogQCss, function () {
          if (jogBlockedExplain()) return;
          jogFetchStatus(600)
            .then(function (st) {
              var ax = (st && st.move && st.move.axes) || [];
              var without = ["X", "Y", "Z"].filter(function (L) {
                var a = ax.filter(function (x) { return x && x.letter === L; })[0];
                return !a || !a.homed;
              });
              if (without.length) return jogNotifyWithoutHoming(without);
              return postCode("G30 S-1")
                .then(function (r) { return r && r.text ? r.text() : ""; })
                .then(function (t) {
                  var m = /(-?\d+(?:\.\d+)?)\s*mm/.exec(t || "");
                  var ok = m && !/error|warning/i.test(t || "");
                  jogShowNotice(ok ? i18nT('jog.probe_result', { z: m[1] }) : (String(t || "").trim().slice(0, 140) || i18nT('jog.probe_no_answer')), 8000);
                });
            })
            .catch(function (e) { console.error("[WorkshopJog] probe:", e); });
        });
        jogQProbe.title = i18nT('jog.probe_help');
        jogQuick.appendChild(jogQProbe);
        // The labels of these buttons never show dots: the font gets smaller until the word fits, and it is fitted
        // again whenever the bar changes size (the panel zoom, a resize) or the label changes (the "?" of the second tap).
        function jogAdjustText(btn) {
          btn.style.fontSize = "";
          var fs = 11;
          while (btn.scrollWidth > btn.clientWidth + 1 && fs > jogTouchFontMin(7)) {
            fs -= 0.5;
            btn.style.fontSize = fs + "px";
          }
        }
        var jogQBtns = jogQuick.querySelectorAll("button");
        function jogAdjustAll() {
          for (var qi = 0; qi < jogQBtns.length; qi++) jogAdjustText(jogQBtns[qi]);
        }
        if (typeof ResizeObserver === "function") new ResizeObserver(jogAdjustAll).observe(jogQuick);
        if (typeof MutationObserver === "function") {
          var jogQMo = new MutationObserver(jogAdjustAll);
          for (var qj = 0; qj < jogQBtns.length; qj++) jogQMo.observe(jogQBtns[qj], { childList: true, characterData: true, subtree: true });
        }
        setTimeout(jogAdjustAll, 0);
        var stopRow = document.createElement("div");
        stopRow.style.cssText = "display:flex;gap:4px;width:100%;box-sizing:border-box;padding:6px 8px 7px 8px;";
        jogDock.appendChild(stopRow);
        jogFreeMount(body); // "Move without limits" + its notice, below STOP / E-STOP (11-free.js)

        jogStopMount(stopRow); // STOP + E-STOP (16-touch.js)

        // -- X/Y mode: Free (circle, with axis snapping) or Straight
        // (two independent 1D sliders, total guarantee of a single
        // axis) -- live request 2026-10-08. The toggle lives above the
        // controls row so that it is seen before touching anything.
        var axisModeRow = document.createElement("div");
        axisModeRow.style.cssText = "display:flex;gap:4px;width:100%;";
        body.appendChild(axisModeRow);

        var axisModeFreeBtn = jogMakeSmallButton(i18nT('jog.free'), i18nT('jog.the_usual_x_y_circle_with'));
        var axisModeRectoBtn = jogMakeSmallButton(i18nT('jog.straight'), i18nT('jog.x_and_y_as_separate_sliders'));
        axisModeRow.appendChild(axisModeFreeBtn);
        axisModeRow.appendChild(axisModeRectoBtn);

        // -- fila: perilla (o X/Y en modo Recto) | deslizante de Z --
        var row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;";
        body.appendChild(row);

        // Helper ONLY for the visual part (track + thumb) of a
        // 1D slider -- reused by X, Y (Straight mode) and Z. The event
        // wiring stays explicit and separate for each one (as it
        // already was for Z) instead of a more generic factory -- easier
        // to follow/debug than an abstraction with callbacks.
        function jogMakeAxisTrack(width, height, topLabel, bottomLabel, thumbSize) {
          var track = document.createElement("div");
          track.style.cssText = [
            "position:relative",
            "width:" + width + "px",
            "height:" + height + "px",
            "border-radius:" + Math.min(width, height) / 2 + "px",
            "background:#37474f",
            "border:2px solid rgba(255,255,255,0.3)",
            "touch-action:none",
            "flex:0 0 auto",
          ].join(";");
          [
            [topLabel, "top:2px;"],
            [bottomLabel, "bottom:2px;"],
          ].forEach(function (pair) {
            var lbl = document.createElement("span");
            lbl.textContent = pair[0];
            lbl.style.cssText =
              "position:absolute;left:50%;transform:translateX(-50%);font-size:10px;color:rgba(255,255,255,0.45);pointer-events:none;" +
              pair[1];
            track.appendChild(lbl);
          });
          var thumb = document.createElement("div");
          thumb.style.cssText = [
            "position:absolute",
            "left:50%",
            "top:50%",
            "width:" + thumbSize + "px",
            "height:" + thumbSize + "px",
            "border-radius:50%",
            "background:#90caf9",
            "border:2px solid #fff",
            "box-shadow:0 1px 6px rgba(0,0,0,0.6)",
            "transform:translate(-50%,-50%)",
            "touch-action:none",
            "pointer-events:none",
          ].join(";");
          track.appendChild(thumb);
          return { track: track, thumb: thumb };
        }

        // -- X/Y in Straight mode: two independent 1D sliders.
        // Hidden by default (Free mode) -- jogApplyAxisMode below
        // shows/hides them together with the circle. RING_SIZE is declared
        // here (before the circle, further below) because these sliders
        // need the same height to line up.
        var RING_SIZE = 120;
        var X_TRACK_W = 32;
        var xAxis = jogMakeAxisTrack(X_TRACK_W, RING_SIZE, "X+", "X-", 24);
        jogXTrackEl = xAxis.track;
        jogXThumbEl = xAxis.thumb;
        jogXTrackEl.style.display = "none";
        row.appendChild(jogXTrackEl);

        var yAxis = jogMakeAxisTrack(X_TRACK_W, RING_SIZE, "Y+", "Y-", 24);
        jogYTrackEl = yAxis.track;
        jogYThumbEl = yAxis.thumb;
        jogYTrackEl.style.display = "none";
        row.appendChild(jogYTrackEl);

        function updateRectoAxisFromEvent(ev, track, thumb, setVal) {
          var rect = track.getBoundingClientRect();
          var cy = rect.top + rect.height / 2;
          var dy = ev.clientY - cy;
          var maxR = rect.height / 2 - 12; // 24px de thumb / 2
          var clamped = Math.max(-maxR, Math.min(maxR, dy));
          thumb.style.transform = "translate(-50%,-50%) translateY(" + clamped / jogScale + "px)";
          setVal(-(clamped / maxR));
        }

        // X: pointerdown on the track, pointermove/pointerup/pointercancel
        // on window (the same reason as the ring/Z -- setPointerCapture is
        // not reliable on this kiosk).
        jogXTrackEl.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!jogEnabled) return;
          jogStraightXPointerId = ev.pointerId;
          try {
            jogXTrackEl.setPointerCapture(jogStraightXPointerId);
          } catch (e) {
            /* ignorar */
          }
          updateRectoAxisFromEvent(ev, jogXTrackEl, jogXThumbEl, function (v) {
            jogStraightXVal = v;
          });
          jogSendXY(jogStraightXVal, jogStraightYPointerId !== null ? jogStraightYVal : 0, true);
        });
        jogWinOn("pointermove", function (ev) {
          if (jogStraightXPointerId === null || ev.pointerId !== jogStraightXPointerId) return;
          updateRectoAxisFromEvent(ev, jogXTrackEl, jogXThumbEl, function (v) {
            jogStraightXVal = v;
          });
          jogSendXY(jogStraightXVal, jogStraightYPointerId !== null ? jogStraightYVal : 0, false);
        });
        function jogRectoXEndDrag(ev) {
          if (jogStraightXPointerId === null || ev.pointerId !== jogStraightXPointerId) return;
          var releaseId = jogStraightXPointerId;
          jogStraightXPointerId = null;
          jogStraightXVal = 0;
          try {
            jogXTrackEl.releasePointerCapture(releaseId);
          } catch (e) {
            /* ya liberado */
          }
          jogXThumbEl.style.transform = "translate(-50%,-50%)";
          if (jogStraightYPointerId !== null) {
            // Y is still held -- send the updated state (X=0, Y
            // as it was), NOT a full stop_xy.
            jogSendXY(0, jogStraightYVal, true);
          } else {
            jogSendXYStateOrStop();
          }
        }
        jogWinOn("pointerup", jogRectoXEndDrag);
        jogWinOn("pointercancel", jogRectoXEndDrag);
        jogXTrackEl.addEventListener("lostpointercapture", jogRectoXEndDrag);

        // Y: mismo patron, eje separado.
        jogYTrackEl.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!jogEnabled) return;
          jogStraightYPointerId = ev.pointerId;
          try {
            jogYTrackEl.setPointerCapture(jogStraightYPointerId);
          } catch (e) {
            /* ignorar */
          }
          updateRectoAxisFromEvent(ev, jogYTrackEl, jogYThumbEl, function (v) {
            // the backend takes Y with the sign of the knob (up = negative, see dy = -uy there) and this slider gives up = +1:
            // without this sign Y+ (top) moved the machine to Y- and Y- (bottom) to Y+, the opposite of the knob
            jogStraightYVal = -v;
          });
          jogSendXY(jogStraightXPointerId !== null ? jogStraightXVal : 0, jogStraightYVal, true);
        });
        jogWinOn("pointermove", function (ev) {
          if (jogStraightYPointerId === null || ev.pointerId !== jogStraightYPointerId) return;
          updateRectoAxisFromEvent(ev, jogYTrackEl, jogYThumbEl, function (v) {
            // the backend takes Y with the sign of the knob (up = negative, see dy = -uy there) and this slider gives up = +1:
            // without this sign Y+ (top) moved the machine to Y- and Y- (bottom) to Y+, the opposite of the knob
            jogStraightYVal = -v;
          });
          jogSendXY(jogStraightXPointerId !== null ? jogStraightXVal : 0, jogStraightYVal, false);
        });
        function jogRectoYEndDrag(ev) {
          if (jogStraightYPointerId === null || ev.pointerId !== jogStraightYPointerId) return;
          var releaseId = jogStraightYPointerId;
          jogStraightYPointerId = null;
          jogStraightYVal = 0;
          try {
            jogYTrackEl.releasePointerCapture(releaseId);
          } catch (e) {
            /* ya liberado */
          }
          jogYThumbEl.style.transform = "translate(-50%,-50%)";
          if (jogStraightXPointerId !== null) {
            jogSendXY(jogStraightXVal, 0, true);
          } else {
            jogSendXYStateOrStop();
          }
        }
        jogWinOn("pointerup", jogRectoYEndDrag);
        jogWinOn("pointercancel", jogRectoYEndDrag);
        jogYTrackEl.addEventListener("lostpointercapture", jogRectoYEndDrag);

        var ring = document.createElement("div");
        ring.style.cssText = [
          "position:relative",
          "width:" + RING_SIZE + "px",
          "height:" + RING_SIZE + "px",
          "border-radius:50%",
          "background:#37474f",
          "border:2px solid rgba(255,255,255,0.3)",
          "touch-action:none",
          "flex:0 0 auto",
        ].join(";");
        row.appendChild(ring);
        jogRingEl = ring;

        // Switches between Free mode (circle) and Straight (separate
        // X/Y sliders) -- it cuts anything held from the mode being
        // abandoned, so as not to leave a "phantom" state.
        function jogApplyAxisMode(mode) {
          jogAxisMode = mode;
          try {
            localStorage.setItem(JOG_AXIS_MODE_KEY, mode);
          } catch (e) {
            /* no critico */
          }
          var isRecto = mode === "straight";
          ring.style.display = isRecto ? "none" : "";
          jogXTrackEl.style.display = isRecto ? "" : "none";
          jogYTrackEl.style.display = isRecto ? "" : "none";
          axisModeFreeBtn.style.background = isRecto ? "#424242" : "#1976d2";
          axisModeRectoBtn.style.background = isRecto ? "#1976d2" : "#424242";
          if (isRecto && jogPointerId !== null) {
            jogPointerId = null;
            if (jogKnobEl) jogKnobEl.style.transform = "translate(-50%,-50%)";
            jogRingEl.style.boxShadow = "";
            jogSendStopXY();
          } else if (!isRecto && (jogStraightXPointerId !== null || jogStraightYPointerId !== null)) {
            jogStraightXPointerId = null;
            jogStraightYPointerId = null;
            jogStraightXVal = 0;
            jogStraightYVal = 0;
            jogXThumbEl.style.transform = "translate(-50%,-50%)";
            jogYThumbEl.style.transform = "translate(-50%,-50%)";
            jogSendStopXY();
          }
        }
        axisModeFreeBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        axisModeFreeBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          jogApplyAxisMode("free");
        });
        axisModeRectoBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        axisModeRectoBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          jogApplyAxisMode("straight");
        });

        // Crucecita de referencia + etiquetas de eje, puramente visuales.
        var crosshair = document.createElement("div");
        crosshair.style.cssText =
          "position:absolute;left:50%;top:50%;width:1px;height:100%;background:rgba(255,255,255,0.15);transform:translate(-50%,-50%);pointer-events:none;";
        ring.appendChild(crosshair);
        var crosshair2 = document.createElement("div");
        crosshair2.style.cssText =
          "position:absolute;left:50%;top:50%;width:100%;height:1px;background:rgba(255,255,255,0.15);transform:translate(-50%,-50%);pointer-events:none;";
        ring.appendChild(crosshair2);

        [
          ["Y+", "left:50%;top:2px;transform:translateX(-50%);"],
          ["Y-", "left:50%;bottom:2px;transform:translateX(-50%);"],
          ["X-", "left:3px;top:50%;transform:translateY(-50%);"],
          ["X+", "right:3px;top:50%;transform:translateY(-50%);"],
        ].forEach(function (pair) {
          var lbl = document.createElement("span");
          lbl.textContent = pair[0];
          lbl.style.cssText = "position:absolute;font-size:10px;color:rgba(255,255,255,0.45);pointer-events:none;" + pair[1];
          ring.appendChild(lbl);
        });

        var KNOB_SIZE = 42;
        var knob = document.createElement("div");
        knob.style.cssText = [
          "position:absolute",
          "left:50%",
          "top:50%",
          "width:" + KNOB_SIZE + "px",
          "height:" + KNOB_SIZE + "px",
          "border-radius:50%",
          "background:#90caf9",
          "border:2px solid #fff",
          "box-shadow:0 1px 6px rgba(0,0,0,0.6)",
          "transform:translate(-50%,-50%)",
          "touch-action:none",
          "pointer-events:none", // the events are caught by the ring, not the knob
        ].join(";");
        ring.appendChild(knob);
        jogKnobEl = knob;

        // Axis "snapping" -- live request 2026-10-08: help
        // get straight movements in X/Y without losing the freedom of the
        // circle (unlike a separate "Straight" mode -- see below
        // -- this forces nothing, it only helps when the drag is already
        // CLOSE to a pure axis). If the angle of the vector with respect to the
        // nearest X or Y axis is less than JOG_SNAP_DEG, the other
        // component is forced to 0 -- the touch equivalent of a soft
        // magnet on each cardinal axis.
        var JOG_SNAP_DEG = 6;
        function jogApplyAxisSnap(nx, ny) {
          var ax = Math.abs(nx);
          var ay = Math.abs(ny);
          if (ax < 0.001 && ay < 0.001) return [nx, ny];
          var angleFromX = (Math.atan2(ay, ax) * 180) / Math.PI; // 0..90, regardless of the quadrant
          if (angleFromX <= JOG_SNAP_DEG) return [nx, 0];
          if (angleFromX >= 90 - JOG_SNAP_DEG) return [0, ny];
          return [nx, ny];
        }

        function updateKnobFromEvent(ev, force) {
          var rect = ring.getBoundingClientRect();
          var cx = rect.left + rect.width / 2;
          var cy = rect.top + rect.height / 2;
          var dx = ev.clientX - cx;
          var dy = ev.clientY - cy;
          var maxR = rect.width / 2 - 4;
          var dist = Math.hypot(dx, dy);
          var scale = dist > maxR ? maxR / dist : 1;
          var nx = (dx * scale) / maxR;
          var ny = (dy * scale) / maxR;
          if (jogAxisSnapEnabled) {
            var snapped = jogApplyAxisSnap(nx, ny);
            nx = snapped[0];
            ny = snapped[1];
          }
          // The visual knob uses the values ALREADY snapped -- what is seen
          // has to match what is sent, otherwise the magnet's "click"
          // feels like a strange jump instead of a help.
          knob.style.transform = "translate(-50%,-50%) translate(" + (nx * maxR) / jogScale + "px," + (ny * maxR) / jogScale + "px)";
          var mag = Math.min(Math.hypot(nx, ny), 1);
          ring.style.boxShadow = "0 0 " + (4 + mag * 16).toFixed(0) + "px rgba(255,112,67," + (0.15 + mag * 0.55).toFixed(2) + ")";
          jogKnobNX = nx;
          jogKnobNY = ny;
          jogSendXY(nx, ny, force);
        }

        function resetKnob() {
          knob.style.transform = "translate(-50%,-50%)";
          ring.style.boxShadow = "";
          jogSendXYStateOrStop();
        }

        // IMPORTANT -- drag tracking at the `window` level, NOT
        // listening to pointermove/pointerup on the ring itself. Confirmed
        // live (2026-10-07): setPointerCapture() is not reliable on
        // this kiosk (Wayland + touch) -- if the finger strays just
        // outside the 120px circle (easy with a real finger), the
        // browser stops delivering events to the ring because the capture
        // never took. Listening on `window` the tracking does not depend on
        // which element the event lands on (hit-testing) nor on whether the capture
        // worked -- it only depends on the pointerId staying the same.
        // setPointerCapture is still attempted anyway (it does no harm when
        // it works, in other browsers/devices).
        ring.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!jogEnabled) return;
          jogPointerId = ev.pointerId;
          try {
            ring.setPointerCapture(jogPointerId);
          } catch (e) {
            /* ignorar */
          }
          updateKnobFromEvent(ev, true);
        });
        jogWinOn("pointermove", function (ev) {
          if (jogPointerId === null || ev.pointerId !== jogPointerId) return;
          updateKnobFromEvent(ev, false);
        });
        // Unlike movement tracking (which requires the exact pointerId,
        // so as not to mix the knob's finger with another finger
        // touching something else on a touch kiosk), release is more permissive
        // in what LANDS on this listener (see the pointerId filter
        // further below, which is exact since this now listens on window
        // together with any other pointer of the page) -- but it is still
        // complemented by the BACKEND's watchdog (see jog_move.py)
        // for the edge case where NO release event ever arrives
        // for this particular pointerId.
        function ringEndDrag(ev) {
          if (jogPointerId === null || ev.pointerId !== jogPointerId) return;
          var releaseId = jogPointerId;
          jogPointerId = null;
          try {
            ring.releasePointerCapture(releaseId);
          } catch (e) {
            /* ya liberado */
          }
          resetKnob();
        }
        jogWinOn("pointerup", ringEndDrag);
        jogWinOn("pointercancel", ringEndDrag);
        // lostpointercapture: a direct signal from the browser that we NO LONGER
        // have the pointer (for whatever reason) -- an additional safety net
        // in browsers where the capture does work.
        ring.addEventListener("lostpointercapture", ringEndDrag);

        // -- Z slider (replaces the Z+/Z- on/off buttons,
        // 2026-10-08 fourth round) -- explicit user request after
        // explaining why Z felt worse than X/Y on release: the
        // knob is analog (people naturally "ease off" toward the
        // center an instant before releasing, so the last
        // unavoidable stretch -- RRF cannot cancel an already accepted G1 -- comes out
        // small almost always), but an on/off button has no way to
        // ease off, so that last stretch came out at full speed almost
        // always. Exactly the same mechanism as the ring (vertical drag
        // = magnitude -1..1, release = send stop again), so Z
        // inherits the same natural mitigation. See jog_move.py for the
        // backend side (z went from being a sign to a continuous value).
        var Z_TRACK_W = 32;
        var zTrack = document.createElement("div");
        zTrack.style.cssText = [
          "position:relative",
          "width:" + Z_TRACK_W + "px",
          "height:" + RING_SIZE + "px",
          "border-radius:" + Z_TRACK_W / 2 + "px",
          "background:#37474f",
          "border:2px solid rgba(255,255,255,0.3)",
          "touch-action:none",
          "flex:0 0 auto",
        ].join(";");
        row.appendChild(zTrack);
        jogZTrackEl = zTrack;

        [
          ["Z+", "top:2px;"],
          ["Z-", "bottom:2px;"],
        ].forEach(function (pair) {
          var lbl = document.createElement("span");
          lbl.textContent = pair[0];
          lbl.style.cssText =
            "position:absolute;left:50%;transform:translateX(-50%);font-size:10px;color:rgba(255,255,255,0.45);pointer-events:none;" +
            pair[1];
          zTrack.appendChild(lbl);
        });

        var Z_THUMB_SIZE = 24;
        var zThumb = document.createElement("div");
        zThumb.style.cssText = [
          "position:absolute",
          "left:50%",
          "top:50%",
          "width:" + Z_THUMB_SIZE + "px",
          "height:" + Z_THUMB_SIZE + "px",
          "border-radius:50%",
          "background:#90caf9",
          "border:2px solid #fff",
          "box-shadow:0 1px 6px rgba(0,0,0,0.6)",
          "transform:translate(-50%,-50%)",
          "touch-action:none",
          "pointer-events:none", // the events are caught by the track, not the thumb
        ].join(";");
        zTrack.appendChild(zThumb);
        jogZThumbEl = zThumb;

        // Mismo patron que updateKnobFromEvent -- 1 sola dimension
        // (vertical) en vez de 2.
        function updateZFromEvent(ev, force) {
          var rect = zTrack.getBoundingClientRect();
          var cy = rect.top + rect.height / 2;
          var dy = ev.clientY - cy;
          var maxR = rect.height / 2 - Z_THUMB_SIZE / 2;
          var clamped = Math.max(-maxR, Math.min(maxR, dy));
          zThumb.style.transform = "translate(-50%,-50%) translateY(" + clamped / jogScale + "px)";
          // Up = Z+ (negative dy), so the sign is inverted.
          var nz = -(clamped / maxR);
          jogSendZ(nz, force);
        }

        // The same reason as the ring (see the big comment above
        // ringEndDrag): listen on `window`, not on the track, because
        // setPointerCapture is not reliable on this kiosk.
        zTrack.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!jogEnabled) return;
          jogZPointerId = ev.pointerId;
          try {
            zTrack.setPointerCapture(jogZPointerId);
          } catch (e) {
            /* ignorar */
          }
          updateZFromEvent(ev, true);
        });
        jogWinOn("pointermove", function (ev) {
          if (jogZPointerId === null || ev.pointerId !== jogZPointerId) return;
          updateZFromEvent(ev, false);
        });
        function zTrackEndDrag(ev) {
          if (jogZPointerId === null || ev.pointerId !== jogZPointerId) return;
          var releaseId = jogZPointerId;
          try {
            zTrack.releasePointerCapture(releaseId);
          } catch (e) {
            /* ya liberado */
          }
          jogStopZHold();
        }
        jogWinOn("pointerup", zTrackEndDrag);
        jogWinOn("pointercancel", zTrackEndDrag);
        zTrack.addEventListener("lostpointercapture", zTrackEndDrag);

        // -- control de velocidad (slider continuo, reemplaza los 3
        // botones fijos de antes) --
        var speedRow = document.createElement("div");
        speedRow.style.cssText = "display:flex;align-items:center;gap:6px;width:100%;";
        body.appendChild(speedRow);

        // Plain text, not emoji -- the kiosk's font does not have those
        // glyphs and they look like a "broken image" icon (the same reason
        // documented above for the camera buttons).
        var speedIconSlow = document.createElement("span");
        speedIconSlow.textContent = "MIN";
        speedIconSlow.style.cssText = "font-size:10px;color:rgba(255,255,255,0.45);flex:0 0 auto;";
        speedRow.appendChild(speedIconSlow);

        var speedSlider = document.createElement("input");
        speedSlider.type = "range";
        speedSlider.min = "5";
        speedSlider.max = "100";
        speedSlider.step = "1";
        speedSlider.value = String(jogSpeedPercent);
        speedSlider.title = i18nT('jog.maximum_jog_speed');
        speedSlider.style.cssText = "flex:1 1 auto;width:0;height:20px;touch-action:pan-x;cursor:pointer;";
        speedRow.appendChild(speedSlider);

        var speedIconFast = document.createElement("span");
        speedIconFast.textContent = "MAX";
        speedIconFast.style.cssText = "font-size:10px;color:rgba(255,255,255,0.45);flex:0 0 auto;";
        speedRow.appendChild(speedIconFast);

        // stopPropagation on pointerdown/up (not on the "input" event --
        // that one does not exist on the panel/header so there is nothing to
        // override), the same pattern as the other controls: the slider is
        // a child of the draggable panel, without this dragging the thumb
        // would also drag the whole panel.
        speedSlider.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
        });
        speedSlider.addEventListener("input", function () {
          jogSpeedPercent = parseFloat(speedSlider.value);
          saveSpeedPercent(jogSpeedPercent);
          jogUpdateStatusText();
        });

        // -- tabs: Home / Step / Advanced -- groups the secondary
        // functions instead of continuing to pile up loose rows in
        // the body as more are added (explicit request of the
        // user, session 2026-10-08: "I want a way to have the
        // buttons organized"). The knob/Z/speed/STOP at the top
        // stay ALWAYS visible -- they are the main control, this
        // only applies to the secondary. "Advanced" is for now a
        // placeholder: that is where the mode with keyboard/mouse wheel/live
        // position/limits/saved positions/macros/
        // air/light that the user asked for a next iteration will live.
        var JOG_TAB_KEY = "emergencyFabJogTab";
        var jogTabSections = {};
        var jogTabBtns = {};

        var tabBar = document.createElement("div");
        tabBar.className = "wf-tabs"; // the tabs of the design family: text, a thin line, the open one in 600 with a 2 px line
        tabBar.style.cssText = "width:100%;margin-top:4px;";
        body.appendChild(tabBar);

        var tabContent = document.createElement("div");
        tabContent.style.cssText = "width:100%;";
        body.appendChild(tabContent);
        var jogActiveTabId = "step";
        function jogSelectTab(id) {
          jogActiveTabId = id;
          tabBar.style.setProperty("--wf-sec", jogAjAccent());
          Object.keys(jogTabSections).forEach(function (k) {
            jogTabSections[k].style.display = k === id ? "flex" : "none";
            // like the pages' tabs (DESIGN.md 3): the family marks the open one; the stripe takes the accent the person chose
            jogTabBtns[k].classList.toggle("on", k === id);
          });
          try {
            localStorage.setItem(JOG_TAB_KEY, id);
          } catch (e) {
            /* no critico */
          }
          // The fast position/limits/air/light poll and the keyboard
          // mode only make sense with the "Advanced" tab
          // open -- it avoids wasting polls/stealing arrows when the
          // user is looking at Home or Step. The functions do not
          // yet exist the FIRST time this runs (they are defined further below
          // in the same scope) but they do by then -- hoisting of
          // function declarations.
          // 2026-10-08 ("I want position and speed in all the
          // tabs"): that block is now OUTSIDE the tabs, so
          // the poll runs in all of them (it is still cut when closing the panel,
          // see jogPanelTeardownFns). 2026-10-11: the keyboard no longer lives in
          // Advanced (it is drawn in the main view, see kbCard), so
          // changing tab does not turn it off.
          if (typeof jogStartAdvPoll === "function") jogStartAdvPoll();
          // The tabs have quite different heights (Advanced is the
          // tallest) -- if we are already in full screen, the scaling
          // calculated for the PREVIOUS tab becomes outdated and the
          // content of the new tab may be cut off. It recalculates
          // against the real size of the newly selected tab (there is no
          // need to ask for fullscreen again, we are already inside).
          if (jogIsFullscreen && typeof jogComputeAndApplyBodyScale === "function") {
            jogComputeAndApplyBodyScale();
          }
        }

        function jogMakeTabButton(id, label) {
          var b = document.createElement("button");
          b.type = "button";
          b.textContent = label;
          b.className = "wf-tab";
          b.style.cssText = "touch-action:none;";
          b.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
          });
          b.addEventListener("pointerup", function (ev) {
            ev.stopPropagation();
            jogSelectTab(id);
          });
          tabBar.appendChild(b);
          jogTabBtns[id] = b;
          return b;
        }

        function jogMakeTabSection(id) {
          var sec = document.createElement("div");
          sec.style.cssText = "display:none;flex-direction:column;gap:4px;width:100%;";
          tabContent.appendChild(sec);
          jogTabSections[id] = sec;
          return sec;
        }

        jogMakeTabButton("step", i18nT('jog.step'));

        var stepSection = jogMakeTabSection("step");
        // 2026-10-16: the Advanced tab is back as a real tab: a registry of collapsible sections (14-advanced.js,
        // docs-internal/JOG-ADVANCED.md). Other files add sections with jogRegisterSectionAdvanced().
        jogMakeTabButton("advanced", i18nT('jog.advanced'));
        var jogAvUI = jogAvAssembleTab(jogMakeTabSection("advanced"));
        jogPanelTeardownFns.push(jogAvUI.destroy);
        // 2026-10-15: the Advanced tab is gone (it only held the macro buttons: the position card and the keyboard moved
        // out of it before). The macro buttons are a collapsible section under the tabs, in every view.
        var macrosHost = document.createElement("div");
        macrosHost.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;";
        body.appendChild(macrosHost);

        // -- Advanced mode -- explicit user request, session
        // 2026-10-08: keyboard, mouse wheel, live position, visual
        // limits, saved positions, air/light and custom macro
        // buttons.
        //
        // Live request, same session: "I don't want, if I keep adding,
        // this to fill up with uncontrolled buttons" -- as this tab
        // grew (and above all the LISTS that can keep
        // growing -- saved positions, macros), piling everything
        // loose stopped being enough. Pattern chosen by the user
        // himself ("they stay hidden and leave a small arrow to
        // show that section"): collapsible accordion-style sections, each
        // with its own title + arrow, collapsed by default
        // except the two that make sense to always see at the start
        // (Position/speed, Air/Light). Those that can grow most without
        // limit (Saved positions, Macros) start collapsed.
        function jogMakeCollapsibleSection(title, defaultOpen, parentThe) {
          var wrap = document.createElement("div");
          wrap.style.cssText = "width:100%;border-top:1px solid rgba(255,255,255,0.12);margin-top:4px;padding-top:4px;";

          var header = document.createElement("button");
          header.type = "button";
          header.style.cssText = [
            "display:flex",
            "align-items:center",
            "justify-content:space-between",
            "width:100%",
            "background:none",
            "border:none",
            "color:#eceff1",
            "font-size:10px",
            "font-weight:bold",
            "padding:4px 2px",
            "cursor:pointer",
            "touch-action:none",
            "-webkit-user-select:none",
            "user-select:none",
          ].join(";");
          var titleSpan = document.createElement("span");
          titleSpan.textContent = title;
          header.appendChild(titleSpan);
          // Plain text ("v"/">"), not unicode symbols -- the same reason as
          // always (kiosk font without those glyphs).
          var arrow = document.createElement("span");
          arrow.textContent = defaultOpen ? "v" : ">";
          arrow.style.cssText = "color:rgba(255,255,255,0.4);";
          header.appendChild(arrow);
          wrap.appendChild(header);

          var content = document.createElement("div");
          content.style.cssText =
            "display:" + (defaultOpen ? "flex" : "none") + ";flex-direction:column;gap:4px;width:100%;padding-top:2px;";
          wrap.appendChild(content);

          var isOpen = defaultOpen;
          header.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
          });
          header.addEventListener("pointerup", function (ev) {
            ev.stopPropagation();
            isOpen = !isOpen;
            content.style.display = isOpen ? "flex" : "none";
            arrow.textContent = isOpen ? "v" : ">";
          });

          (parentThe || macrosHost).appendChild(wrap);
          return content;
        }

        // Work areas (zones, go to zero, measure Z, cut area) and saved
        // positions live only in the Workbench page now (2026-10-13).
        var secMacros = jogMakeCollapsibleSection(i18nT('jog.macro_buttons'), jogAjOpen("macros", false));
        // Ajustes (engrane): ocultar / ordenar pestanas y secciones.
        jogAjApplyLayout(
          {
            position: jogPosT.card,
            macros: secMacros.parentNode,
          },
          macrosHost,
          jogTabBtns,
          tabBar
        );

        // -- fast position poll (400 ms in Advanced, ~1 s elsewhere): feeds the
        // position card and the air / light buttons. It only runs while the
        // panel is open and is stopped when the panel is torn down.
        var JOG_ADV_POLL_MS = 100; // the position card reads DWC's store (no network): fast, so it follows the movement
        var jogAdvPollTimer = null;

        var jogAdvLastAt = 0;
        function jogAdvPoll() {
          if (!isJogOpen()) return; // panel cerrado: no gastar el poll de 400ms
          if (pluginStopped) return;
          var slow = Date.now() - jogAdvLastAt >= 950; // the sections of the Advanced tab keep their ~1 s rhythm
          if (slow) jogAdvLastAt = Date.now();
          jogFetchStatus(300)
            .then(function (status) {
              jogPosT.update(status); // tarjeta de posicion (13-position.js): every poll
              if (slow) jogAvUI.update(status); // sections of the Advanced tab (14-advanced.js): same poll, no timers of their own
            })
            .catch(function () {
              // Tolerate -- it is not worth cutting anything because of a single failure of this secondary poll.
            });
        }

        function jogStartAdvPoll() {
          if (jogAdvPollTimer) return;
          jogAdvPoll();
          jogAdvPollTimer = setInterval(jogAdvPoll, JOG_ADV_POLL_MS);
        }

        function jogStopAdvPoll() {
          if (jogAdvPollTimer) {
            clearInterval(jogAdvPollTimer);
            jogAdvPollTimer = null;
          }
        }
        jogPanelTeardownFns.push(jogStopAdvPoll);


        // -- keyboard: arrows for X/Y, Page Up/Down for Z -- off
        // by default (the typed keyboard's "Activate keyboard" button, see
        // kbCard), because capturing arrows on the
        // WHOLE page without the user asking could break other
        // normal uses of those keys in DWC (scroll, etc). While
        // it is off the listeners below do nothing (they check
        // jogKeyboardActive). It reuses jogSendXY/jogSendZ/jogSendStopXY/
        // jogStopZHold -- the SAME functions already used by the knob and
        // the Z buttons, so it runs through the same backend/watchdog,
        // with no second parallel movement mechanism.
        var jogKeyboardActive = false;
        var jogHeldDirKeys = {}; // {"ArrowUp": true, ...} -- sostenidas ahora
        // jogHeldZKey is already declared in the outer scope (see further
        // up, near jogKeyboardXYHeld) -- do NOT declare it again
        // here with "var", that would create a SEPARATE local variable that
        // shadows the outer one inside createJogPanel(), leaving
        // jogHeartbeat (which lives outside) seeing forever the
        // initial null value no matter what happens in here. Confirmed
        // live 2026-10-08 -- exactly the bug that threw
        // "ReferenceError: jogHeldZKey is not defined" in the heartbeat.
        var jogZKeyboardLastEventAt = 0;

        // Request 2026-10-11 ("in the controls, that it can be said from the
        // config 'use keyboard' and that it draws the keys that control it with
        // their animations; with that we remove the keyboard tab"): there is no
        // collapsible "Keyboard" section in Advanced any more. Settings > What is shown >
        // Controls to move > X / Y > Keyboard (controles.keyboard, of this
        // screen) draws a little keyboard in the main view of BOTH
        // options (placed by the end of createJogPanel / jog2Assemble) with its
        // button to activate it: capturing the arrows is still on request,
        // as before. It is the ONLY control for X/Y and Z (2026-10-11, "if you
        // use one you cannot use the others"): jogAplicarControles / jog2Move do not
        // draw knob, sliders, arrows nor Z. On touch screens without a
        // mouse jogControls returns the factory ones (jogAjHasKeyboard,
        // 18-settings.js; before hasLikelyKeyboard also hid laptops
        // with a touch screen), so it is never drawn.
        var kbToggleBtn = null;
        var kbCard = null; // the drawn little keyboard (null = it does not go on this screen)
        var kbTeclas = {}; // id -> tecla dibujada: up, down, left, right, zMas, zMenos
        var kbDestello = {}; // id -> until when a tapped key is seen pressed (one step)
        var KB_ID_ARROW = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
        function kbIdZ(code) {
          if (code === "PageUp" || code === "Numpad9") return "zMore";
          if (code === "PageDown" || code === "Numpad3") return "zMinus";
          return null;
        }

        if (jogControls(jogAjGet().style === 2 ? 2 : 1).keyboard && jogAjHasKeyboard()) {
          kbCard = document.createElement("div");
          kbCard.style.cssText = "width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:6px;";
          // amber heartbeat of the held key (it moves the machine, DESIGN.md 2)
          var kbCss = document.createElement("style");
          kbCss.textContent = "@keyframes workshopJogKbPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,143,0,0.75)}50%{box-shadow:0 0 0 4px rgba(255,143,0,0)}}";
          kbCard.appendChild(kbCss);
          // arrows in an inverted T on the left; Page Up / Page Down on the right
          var kbGrid = document.createElement("div");
          kbGrid.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(0,1.3fr);grid-template-rows:34px 34px;gap:4px;";
          kbCard.appendChild(kbGrid);
          [
            ["up", "▲", "Y+", 2, 1],
            ["left", "◀", "X-", 1, 2],
            ["down", "▼", "Y-", 2, 2],
            ["right", "▶", "X+", 3, 2],
            ["zMore", i18nT('jog.pgup'), i18nT('jog.z_up'), 4, 1],
            ["zMinus", i18nT('jog.pgdn'), i18nT('jog.z_down'), 4, 2],
          ].forEach(function (d) {
            var t = document.createElement("div");
            t.style.cssText =
              "grid-column:" + d[3] + ";grid-row:" + d[4] + ";display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;box-sizing:border-box;" +
              "border-radius:6px;border:1px solid rgba(255,255,255,0.23);border-bottom-width:3px;background:#37474f;color:#eceff1;line-height:1.1;" +
              "transition:background 80ms,transform 80ms,border-bottom-width 80ms,opacity 120ms;" + (d[0].charAt(0) === "z" ? "margin-left:6px;" : "");
            var a = document.createElement("span");
            a.style.cssText = "font-size:" + (d[0].charAt(0) === "z" ? "11px" : "12px") + ";font-weight:600;white-space:nowrap;";
            a.textContent = d[1];
            var b = document.createElement("span");
            b.style.cssText = "font-size:10px;color:#b0bec5;white-space:nowrap;";
            b.textContent = d[2];
            t.appendChild(a);
            t.appendChild(b);
            kbGrid.appendChild(t);
            kbTeclas[d[0]] = t;
          });
          kbTeclas.zMore.title = i18nT('jog.pgup_or_numpad_9_raises_z');
          kbTeclas.zMinus.title = i18nT('jog.pgdn_or_numpad_3_lowers_z');

          kbToggleBtn = document.createElement("button");
          kbToggleBtn.type = "button";
          kbToggleBtn.style.cssText = "width:100%;min-height:32px;border-radius:6px;border:1px solid rgba(255,255,255,0.23);background:transparent;color:#eceff1;font:inherit;font-size:12px;cursor:pointer;touch-action:none;padding:0 6px;";
          kbCard.appendChild(kbToggleBtn);

          var kbHintThe = document.createElement("div");
          kbHintThe.style.cssText = "font-size:10px;color:#b0bec5;text-align:center;width:100%;";
          kbHintThe.textContent = i18nT('jog.tap_a_key_one_step_hold');
          kbCard.appendChild(kbHintThe);
        }

        // Paints each key according to what is happening NOW (it reads jogHeldDirKeys,
        // jogZTeclaPend and jogHeldZKey, the same state that moves the machine,
        // so what is drawn never lies): off = dim gray; active = gray;
        // tapped (waiting to see if it is a step) = blue and sunken; held
        // (continuous) = amber, sunken and pulsing.
        function kbPaint() {
          if (!kbCard) return;
          var ahora = Date.now();
          var state = {};
          Object.keys(jogHeldDirKeys).forEach(function (k) {
            if (KB_ID_ARROW[k]) state[KB_ID_ARROW[k]] = jogHeldDirKeys[k] === true ? "follows" : "touch";
          });
          if (jogZTeclaPend && kbIdZ(jogZTeclaPend)) state[kbIdZ(jogZTeclaPend)] = "touch";
          if (jogHeldZKey && kbIdZ(jogHeldZKey)) state[kbIdZ(jogHeldZKey)] = "follows";
          Object.keys(kbTeclas).forEach(function (id) {
            var t = kbTeclas[id];
            var st = jogKeyboardActive ? state[id] || (kbDestello[id] > ahora ? "touch" : "") : "";
            t.style.opacity = jogKeyboardActive ? "1" : "0.45";
            t.style.background = st === "follows" ? "#ff8f00" : st === "touch" ? "#1976d2" : jogKeyboardActive ? "#455a64" : "#37474f";
            t.style.transform = st ? "translateY(2px)" : "";
            t.style.borderBottomWidth = st ? "1px" : "3px";
            t.style.animation = st === "follows" ? "workshopJogKbPulse 0.8s ease-in-out infinite" : "";
            t.lastChild.style.color = st ? "#fff" : "#b0bec5";
          });
          if (kbToggleBtn) {
            // encendido = verde (DESIGN.md 2: interruptor que prende algo)
            kbToggleBtn.textContent = jogKeyboardActive ? i18nT('jog.keyboard_active_tap_to_turn_off') : i18nT('jog.activate_keyboard');
            kbToggleBtn.style.background = jogKeyboardActive ? "#2e7d32" : "transparent";
            kbToggleBtn.style.borderColor = jogKeyboardActive ? "#2e7d32" : "rgba(255,255,255,0.23)";
            kbToggleBtn.title = jogKeyboardActive ? i18nT('jog.release_the_arrows_and_pgup_pgdn') : i18nT('jog.move_with_the_arrows_x_y');
            // blocked: the button is dimmed and does nothing
            kbToggleBtn.style.opacity = jogEnabled || jogKeyboardActive ? "1" : "0.4";
            kbToggleBtn.style.cursor = jogEnabled ? "pointer" : "not-allowed";
          }
        }
        // A tap (one step) is seen pressed for an instant even though the key was already released.
        function kbDestellar(id) {
          if (!kbCard || !id) return;
          kbDestello[id] = Date.now() + 180;
          kbPaint();
          setTimeout(kbPaint, 200);
        }

        function jogSetKeyboardActive(on) {
          if (on && !kbCard) return; // without a drawn little keyboard nothing is captured
          jogKeyboardActive = on;
          if (!on) {
            jogTeclaLimpiar();
            jogHeldDirKeys = {};
            jogHeldZKey = null;
            jogKeyboardXYHeld = false;
            jogSendStopXY();
            jogStopZHold();
          }
          kbPaint();
        }
        // jogCollapse() calls it when closing the panel: it turns off the keyboard mode
        // WITHOUT sending stops (jogReleaseAllHolds already sends them, in order).
        jogKbRepaint = kbPaint;
        jogKeyboardOffHook = function () {
          jogKeyboardActive = false;
          jogTeclaLimpiar();
          jogHeldDirKeys = {};
          kbPaint();
        };
        if (kbToggleBtn) {
          kbToggleBtn.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault(); // without focus: the arrows do not move this button's focus
          });
          kbToggleBtn.addEventListener("pointerup", function (ev) {
            ev.stopPropagation();
            if (!jogKeyboardActive && !jogEnabled) return; // blocked: it cannot be turned on
            jogSetKeyboardActive(!jogKeyboardActive);
          });
        }

        var KEY_VECTORS = {
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
        };

        // Reported live 2026-10-08: "I use key 9 PgUp and key 3
        // PgDn but Z does not move" -- the user accesses Page Up/Down
        // via the numeric keypad (Numpad9/Numpad3 are PgUp/PgDn when
        // NumLock is off, it is the standard mapping). The old check
        // compared ev.key === "PageUp"/"PageDown" -- but ev.key ONLY
        // equals "PageUp"/"PageDown" if NumLock is OFF; with NumLock
        // ON (this user's case, apparently) ev.key gives
        // "9"/"3" (the digit), it was never detected. Fix: use ev.code
        // (the PHYSICAL key, it does not change with NumLock nor the layout) and
        // accept BOTH forms -- the dedicated Page Up/Down key AND the
        // numeric keypad, regardless of the NumLock state.
        function jogZKeyDirection(ev) {
          if (ev.code === "PageUp" || ev.code === "Numpad9") return 1;
          if (ev.code === "PageDown" || ev.code === "Numpad3") return -1;
          return 0;
        }

        function jogRecomputeKeyboardXY() {
          var nx = 0;
          var ny = 0;
          Object.keys(jogHeldDirKeys).forEach(function (k) {
            var v = KEY_VECTORS[k];
            if (!v || jogHeldDirKeys[k] !== true) return; // "toque": todavia no es sostenido
            nx += v[0];
            ny += v[1];
          });
          var mag = Math.hypot(nx, ny);
          if (mag > 1) {
            nx /= mag;
            ny /= mag;
          }
          jogKbNX = nx;
          jogKbNY = ny;
          if (nx === 0 && ny === 0) {
            jogKeyboardXYHeld = false;
            jogSendXYStateOrStop();
          } else {
            jogKeyboardXYHeld = true;
            jogSendXY(nx, ny, true);
          }
        }

        // Tap vs hold (2026-10-10, request: "with the keyboard it only moves
        // if I hold; if I press once, wait and repeat, it does not
        // move"). The keyboard only did continuous jog: a short tap sent
        // the stop before the movement started. Now the same as the
        // +/- of the Step tab: releasing before JOG_TECLA_HOLD_MS = ONE step
        // of the distance chosen in Step; holding = continuous until release.
        var JOG_TECLA_HOLD_MS = 350;
        var jogTeclaTimers = {}; // tecla -> timer del toque pendiente
        var jogZTeclaPend = null; // ev.code de Z en espera (toque o sostener)
        var KEY_STEP = { ArrowUp: ["Y", 1], ArrowDown: ["Y", -1], ArrowLeft: ["X", -1], ArrowRight: ["X", 1] };
        function jogTeclaLimpiar() {
          Object.keys(jogTeclaTimers || {}).forEach(function (k) {
            clearTimeout(jogTeclaTimers[k]);
          });
          jogTeclaTimers = {};
          jogZTeclaPend = null;
        }

        jogWinOn("keydown", function (ev) {
          // isJogOpen(): with the panel closed (or closing) the keys
          // never move the machine, even if something left the keyboard mode ON.
          if (!jogKeyboardActive || !jogEnabled || !isJogOpen()) return;
          // Ctrl/Cmd/Alt + key are browser shortcuts (Ctrl - / Ctrl + = zoom)
          if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
          // Do not steal keys if the focus is on a real text field
          // (of this panel or of any other part of DWC).
          var tag = document.activeElement && document.activeElement.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
          if (KEY_VECTORS[ev.key]) {
            ev.preventDefault();
            if (!jogHeldDirKeys[ev.key]) {
              var k = ev.key;
              jogHeldDirKeys[k] = "touch";
              jogTeclaTimers[k] = setTimeout(function () {
                delete jogTeclaTimers[k];
                if (jogHeldDirKeys[k] !== "touch") return;
                jogHeldDirKeys[k] = true;
                jogRecomputeKeyboardXY();
                kbPaint();
              }, JOG_TECLA_HOLD_MS);
            }
            kbPaint();
          } else if (jogZKeyDirection(ev) !== 0) {
            ev.preventDefault();
            // It updates the "last seen" on EVERY keydown,
            // including the OS auto-repeat (not just the first) --
            // see jogZKeyboardWatchdog below, this is what feeds
            // it.
            jogZKeyboardLastEventAt = Date.now();
            // Held: the keyboard always sends full magnitude (-1 or 1);
            // jogSendZ saves the value in jogZHeldSign and the heartbeat
            // resends it while jogHeldZKey !== null.
            if (jogHeldZKey !== ev.code && jogZTeclaPend !== ev.code) {
              var code = ev.code;
              var dirZ = jogZKeyDirection(ev);
              jogZTeclaPend = code;
              clearTimeout(jogTeclaTimers.__z);
              jogTeclaTimers.__z = setTimeout(function () {
                delete jogTeclaTimers.__z;
                if (jogZTeclaPend !== code) return;
                jogZTeclaPend = null;
                jogHeldZKey = code;
                jogZKeyboardLastEventAt = Date.now();
                jogSendZ(dirZ, true);
                kbPaint();
              }, JOG_TECLA_HOLD_MS);
            }
            kbPaint();
          }
        });
        jogWinOn("keyup", function (ev) {
          if (KEY_VECTORS[ev.key] && jogHeldDirKeys[ev.key] === "touch") {
            clearTimeout(jogTeclaTimers[ev.key]);
            delete jogTeclaTimers[ev.key];
            delete jogHeldDirKeys[ev.key];
            if (jogKeyboardActive && jogEnabled && isJogOpen() && jogStepAxisFn) {
              jogStepAxisFn(KEY_STEP[ev.key][0], KEY_STEP[ev.key][1]);
              kbDestellar(KB_ID_ARROW[ev.key]);
            }
          } else if (KEY_VECTORS[ev.key] && jogHeldDirKeys[ev.key]) {
            delete jogHeldDirKeys[ev.key];
            if (jogKeyboardActive) jogRecomputeKeyboardXY();
          } else if (jogZKeyDirection(ev) !== 0) {
            if (jogZTeclaPend === ev.code) {
              clearTimeout(jogTeclaTimers.__z);
              delete jogTeclaTimers.__z;
              jogZTeclaPend = null;
              if (jogKeyboardActive && jogEnabled && isJogOpen() && jogStepAxisFn) {
                jogStepAxisFn("Z", jogZKeyDirection(ev));
                kbDestellar(kbIdZ(ev.code));
              }
            } else if (jogHeldZKey === ev.code) {
              jogHeldZKey = null;
              if (jogKeyboardActive) jogStopZHold();
            }
          }
          kbPaint();
        });
        // If the window loses focus with a key held (alt-tab,
        // switching apps on the phone, etc) the keyup would never arrive --
        // cut everything just in case, in the same spirit as the
        // backend's watchdog. 2026-10-11: besides, the keyboard mode is turned OFF (not just
        // the keys released): when returning to the window the arrows must not
        // move the machine unless the user activates it again. The same when
        // hiding the browser tab (visibilitychange).
        function jogTeclaSinFoco() {
          jogTeclaLimpiar();
          if (jogKeyboardActive) jogSetKeyboardActive(false);
          else if (Object.keys(jogHeldDirKeys).length || jogHeldZKey) {
            jogHeldDirKeys = {};
            jogHeldZKey = null;
            jogKeyboardXYHeld = false;
          }
          kbPaint();
        }
        jogWinOn("blur", jogTeclaSinFoco);
        function jogTeclaOculta() {
          if (document.hidden) jogTeclaSinFoco();
        }
        document.addEventListener("visibilitychange", jogTeclaOculta);
        jogPanelTeardownFns.push(function () {
          document.removeEventListener("visibilitychange", jogTeclaOculta);
        });

        // Safety net for "Z keeps moving when the key is released"
        // (reported live 2026-10-08, tested on a gaming laptop keyboard --
        // Page Up/Down on several compact keyboards
        // are behind a combination with Fn at the firmware level, and
        // some key combination may not generate a clean keyup
        // that the browser detects). Without this, a lost keyup
        // leaves jogZHeldSign held until the HARD watchdog of the backend
        // (Z_HOLD_MAX_S, 5s) -- quite a bit longer than anyone
        // would expect after releasing. This timer runs every 300ms
        // (the same rhythm as the heartbeat) and cuts if more than 600ms
        // have passed with NO event at all (not even the OS
        // auto-repeat) for the key we believe is held.
        var jogZKeyWatchdogTimer = setInterval(function () {
          if (jogHeldZKey !== null && Date.now() - jogZKeyboardLastEventAt > 600) {
            jogHeldZKey = null;
            if (jogKeyboardActive) jogStopZHold();
            kbPaint();
          }
        }, 300);
        // When hiding the jog: turn off the keyboard mode (without this the
        // "Keyboard active" state lived in this closure even though the panel no longer
        // existed) and stop Z's watchdog.
        jogPanelTeardownFns.push(function () {
          clearInterval(jogZKeyWatchdogTimer);
          jogTeclaLimpiar();
          jogKeyboardActive = false;
          jogHeldDirKeys = {};
        });

        // -- mouse wheel over the knob -- adjusts the maximum
        // speed (the same % already controlled by the slider above). It does not
        // depend on the keyboard mode being active nor on the selected tab --
        // the knob itself is always visible, it makes sense for the wheel to always work
        // when the mouse is over it, whatever tab is open.
        ring.addEventListener(
          "wheel",
          function (ev) {
            if (ev.ctrlKey || ev.metaKey) return; // Ctrl+rueda = zoom de Chrome
            ev.preventDefault();
            var delta = ev.deltaY < 0 ? 2 : -2;
            jogSpeedPercent = clamp(jogSpeedPercent + delta, 5, 100);
            speedSlider.value = String(jogSpeedPercent);
            saveSpeedPercent(jogSpeedPercent);
            jogUpdateStatusText();
          },
          { passive: false }
        );

        // -- custom buttons -- the user defines a label +
        // code (G-code or M98 P"0:/macros/..."), they are saved in
        // localStorage and sent with postCode() directly, like
        // any other fixed button of the panel.
        var JOG_CUSTOM_MACROS_KEY = "emergencyFabJogCustomMacros";

        // The buttons are kept in a file of the machine (the same on every screen and phone that opens the jog); the
        // browser copy is only the first paint.
        var JOG_CUSTOM_MACROS_FILE = "0:/sys/workshop/config/jog-macros.json";
        var jogMacrosMem = null;
        function jogMacrosLocal() {
          try {
            var raw = localStorage.getItem(JOG_CUSTOM_MACROS_KEY);
            var l = raw ? JSON.parse(raw) : [];
            return Array.isArray(l) ? l : [];
          } catch (e) {
            return [];
          }
        }
        function jogLoadCustomMacros() {
          if (!jogMacrosMem) jogMacrosMem = jogMacrosLocal();
          return jogMacrosMem.slice();
        }
        function jogSaveCustomMacros(list) {
          jogMacrosMem = list.slice();
          try {
            localStorage.setItem(JOG_CUSTOM_MACROS_KEY, JSON.stringify(list));
          } catch (e) {
            /* no critico */
          }
          tzPutText(JOG_CUSTOM_MACROS_FILE, JSON.stringify({ version: 1, buttons: list }, null, 1)).catch(function (e) {
            console.error("[WorkshopJog] could not save the macro buttons file:", e);
          });
        }
        // reads the file of the machine: it wins over the browser copy
        function jogMacrosSinceFile(alChange) {
          tzGetText(JOG_CUSTOM_MACROS_FILE)
            .then(function (t) {
              var o = JSON.parse(t);
              var l = o && Array.isArray(o.buttons) ? o.buttons : null;
              if (!l) return;
              if (JSON.stringify(l) !== JSON.stringify(jogMacrosMem || [])) {
                jogMacrosMem = l;
                try {
                  localStorage.setItem(JOG_CUSTOM_MACROS_KEY, JSON.stringify(l));
                } catch (e) {
                  /* no critico */
                }
                alChange();
              }
            })
            .catch(function () {
              /* no file yet: the browser copy stays */
            });
        }

        var macroLabel = document.createElement("div");
        macroLabel.style.cssText = "font-size:10px;color:rgba(255,255,255,0.4);width:100%;margin-top:6px;";
        macroLabel.textContent = i18nT('jog.macro_buttons_2');
        secMacros.appendChild(macroLabel);
        // what Settings mounts: new button, the list to order / delete, and the form
        var macroAdmin = document.createElement("div");
        macroAdmin.style.cssText = "display:flex;flex-direction:column;gap:6px;width:100%;";
        var macroManageList = document.createElement("div");
        macroManageList.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;";

        var macroList = document.createElement("div");
        macroList.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;width:100%;";
        secMacros.appendChild(macroList);

        var macroAddForm = document.createElement("div");
        macroAddForm.style.cssText = "display:none;flex-direction:column;gap:3px;width:100%;margin-top:3px;";

        var macroLabelInput = document.createElement("input");
        macroLabelInput.type = "text";
        macroLabelInput.placeholder = i18nT('jog.button_label');
        macroLabelInput.style.cssText =
          "width:100%;height:24px;font-size:10px;border-radius:4px;border:1px solid rgba(255,255,255,0.3);background:#1e272c;color:#fff;padding:0 4px;box-sizing:border-box;";
        macroAddForm.appendChild(macroLabelInput);

        // Where the button comes from (request 2026-10-08: "choose whether it is a
        // macro or a G-code, list, or use one that already exists"):
        //   existente -> one of the bar's buttons (sys/workshop/config/buttons.json)
        //   macro     -> choose from the list of 0:/macros (recursive)
        //   gcode     -> typed by hand
        // {label, kind: "macro"|"gcode", action} is saved.
        var macroSelCss =
          "width:100%;height:26px;font-size:10px;border-radius:4px;border:1px solid rgba(255,255,255,0.3);background:#1e272c;color:#fff;padding:0 2px;box-sizing:border-box;";
        var macroSrcSel = document.createElement("select");
        macroSrcSel.style.cssText = macroSelCss;
        [["existing", i18nT('jog.use_a_button_that_already_exists')], ["macro", i18nT('jog.macro_choose_from_the_list')], ["gcode", i18nT('jog.g_code_type_it')]].forEach(function (o) {
          var op = document.createElement("option");
          op.value = o[0];
          op.textContent = o[1];
          macroSrcSel.appendChild(op);
        });
        macroAddForm.insertBefore(macroSrcSel, macroLabelInput);

        var macroPickSel = document.createElement("select"); // existente o macro
        macroPickSel.style.cssText = macroSelCss;
        macroAddForm.insertBefore(macroPickSel, macroLabelInput);

        // Edit the chosen macro file with the editor of DWC.
        var macroEditFileBtn = jogMacroSmall(i18nT('jog.edit_macro_file'), i18nT('jog.edit_macro_file_tip'), null, function () {
          var i = parseInt(macroPickSel.value, 10);
          var rel = !isNaN(i) && jogMacroFiles && jogMacroFiles[i];
          if (!rel) return;
          workshopEditFile("0:/macros/" + rel, {
            onClose: function () { jogLoadMacroFiles().then(jogFillMacroPick); },
          });
        });
        macroEditFileBtn.style.cssText += ";width:100%;margin-top:2px;";
        macroAddForm.insertBefore(macroEditFileBtn, macroLabelInput);
        var macroCodeInput = document.createElement("input");
        macroCodeInput.type = "text";
        macroCodeInput.placeholder = "G-code";
        macroCodeInput.style.cssText = macroLabelInput.style.cssText;
        macroAddForm.appendChild(macroCodeInput);

        var jogMacroFiles = null; // rutas relativas a 0:/macros
        var jogBarButtons = null; // [{label, tipo, accion, grupo}]
        // State of the button's function (light on, air, mode...): the same
        // table as the bar (WorkshopControlBar/15-buttons.js BTN_STATES), so that
        // the copied button lights up the same when ACTIVE (2026-10-09).
        var JOG_PCC = "plugins.WorkshopService.data.";
        var JOG_STATE_BY_MACRO = {
          "light/light_on_sync.g": [JOG_PCC + "lightOn", true],
          "light/light_off_sync.g": [JOG_PCC + "lightOn", false],
          "light/statuslight_on.g": [JOG_PCC + "statusLightAuto", true],
          "light/statuslight_off.g": [JOG_PCC + "statusLightAuto", false],
          "laser/air_on_sync.g": [JOG_PCC + "airAssist", true],
          "laser/air_off_sync.g": [JOG_PCC + "airAssist", false],
          "psu/start.g": ["state.atxPower", true],
          "psu/stop.g": ["state.atxPower", false],
          "mode/selectlaser.g": ["state.machineMode", "Laser"],
          "mode/selectcnc.g": ["state.machineMode", "CNC"],
          "mode/selectfff.g": ["state.machineMode", "FFF"],
        };
        // undefined on the button = the known state of its macro; null = no state
        function jogStateOf(b) {
          if (b && b.state === undefined) {
            var e = JOG_STATE_BY_MACRO[String(b.action || "")];
            return e ? { path: e[0], value: e[1] } : null;
          }
          return b && b.state && typeof b.state.path === "string" ? { path: b.state.path, value: b.state.value } : null;
        }
        function jogStateActive(state, status) {
          if (!state || !status) return null;
          var v = workshopReadPath(status, state.path); // Id del servicio nuevo o viejo
          if (v === undefined || v === null) return null;
          return String(v) === String(state.value);
        }
        var jogMacroEls = []; // [{el, estado, color}] of the last list drawn
        function jogMacroPaintActive(status) {
          jogMacroEls.forEach(function (m) {
            var on = jogStateActive(m.state, status) === true;
            if (m.el._armed || m.el._notice) return;
            m.el.style.border = on ? "2px solid #fff" : "1px solid rgba(255,255,255,0.35)";
            m.el.style.boxShadow = on ? "0 0 10px " + m.color : "none";
            m.act.style.display = on ? "" : "none";
            m.dot.style.display = on ? "" : "none";
          });
        }
        jogMacroPaintHook = jogMacroPaintActive;
        function jogLoadMacroFiles() {
          var out = [];
          function walk(dir) {
            return fetch("/machine/directory/" + encodeURI("0:/macros/" + dir), { cache: "no-store" })
              .then(function (r) {
                return r.ok ? r.json() : [];
              })
              .then(function (items) {
                return Promise.all(
                  items.map(function (it) {
                    if (it.type === "d") return walk(dir + it.name + "/");
                    if (/\.g$/i.test(it.name)) out.push(dir + it.name);
                    return null;
                  })
                );
              })
              .catch(function () {});
          }
          return walk("").then(function () {
            jogMacroFiles = out.sort();
          });
        }
        function jogLoadBarButtons() {
          return fetch("/machine/file/0:/sys/workshop/config/buttons.json?_=" + Date.now(), { cache: "no-store" })
            .then(function (r) {
              return r.ok ? r.json() : null;
            })
            .then(function (d) {
              var out = [];
              var groups = d && Array.isArray(d.groups) ? d.groups : Array.isArray(d) ? [{ title: "", buttons: d }] : [];
              groups.forEach(function (g) {
                (g.buttons || []).forEach(function (b) {
                  if (b && b.action)
                    out.push({
                      label: b.label,
                      kind: b.kind === "gcode" ? "gcode" : "macro",
                      action: b.action,
                      group: g.title || "",
                      color: /^#[0-9a-fA-F]{6}$/.test(b.color || "") ? b.color : null,
                      confirm: !!b.confirm,
                      modes: Array.isArray(b.modes) ? b.modes : [],
                      inJob: b.inJob !== false,
                      state: jogStateOf(b),
                    });
                });
              });
              jogBarButtons = out;
            })
            .catch(function () {
              jogBarButtons = [];
            });
        }
        function jogFillMacroPick() {
          var src = macroSrcSel.value;
          macroPickSel.innerHTML = "";
          macroPickSel.style.display = src === "gcode" ? "none" : "";
          macroEditFileBtn.style.display = src === "macro" ? "" : "none";
          macroCodeInput.style.display = src === "gcode" ? "" : "none";
          if (src === "gcode") return;
          var list = src === "existing" ? jogBarButtons : jogMacroFiles;
          var op0 = document.createElement("option");
          op0.value = "";
          op0.textContent = list === null ? i18nT('jog.loading') : list.length ? (src === "existing" ? i18nT('jog.choose_button') : i18nT('jog.choose_macro')) : i18nT('jog.none');
          macroPickSel.appendChild(op0);
          (list || []).forEach(function (it, i) {
            var op = document.createElement("option");
            op.value = String(i);
            op.textContent = src === "existing" ? it.label + (it.group ? "  (" + it.group + ")" : "") : it;
            macroPickSel.appendChild(op);
          });
        }
        macroSrcSel.addEventListener("change", jogFillMacroPick);
        macroPickSel.addEventListener("change", function () {
          var i = parseInt(macroPickSel.value, 10);
          if (isNaN(i)) return;
          if (macroSrcSel.value === "existing" && jogBarButtons[i]) macroLabelInput.value = jogBarButtons[i].label;
          else if (macroSrcSel.value === "macro" && jogMacroFiles[i] && !macroLabelInput.value.trim())
            macroLabelInput.value = jogMacroFiles[i].split("/").pop().replace(/\.g$/i, "");
        });
        [macroSrcSel, macroPickSel].forEach(function (el) {
          el.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
          });
        });

        // Code to send for a saved button.
        function jogMacroCode(m) {
          if (m.kind === "macro") return 'M98 P"0:/macros/' + String(m.action).replace(/^\/+/, "") + '"';
          return m.action;
        }

        // State of the button (optional): it lights up while this value of the object model matches, and the button can
        // run another macro or G-code to turn the function off when it is lit.
        var macroStateBox = document.createElement("div");
        macroStateBox.style.cssText = "display:none;flex-direction:column;gap:3px;width:100%;";
        var macroStateTitle = document.createElement("div");
        macroStateTitle.textContent = i18nT('jog.state_title');
        macroStateTitle.title = i18nT('jog.state_tip');
        macroStateTitle.style.cssText = "font-size:10px;color:#b0bec5;line-height:1.3;";
        var macroStatePath = document.createElement("input");
        macroStatePath.type = "text";
        macroStatePath.placeholder = i18nT('jog.state_path_ph');
        macroStatePath.style.cssText = macroLabelInput.style.cssText;
        var macroStateValue = document.createElement("input");
        macroStateValue.type = "text";
        macroStateValue.placeholder = i18nT('jog.state_value_ph');
        macroStateValue.style.cssText = macroLabelInput.style.cssText;
        var macroStateNow = document.createElement("div");
        macroStateNow.style.cssText = "font-size:10px;color:#80cbc4;line-height:1.3;min-height:12px;";
        var macroStatePowerOff = document.createElement("input");
        macroStatePowerOff.type = "text";
        macroStatePowerOff.placeholder = i18nT('jog.state_off_ph');
        macroStatePowerOff.style.cssText = macroLabelInput.style.cssText;
        function jogStateNowText() {
          var path = macroStatePath.value.trim();
          if (!path) return "";
          var v = jogStatusCache.status ? workshopReadPath(jogStatusCache.status, path) : undefined;
          if (v === undefined || v === null) return i18nT('jog.state_now_unknown');
          var quiere = macroStateValue.value.trim();
          var same = String(v) === quiere;
          return i18nT('jog.state_now', { v: String(v) }) + (quiere ? " - " + (same ? i18nT('jog.state_lit') : i18nT('jog.state_not_lit')) : "");
        }
        function jogStateNowPaint() {
          if (macroStateBox.style.display !== "none") macroStateNow.textContent = jogStateNowText();
        }
        [macroStatePath, macroStateValue].forEach(function (inp) {
          inp.addEventListener("input", jogStateNowPaint);
        });
        setInterval(function () {
          if (macroStateBox.isConnected) jogStateNowPaint();
        }, 1500);
        [macroStateTitle, macroStatePath, macroStateValue, macroStateNow, macroStatePowerOff].forEach(function (el) {
          macroStateBox.appendChild(el);
        });
        macroAddForm.appendChild(macroStateBox);
        function jogStateBoxVer() {
          var v = macroSrcSel.value;
          macroStateBox.style.display = v === "macro" || v === "gcode" ? "flex" : "none";
          jogStateNowPaint();
        }
        macroSrcSel.addEventListener("change", jogStateBoxVer);

        [macroLabelInput, macroCodeInput, macroStatePath, macroStateValue, macroStatePowerOff].forEach(function (inp) {
          inp.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
          });
        });

        var macroAddActionsRow = document.createElement("div");
        macroAddActionsRow.style.cssText = "display:flex;gap:4px;width:100%;";
        macroAddForm.appendChild(macroAddActionsRow);

        var macroSaveBtn = jogMakeSmallButton(i18nT('jog.save'), i18nT('jog.save_macro_button'));
        macroSaveBtn.style.flex = "1 1 0";
        var macroCancelBtn = jogMakeSmallButton(i18nT('jog.cancel'), i18nT('jog.cancel'));
        macroCancelBtn.style.flex = "1 1 0";
        macroAddActionsRow.appendChild(macroSaveBtn);
        macroAddActionsRow.appendChild(macroCancelBtn);

        // 2026-10-15: the jog only shows and presses the buttons. Creating, ordering and deleting (double tap) is done in
        // Settings > Macro buttons (macroAdmin, mounted there).
        var macroDelArmed = -1;
        var macroDelTimer = null;
        var macroBtnRow = document.createElement("div");
        macroBtnRow.style.cssText = "display:flex;gap:4px;width:100%;margin-top:4px;";
        var macroAddBtn = jogMakeSmallButton(i18nT('jog.new_button'), i18nT('jog.add_a_new_macro_button'));
        macroAddBtn.style.cssText += ";flex:1 1 0;";
        macroBtnRow.appendChild(macroAddBtn);
        macroAdmin.appendChild(macroBtnRow);
        macroAdmin.appendChild(macroManageList);
        macroAdmin.appendChild(macroAddForm);
        jogMacroAdmin = {
          mount: function (parentThe) {
            parentThe.appendChild(macroAdmin);
            jogRenderCustomMacros();
          },
        };

        function jogMacroSmall(label, title, bg, onUp) {
          var b = jogMakeSmallButton(label, title);
          b.style.cssText += ";flex:0 0 auto;min-width:24px;height:26px;padding:0 5px;" + (bg ? "background:" + bg + ";" : "");
          b.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
          });
          b.addEventListener("pointerup", function (ev) {
            ev.stopPropagation();
            onUp();
          });
          return b;
        }

        function jogRenderCustomMacros() {
          macroList.innerHTML = "";
          macroManageList.innerHTML = "";
          jogMacroEls = [];
          var list = jogLoadCustomMacros();
          list.forEach(function (macro, idx) {
            var wrap = document.createElement("div");
            wrap.style.cssText = "display:flex;align-items:center;gap:3px;width:100%;";
            macroManageList.appendChild(wrap);
            {
              var name = document.createElement("span");
              name.textContent = macro.label;
              name.title = macro.kind === "macro" ? i18nT('jog.macro', { action: macro.action }) : "G-code: " + macro.action;
              name.style.cssText = "flex:1 1 auto;min-width:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
              wrap.appendChild(name);
              wrap.appendChild(
                jogMacroSmall("<", i18nT('jog.move_earlier'), null, function () {
                  if (idx === 0) return;
                  var l = jogLoadCustomMacros();
                  l.splice(idx - 1, 0, l.splice(idx, 1)[0]);
                  jogSaveCustomMacros(l);
                  jogRenderCustomMacros();
                })
              );
              wrap.appendChild(
                jogMacroSmall(">", i18nT('jog.move_later'), null, function () {
                  var l = jogLoadCustomMacros();
                  if (idx >= l.length - 1) return;
                  l.splice(idx + 1, 0, l.splice(idx, 1)[0]);
                  jogSaveCustomMacros(l);
                  jogRenderCustomMacros();
                })
              );
              var armed = macroDelArmed === idx;
              wrap.appendChild(
                jogMacroSmall(armed ? i18nT('jog.sure') : i18nT('jog.delete'), i18nT('jog.delete_double_tap', { label: macro.label }), armed ? "#b71c1c" : "#5a1a1a", function () {
                  if (macroDelArmed !== idx) {
                    macroDelArmed = idx;
                    clearTimeout(macroDelTimer);
                    macroDelTimer = setTimeout(function () {
                      macroDelArmed = -1;
                      jogRenderCustomMacros();
                    }, 3000);
                    jogRenderCustomMacros();
                    return;
                  }
                  macroDelArmed = -1;
                  var l = jogLoadCustomMacros();
                  l.splice(idx, 1);
                  jogSaveCustomMacros(l);
                  jogRenderCustomMacros();
                })
              );
            }
            wrap = document.createElement("div");
            wrap.style.cssText = "display:flex;align-items:center;gap:2px;";
            macroList.appendChild(wrap);
            // the bar owns the macro buttons: a copy of one of its buttons is not drawn a second time (it stays in the list of Settings)
            if (jogMacroIsBarDuplicate(macro, jogBarButtons, workshopPluginLoaded("bar"))) wrap.style.display = "none";

            // The same look as in the sidebar (request 2026-10-09: "the
            // macro buttons are not copied the same, nor do they have a button shape").
            // Those copied before saving the color take it from the original button.
            var orig = jogBarButtons
              ? jogBarButtons.filter(function (b) { return b.kind === macro.kind && b.action === macro.action; })[0]
              : null;
            var color = macro.color || (orig && orig.color) || "#455a64";
            var confirmar = macro.confirm != null ? !!macro.confirm : !!(orig && orig.confirm);
            // Copied from the bar: the same rules as there (modes / job in
            // progress), NOT the jog's lock -- "Light ON" has to work
            // with the machine off (2026-10-09). Loose G-code or macro ones, which
            // could move the machine, still require the jog enabled.
            var ofBar = !!(macro.ofBar || orig);
            var modos = macro.modes || (orig && orig.modes) || [];
            var inJob = macro.inJob != null ? !!macro.inJob : !(orig && orig.inJob === false);
            function block() {
              if (!ofBar) return jogEnabled ? "" : i18nT('jog.jog_locked');
              if (modos.length && jogMachineMode && modos.indexOf(jogMachineMode) < 0) return i18nT('jog.only_in_mode', { modes: modos.join(" / ") });
              var est = jogStatusCache.status && jogStatusCache.status.state && jogStatusCache.status.state.status;
              if (!inJob && ["processing", "pausing", "paused", "resuming", "simulating"].indexOf(est) >= 0) return i18nT('jog.not_while_a_job_is_running');
              return "";
            }
            function notify(t) {
              clearTimeout(armTimer);
              runBtn._armed = false;
              runBtn._notice = true;
              lblEl.textContent = t;
              runBtn.style.background = "#5d4037";
              armTimer = setTimeout(function () {
                runBtn._notice = false;
                lblEl.textContent = macro.label;
                runBtn.style.background = color;
                jogMacroPaintActive(jogStatusCache.status);
              }, 2000);
            }
            wrap.style.cssText = "display:flex;flex:1 1 calc(50% - 4px);min-width:0;";
            var runBtn = jogMakeSmallButton(macro.label, (macro.kind === "macro" ? i18nT('jog.macro', { action: macro.action }) : "G-code: " + macro.action));
            runBtn.style.cssText += ";flex:1 1 auto;height:auto;min-height:34px;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.35);" +
              "background:" + color + ";font-size:12px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            runBtn.textContent = "";
            runBtn.style.position = "relative";
            runBtn.style.display = "flex";
            runBtn.style.flexDirection = "column";
            runBtn.style.alignItems = "center";
            runBtn.style.justifyContent = "center";
            var lblEl = document.createElement("span");
            lblEl.textContent = macro.label;
            lblEl.style.cssText = "max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            runBtn.appendChild(lblEl);
            var actThe = document.createElement("span");
            actThe.textContent = i18nT('jog.active');
            actThe.style.cssText = "display:none;font-size:10px;font-weight:bold;letter-spacing:0.08em;";
            runBtn.appendChild(actThe);
            var dotThe = document.createElement("span");
            dotThe.style.cssText = "display:none;position:absolute;top:3px;right:4px;width:8px;height:8px;border-radius:50%;background:#69f0ae;box-shadow:0 0 4px #69f0ae;";
            runBtn.appendChild(dotThe);
            var estado = macro.state !== undefined ? macro.state : orig ? orig.state : jogStateOf(macro);
            jogMacroEls.push({ el: runBtn, act: actThe, dot: dotThe, state: estado, color: color });
            wrap.appendChild(runBtn);
            var armTimer = null;
            runBtn.addEventListener("pointerdown", function (ev) {
              ev.stopPropagation();
              ev.preventDefault();
            });
            runBtn.addEventListener("pointerup", function (ev) {
              ev.stopPropagation();
              var reason = block();
              if (reason) return notify(reason);
              if (confirmar && !runBtn._armed) {
                runBtn._armed = true;
                lblEl.textContent = i18nT('jog.confirm');
                runBtn.style.background = "#b71c1c";
                clearTimeout(armTimer);
                armTimer = setTimeout(function () {
                  runBtn._armed = false;
                  lblEl.textContent = macro.label;
                  runBtn.style.background = color;
                }, 3000);
                return;
              }
              clearTimeout(armTimer);
              runBtn._armed = false;
              lblEl.textContent = macro.label;
              runBtn.style.background = color;
              // lit and with an "off" action: pressing it turns the function off (a macro of the SD or a G-code)
              var code = jogMacroCode(macro);
              if (macro.poweroff && jogStateActive(estado, jogStatusCache.status) === true) {
                var ap = String(macro.poweroff);
                code = /\.g$/i.test(ap) ? 'M98 P"0:/macros/' + ap.replace(/^\/+/, "") + '"' : ap;
              }
              postCode(code).catch(function (e) {
                console.error("[WorkshopJog] error in macro '" + macro.label + "':", e);
              });
            });
          });
          jogMacroPaintActive(jogStatusCache.status);
          if (!list.length) {
            var empty = document.createElement("div");
            empty.textContent = i18nT('jog.no_buttons_yet_new_button');
            empty.style.cssText = "font-size:10px;color:rgba(255,255,255,0.4);";
            macroList.appendChild(empty);
          }
        }
        jogRenderCustomMacros();
        if (jogLoadCustomMacros().length) jogLoadBarButtons().then(jogRenderCustomMacros);
        jogMacrosSinceFile(function () {
          jogRenderCustomMacros();
          jogLoadBarButtons().then(jogRenderCustomMacros);
        });

        macroAddBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        macroAddBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          var opening = macroAddForm.style.display === "none";
          macroAddForm.style.display = opening ? "flex" : "none";
          if (opening) {
            jogFillMacroPick();
            Promise.all([jogLoadMacroFiles(), jogLoadBarButtons()]).then(jogFillMacroPick);
          }
        });
        macroSaveBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        macroSaveBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          var label = macroLabelInput.value.trim();
          var src = macroSrcSel.value;
          var item = null;
          var i = parseInt(macroPickSel.value, 10);
          if (src === "gcode") {
            var code = macroCodeInput.value.trim();
            if (code) item = { kind: "gcode", action: code };
          } else if (src === "macro" && jogMacroFiles && jogMacroFiles[i]) {
            item = { kind: "macro", action: jogMacroFiles[i] };
          } else if (src === "existing" && jogBarButtons && jogBarButtons[i]) {
            var bb = jogBarButtons[i];
            item = { kind: bb.kind, action: bb.action, color: bb.color, confirm: bb.confirm, modes: bb.modes, inJob: bb.inJob, state: bb.state, ofBar: true };
          }
          if (!item) {
            macroLabelInput.placeholder = src === "gcode" ? i18nT('jog.g_code_missing') : i18nT('jog.choose_from_the_list');
            return;
          }
          item.label = label || (src === "existing" ? jogBarButtons[i].label : src === "macro" ? item.action.split("/").pop() : item.action.slice(0, 12));
          if (src !== "existing") {
            var ePath = macroStatePath.value.trim();
            if (ePath) item.state = { path: ePath, value: macroStateValue.value.trim() };
            var ePowerOff = macroStatePowerOff.value.trim();
            if (ePowerOff && item.state) item.poweroff = ePowerOff;
          }
          var list = jogLoadCustomMacros();
          list.push(item);
          jogSaveCustomMacros(list);
          macroLabelInput.value = "";
          macroCodeInput.value = "";
          macroStatePath.value = "";
          macroStateValue.value = "";
          macroStatePowerOff.value = "";
          macroAddForm.style.display = "none";
          jogRenderCustomMacros();
        });
        macroCancelBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        macroCancelBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          macroLabelInput.value = "";
          macroCodeInput.value = "";
          macroAddForm.style.display = "none";
        });

        // -- Jog by steps: choose axis + distance (slider with typical
        // CNC pendant values), +/- moves exactly that distance only
        // once (G91/G1/G90 -- a bounded movement, not continuous, it
        // does not need a watchdog nor to go through the jog's backend). It reuses the
        // SAME maximum speed as the slider above (jogMaxFeedXY/Z)
        // instead of adding a third separate speed control.
        var JOG_STEP_VALUES = jogAjSteps(); // de fabrica 0.01 .. 100, editable en Ajustes
        var jogStepAxis = "X";
        var jogStepIndex = jogAjStepIndex(JOG_STEP_VALUES); // 1 mm de fabrica

        var stepAxisRow = document.createElement("div");
        stepAxisRow.style.cssText = "display:flex;gap:4px;width:100%;";
        stepSection.appendChild(stepAxisRow);

        stepAxisRow.style.flexWrap = "wrap";
        var jogStepAxisBtns = {};

        function jogUpdateStepAxisVisual() {
          Object.keys(jogStepAxisBtns).forEach(function (ax) {
            jogStepAxisBtns[ax].style.background = ax === jogStepAxis ? "#1976d2" : "#424242";
          });
        }

        // X, Y, Z and the machine's extra axes (except those hidden in Settings)
        function jogStepAxesRender() {
          var ocultos = jogAjGet().axesHidden;
          var axes = jogBaseAxes.concat(
            jogAxesExtra.filter(function (L) {
              return ocultos.indexOf(L) < 0;
            })
          );
          if (!axes.length) axes = ["X", "Y", "Z"]; // a model with no axes yet: do not leave the tab empty
          if (axes.indexOf(jogStepAxis) < 0) jogStepAxis = axes[0];
          stepAxisRow.textContent = "";
          jogStepAxisBtns = {};
          axes.forEach(function (ax) {
            var btn = jogMakeSmallButton(ax, i18nT('jog.axis', { ax: ax }));
            btn.style.flex = "1 1 0";
            btn.style.minWidth = "28px";
            btn.addEventListener("pointerdown", function (ev) {
              ev.stopPropagation();
              ev.preventDefault(); // ver nota en viewBtn pointerdown (EmergencyFab camara)
            });
            btn.addEventListener("pointerup", function (ev) {
              ev.stopPropagation();
              jogStepAxis = ax;
              jogUpdateStepAxisVisual();
            });
            jogStepAxisBtns[ax] = btn;
            stepAxisRow.appendChild(btn);
          });
          jogUpdateStepAxisVisual();
        }
        jogStepAxesRender();
        jogAxesExtraHook = jogStepAxesRender;

        var stepDistRow = document.createElement("div");
        stepDistRow.style.cssText = "display:flex;align-items:center;gap:6px;width:100%;";
        stepSection.appendChild(stepDistRow);

        var stepDistLabel = document.createElement("span");
        stepDistLabel.style.cssText = "font-size:10px;color:#b0bec5;flex:0 0 auto;min-width:40px;text-align:right;";
        stepDistRow.appendChild(stepDistLabel);

        var stepDistSlider = document.createElement("input");
        stepDistSlider.type = "range";
        stepDistSlider.min = "0";
        stepDistSlider.max = String(JOG_STEP_VALUES.length - 1);
        stepDistSlider.step = "1";
        stepDistSlider.value = String(jogStepIndex);
        stepDistSlider.title = i18nT('jog.step_distance');
        stepDistSlider.style.cssText = "flex:1 1 auto;width:0;height:20px;touch-action:pan-x;cursor:pointer;";
        stepDistRow.appendChild(stepDistSlider);

        function jogUpdateStepDistLabel() {
          stepDistLabel.textContent = JOG_STEP_VALUES[jogStepIndex] + " mm";
        }
        jogUpdateStepDistLabel();

        stepDistSlider.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
        });
        stepDistSlider.addEventListener("input", function () {
          jogStepIndex = parseInt(stepDistSlider.value, 10);
          jogUpdateStepDistLabel();
        });

        var stepMoveRow = document.createElement("div");
        stepMoveRow.style.cssText = "display:flex;gap:4px;width:100%;";
        stepSection.appendChild(stepMoveRow);

        var JOG_STEP_HOLD_MS = 350;
        var stepMinusBtn = jogMakeSmallButton("-", i18nT('jog.tap_move_distance_hold_move_continuously'));
        var stepPlusBtn = jogMakeSmallButton("+", i18nT('jog.tap_move_distance_hold_move_continuously_2'));
        stepMoveRow.appendChild(stepMinusBtn);
        stepMoveRow.appendChild(stepPlusBtn);
        jogStepMinusBtn = stepMinusBtn;
        jogStepPlusBtn = stepPlusBtn;

        function jogStepMove(sign) {
          jogPasoEje(jogStepAxis, sign);
        }
        // Also used by the keyboard (short tap of an arrow / Page Up / Page Down).
        function jogPasoEje(axis, sign) {
          // The same "idle or busy" gate as the continuous jog -- see
          // jogCheckEnabled/jogSetControlsEnabled.
          if (!jogEnabled) return;
          jogNotifyWithoutHoming([axis]);
          var dist = sign * JOG_STEP_VALUES[jogStepIndex];
          var feed = axis === "Z" ? jogMaxFeedZ() : jogMaxFeedXY();
          // extra axis: the jog's % over ITS RRF maximum (M203), without exceeding X/Y's
          if (jogIsAxisExtra(axis)) feed = Math.min(jogMaxFeedXY(), (jogAxisSpeed[axis] || jogMaxFeedZ()) * jogSpeedPercent / 100);
          // 2026-10-10 ("I press 3 times in a row and sometimes one or
          // two move"): each step was 3 loose requests (G91 / G1 / G90) and with quick
          // taps they got mixed up: one tap's G1 could arrive after
          // another's G90 and RRF took it as an ABSOLUTE position (rejected or
          // to elsewhere). Now each step is ONE block and they go in line.
          var block = jogBlockStep(jogMachineMode, [axis + dist.toFixed(3)], feed); // S0 only in Laser mode (09-mode.js)
          jogStepQueue = jogStepQueue
            .then(function () {
              return postCode(block);
            })
            .catch(function (e) {
              console.error("[WorkshopJog] error in step:", e);
            });
        }
        var jogStepQueue = Promise.resolve(); // pasos en fila, uno detras del otro
        jogStepAxisFn = jogPasoEje;
        [
          [stepMinusBtn, -1],
          [stepPlusBtn, 1],
        ].forEach(function (pair) {
          var btn = pair[0];
          var sign = pair[1];
          // Short tap (< JOG_STEP_HOLD_MS) = ONE step of the distance
          // chosen, as always. Held = continuous movement on that
          // axis at the speed of the MIN-MAX slider, until released (or
          // until the axis limit). The release is listened for on `window`
          // (the same reason as the knob: the finger can leave the button).
          var holdTimer = null;
          var holding = false;
          var pid = null;
          function endPress(ev, cancelled) {
            if (pid === null || (ev && ev.pointerId !== pid)) return;
            pid = null;
            window.removeEventListener("pointerup", onUp, true);
            window.removeEventListener("pointercancel", onCancel, true);
            window.removeEventListener("blur", onBlur);
            if (holdTimer) {
              clearTimeout(holdTimer);
              holdTimer = null;
              if (!cancelled) jogStepMove(sign); // fue un toque
              return;
            }
            if (holding) {
              holding = false;
              var axis = jogStepHold && jogStepHold.axis;
              jogStepHold = null;
              btn.style.background = "#455a64";
              if (jogIsAxisExtra(axis)) postJogCommand("jog.stop_axis", { release: true });
              else if (axis === "Z") jogSendStopZ();
              else jogSendXYStateOrStop();
            }
          }
          function onUp(ev) {
            endPress(ev, false);
          }
          function onCancel(ev) {
            endPress(ev, true);
          }
          function onBlur() {
            endPress(null, true); // the screen lost focus: release
          }
          btn.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault(); // ver nota en viewBtn pointerdown (EmergencyFab camara)
            if (btn.disabled || !jogEnabled || pid !== null || jogStepHold) return;
            pid = ev.pointerId;
            // IN CAPTURE (true): the button's own pointerup does
            // stopPropagation, and on touch the event goes to the button (implicit
            // pointer capture) -- in the bubble phase it never reached window,
            // endPress did not run, the button stayed orange and the heartbeat kept
            // sending the movement up to the limit (bug 2026-10-08).
            window.addEventListener("pointerup", onUp, true);
            window.addEventListener("pointercancel", onCancel, true);
            window.addEventListener("blur", onBlur);
            holdTimer = setTimeout(function () {
              holdTimer = null;
              if (pid === null || !jogEnabled) return;
              holding = true;
              jogStepHold = { axis: jogStepAxis, sign: sign };
              btn.style.background = "#e65100";
              jogSendStepHold();
            }, JOG_STEP_HOLD_MS);
          });
          // Besides, the button itself ends the gesture (belt and braces: if
          // for whatever reason window's does not run, this one does).
          btn.addEventListener("pointerup", function (ev) {
            ev.stopPropagation();
            endPress(ev, false);
          });
          btn.addEventListener("pointercancel", function (ev) {
            endPress(ev, true);
          });
          btn.addEventListener("lostpointercapture", function (ev) {
            endPress(ev, true);
          });
          jogPanelTeardownFns.push(function () {
            window.removeEventListener("pointerup", onUp, true);
            window.removeEventListener("pointercancel", onCancel, true);
            window.removeEventListener("blur", onBlur);
            if (holdTimer) clearTimeout(holdTimer);
            if (holding) {
              holding = false;
              jogStepHold = null;
            }
          });
        });

        // Suppresses the native context menu on the WHOLE panel (knob,
        // Z buttons, header, sensitivity -- the event bubbles, a single
        // listener here is enough). Without this, holding the finger on the
        // knob/a Z button to move it triggers the browser's options menu,
        // which cancels the pointer gesture in progress (seen
        // live, 2026-10-07: "it releases and goes back to the center").
        var savedTab = null;
        try {
          savedTab = localStorage.getItem(JOG_TAB_KEY);
        } catch (e) {
          /* default "home" */
        }
        var firstTab = jogAjFirstTab(jogTabSections[savedTab] ? savedTab : "step");
        if (firstTab) jogSelectTab(firstTab);
        else tabContent.style.display = "none"; // all tabs hidden (Settings)

        panel.addEventListener("contextmenu", function (ev) {
          ev.preventDefault();
        });

        // Jog option 2 (12-jog2.js, Settings > Appearance): it is mounted at the top and
        // everything of this option 1 stays as is inside its "More".
        // Chosen controls (Settings > What is shown > Controls, valid for both
        // options): knob / X and Y sliders / arrows and slider / Z buttons.
        // Without arrows, the Z buttons go in the same row as the knob or the
        // sliders, centered and of the same height (2026-10-10: "if they are sliders
        // they must be centered; slider and buttons for Z, center and arrange at the
        // proper size").
        function jogZBotonesEnFila(mv) {
          if (!mv || !mv.colZ) return false;
          mv.colZ.style.display = "grid";
          mv.colZ.style.gridTemplateRows = "repeat(2,minmax(0,1fr))";
          mv.colZ.style.width = "64px";
          mv.colZ.style.height = RING_SIZE + "px";
          mv.colZ.style.flex = "0 0 auto";
          row.appendChild(mv.colZ);
          row.style.display = "flex";
          return true;
        }
        function jogAplicarControles(ctrl) {
          var xy = ctrl.knob || ctrl.sliders;
          axisModeRow.style.display = ctrl.knob && ctrl.sliders ? "flex" : "none";
          if (ctrl.knob && !ctrl.sliders) jogApplyAxisMode("free");
          else if (!ctrl.knob && ctrl.sliders) jogApplyAxisMode("straight");
          if (!xy) {
            ring.style.display = "none";
            jogXTrackEl.style.display = "none";
            jogYTrackEl.style.display = "none";
          }
          zTrack.style.display = ctrl.zSlide ? "" : "none";
          row.style.display = xy || ctrl.zSlide ? "flex" : "none";
          row.style.justifyContent = "center"; // deslizantes / perilla / Z siempre centrados
          row.style.width = "100%";
        }
        if (jogAjGet().style === 2 && typeof jog2Assemble === "function") {
          jog2Assemble({
            axisModeRow: axisModeRow,
            knobRow: row,
            applyControls: jogAplicarControles,
            zButtonsInRow: jogZBotonesEnFila,
            body: body,
            statusEl: statusThe,
            noticeEl: jogNoticeEl,
            stopRow: stopRow,
            posT: jogPosT,
            speedSlider: speedSlider,
            stepSlider: stepDistSlider,
            steps: JOG_STEP_VALUES,
            getStepIndex: function () { return jogStepIndex; },
            keyboard: kbCard, // tecladito dibujado (null si no va), 2026-10-11
            // design 2 has its own Paso, Velocidad and Home / Home Z in the main view and the fixed bar:
            // "Mas" keeps only what is not there
            // true when "More" would show something (14-advanced.js)
            moreHasSomething: function () { return jogMoreHasSomething(jogTabBtns.advanced, tabBar, macrosHost); },
            removeRepeated: function () {
              speedRow.style.display = "none";
              axisMaxThe.style.display = "none"; // the Advanced > Limits and speeds section shows the same data
              if (jogTabBtns.step) jogTabBtns.step.style.display = "none";
              if (jogTabSections.step) jogTabSections.step.style.display = "none";
              // the Step tab is not here: if Advanced is shown, it is the tab in use
              if (jogActiveTabId === "step" && jogTabBtns.advanced && jogTabBtns.advanced.style.display !== "none") jogSelectTab("advanced");
            },
          });
        } else if (typeof jog2Move === "function") {
          var ctrl1 = jogControls(1);
          jogAplicarControles(ctrl1);
          var mv1 = jog2Move({ stopRow: stopRow, steps: JOG_STEP_VALUES, getStepIndex: function () { return jogStepIndex; } }, jog2Helpers(), ctrl1);
          if (mv1 && !ctrl1.arrows) jogZBotonesEnFila(mv1); // Z only: next to the knob
          else if (mv1) {
            mv1.move.style.width = "100%";
            row.parentNode.insertBefore(mv1.move, row.nextSibling); // debajo de la perilla
          }
          // little keyboard (Settings > Controls to move > X / Y > Keyboard,
          // 2026-10-11): instead of knob / sliders (hidden), before
          // the tabs
          if (kbCard) {
            var kbAncla = mv1 && ctrl1.arrows ? mv1.move : row;
            kbAncla.parentNode.insertBefore(kbCard, kbAncla.nextSibling);
          }
        }
        kbPaint();
        // by role (08-role.js): a role that cannot move the machine keeps the position, the maximum speeds and STOP
        jogRoleApplyBuild(jogRoleNow(), { body: body, keep: [jogPosT.mini, jogPosT.card, axisMaxThe], quick: jogQuick });

        document.body.appendChild(panel);
        jogPanelEl = panel;
        // phantom touch (see jogSwallowClickGhost): in capture, before
        // the buttons' stopPropagation
        panel.addEventListener("pointerup", jogNoteTouch, true);
        window.addEventListener("pointerdown", jogForgetTouch, true);
        window.addEventListener("click", jogSwallowClickGhost, true);
        jogPanelTeardownFns.push(function () {
          window.removeEventListener("pointerdown", jogForgetTouch, true);
          window.removeEventListener("click", jogSwallowClickGhost, true);
          jogTouch = null;
        });

        makeDraggableByHandle(
          panel,
          header,
          "emergencyFabJogPanelPos",
          JOG_PANEL_W,
          JOG_PANEL_H_ESTIMATE,
          16,
          window.innerHeight - JOG_PANEL_H_ESTIMATE - 16
        );

        // See jogReclampPanel -- it reacts to any change in the
        // panel's height, from wherever it comes, without having to remember to call it
        // in every button that adds/opens content.
        if (typeof ResizeObserver !== "undefined") {
          var jogPanelRO = new ResizeObserver(function () {
            jogReclampPanel();
          });
          jogPanelRO.observe(panel);
          jogPanelTeardownFns.push(function () {
            jogPanelRO.disconnect();
          });
        }
        jogWinOn("resize", jogReclampPanel);

        jogSetControlsEnabled(jogEnabled);
        jogSetHomeEnabled(jogMachineFree());
        jogUpdateStatusText();

        var savedAxisMode = null;
        try {
          savedAxisMode = localStorage.getItem(JOG_AXIS_MODE_KEY);
        } catch (e) {
          /* default "free" */
        }
        jogApplyAxisMode(savedAxisMode === "straight" ? "straight" : "free");
        // the saved axis mode (knob / tracks) must not bring back a control that Settings turned off
        // (arrows or keyboard for X/Y showed the knob or the two tracks again, plus the Z track)
        jogAplicarControles(jogControls(jogAjGet().style === 2 ? 2 : 1));

        if (jogFsBtn) {
          var wantsFs = false;
          try {
            wantsFs = localStorage.getItem(JOG_FS_KEY) === "1";
          } catch (e) {
            /* default false */
          }
          if (wantsFs) jogApplyFullscreen(true);
        }
      }

      function createJogWidgets() {
        if (pluginStopped) return;
        createJogPanel();
        if (isJogExpanded()) {
          jogExpand();
        } else {
          jogCollapse(true);
        }
      }
