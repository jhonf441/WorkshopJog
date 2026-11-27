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
      // thread shared with a video stream added the same day,
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
      var jogZHereAct = null; // "Z here" (G30 at the X and Y where the head is), set when the panel is built
      var jogZHereBtn = null; // the button of the usual design (it lives in the quick bar, or on top of the body on a touch screen)
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
      var jogStepApi = null; // the Step tab's axis, distance and move for design 3 (set where the tab is built)
      var jogStepPendingN = 0; // steps sent to the queue and not finished yet
      var jogStepGen = 0; // bumped by jogStepCancel(): the steps of an older generation that have not gone out yet are dropped
      var jogStepPendMm = {}; // axis -> signed mm of the steps that have not finished (the wheel tells how far the machine will still go)
      function jogStepPending() {
        return jogStepPendingN;
      }
      var jogStepAxisFn = null; // (axis, sign): one step of the chosen distance (Step tab)

      var JOG_PANEL_ID = "emergency-fab-jog-panel";
      // Size of the panel: the constants, the zoom and the handle in the corner are in 09-size.js / 15-size.js / 15-size-handle.js
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
      var JOG_HEADER_H = 40; // px: the title bar, ONE row of 32 px buttons (title + padlock on the left, help / size / settings / minimize on the right) + 4 px above and below
      var JOG_STOP_DOCK_H = jogIsTouch() ? 120 : 84;
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
      // window is wider than WORKSHOP_NARROW_PX, so it does not get the full screen button.
      function isMobileViewport() {
        return jogIsCoarse() && workshopIsNarrow();
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
        bOk.style.cssText = "background:#bf360c;color:#fff;border:0;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;";
        var bNo = document.createElement("button");
        bNo.type = "button";
        bNo.textContent = i18nT('jog.cancel');
        bNo.style.cssText = "background:#455a64;color:#fff;border:0;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;";
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
            jogConfirmArmedUntil = Date.now() + JOG_ARM_MS;
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
            jogHandlePostReply(op, request, body);
            return body;
          })
          .catch(function (e) {
            jogPostFailed(op, e);
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
      // a button carrying data-tj-modes is marked this way, and jogSetBtnEnabled -- the
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
        jogReasonPaint(); // 17-role-reason.js: the cause of a jog that cannot move, under the status line
        if (jogWithoutService || !jogLastMachineStatus) {
          // without service or without a response from DSF: text + link to the explanation
          jogStatusEl.textContent = jogWithoutService ? i18nT('jog.blocked', { reason: jogWithoutService }) : i18nT('jog.no_connection_with_the_system_service');
          var a = document.createElement("a");
          a.href = "#";
          a.textContent = jogExplainsOpen ? i18nT('jog.hide') : i18nT('jog.how_it_works');
          a.style.color = "var(--wf-n-session-text,#90caf9)";
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
          jogStatusEl.style.color = "var(--wf-n-down-text,#ffb74d)";
          return;
        }
        if (!jogRoleNow().move) {
          // a role that cannot move the machine (a viewer, or an operator outside the modes it may run): position only
          jogStatusEl.textContent = ""; // the reason is the one under it (17-role-reason.js), not a gray line twice
          return;
        }
        if (jogEnabled && jogWithoutHoming.length && !jogFreeActive()) {
          jogStatusEl.textContent = i18nT('jog.not_homed_they_do_not_move', { axes: jogWithoutHoming.join(", ") });
          jogStatusEl.style.color = "var(--wf-n-down-text,#ffb74d)";
        } else if (jogEnabled && jogBlock && jogBlock.confirm) {
          jogStatusEl.textContent = i18nT('jog.ready_but_it_needs_confirmation', { reason: jogBlock.reason });
          jogStatusEl.style.color = "var(--wf-n-down-text,#ffb74d)";
        } else if (jogEnabled) {
          jogStatusEl.textContent = i18nT('jog.ready_mm_min', { feed: jogMaxFeedXY().toFixed(0), v: jogLiveJob ? i18nT('jog.careful_live_job_open_paused', { v: jogNameLive() }) : "" });
          jogStatusEl.style.color = jogLiveJob ? "var(--wf-n-down-text,#ffb74d)" : "#b0bec5";
        } else if (jogBlockFirm()) {
          jogStatusEl.textContent = i18nT('jog.blocked_by_the_service_2', { reason: jogBlock.reason });
          jogStatusEl.style.color = "var(--wf-n-down-text,#ffb74d)";
        } else if (jogLiveJobBlocks()) {
          jogStatusEl.textContent = i18nT('jog.blocked_live_job_running', { v: jogNameLive() });
          jogStatusEl.style.color = "var(--wf-n-down-text,#ffb74d)";
        } else if (jogLastMachineStatus) {
          jogStatusEl.textContent =
            i18nT('jog.blocked_2', { v: JOG_BLOCK_REASONS[jogLastMachineStatus] || jogLastMachineStatus, v2: jogLastJobFile && jogLastMachineStatus !== "busy" ? " (" + jogLastJobFile + ")" : "" });
          jogStatusEl.style.color = "var(--wf-n-down-text,#ffb74d)";
        }
      }

      // The circle of Free mode: a graphite disc with relief (soft gradient, light edge, inner shadow) that reads on a light panel and on a dark one. Before it
      // was a flat fill that went to 35 % opacity when locked, so on a light panel only a faint outline was left. Off keeps the fill (a little less saturated).
      var JOG_RING_STYLE_ID = "workshop-jog-ring-css";
      function jogRingStyle() {
        if (document.getElementById(JOG_RING_STYLE_ID)) return;
        var st = document.createElement("style");
        st.id = JOG_RING_STYLE_ID;
        st.textContent = [
          ".workshop-jog-ring{background:radial-gradient(circle at 50% 36%,#566972,#35454d 62%,#27343a)!important;border:2px solid #7d8d95!important;box-shadow:inset 0 4px 10px rgba(0,0,0,0.55),inset 0 -1px 0 rgba(255,255,255,0.14),0 1px 0 rgba(255,255,255,0.45),0 3px 6px rgba(0,0,0,0.28);}",
          ".workshop-jog-ring[data-off=\"1\"]{opacity:0.72!important;filter:saturate(0.5);}",
        ].join("");
        document.head.appendChild(st);
      }

      function jogSetControlsEnabled(enabled) {
        enabled = enabled && jogHoldOk(); // a touch screen needs "Hold to enable" held (15-hold.js)
        if (jogRingEl) {
          jogRingEl.setAttribute("data-off", enabled ? "0" : "1"); // dimmed by its class, the fill stays
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
            jogUpdateStatusText(); jogPendantPaint(status); // the position display of design 3 (12-jog3.js)
          })
          .catch(function () {
            // Tolerate a SINGLE network/server failure without cutting the jog --
            // this poll competes for CPU/network with the video streams
            // of the page and an isolated
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

      // The panel changes height by itself (changing tab, opening a
      // collapsible Advanced section, adding macros...) without anyone dragging it --
      // if it grows downward from where it was, the bottom edge
      // may end up off screen. It re-clamps from the
      // SAVED position (the same criterion as the resize handler, so
      // that it returns to its place when it shrinks again) and saves nothing.
      function jogReclampPanel() {
        if (!jogPanelEl || jogPanelEl.dataset.fsLock === "1") return;
        if (jogPanelEl.style.display === "none") return;
        jogSizeApply();
        jogPosPlace(); jogNoticeInsetSync(); // from the saved corner + percentage (15-pos.js), bounded to the visible area every time; the notices keep a low STOP strip free (15-notice-inset.js)
      }

      // ---- Emergency stop zone (request 2026-10-12; the whole bar since 2026-11-06) ----
      // The jog NEVER covers DWC's top bar: the red Emergency stop button lives there (EmergencyBtn.vue: last button of the app-bar, top
      // right, with the mdi-flash icon; on a phone only the icon remains) and so do the menu and the state. Before, only the band of the
      // button itself was kept free, and a panel dragged to the top left still hid the bar (user report 2026-11-06). The zone is now the
      // whole width of the window, from the top to MARGIN below the bar (and below the button, when it sticks out of the bar). Without a
      // bar (DWC still being built): no zone. The shared rule for every floating panel is workshopFloatMinTop (_shared/00-core.js).
      function jogZoneEmergency() {
        var bar = document.querySelector("header.v-app-bar") || document.querySelector(".v-app-bar");
        if (!bar) return null;
        var br = bar.getBoundingClientRect();
        if (br.width === 0 || br.height === 0 || br.bottom <= 0) return null;
        var icon = bar.querySelector(".mdi-flash");
        var btn = icon && icon.closest ? icon.closest("button, .v-btn") : null;
        var r = btn ? btn.getBoundingClientRect() : null;
        var down = Math.max(br.bottom, r && r.width > 0 ? r.bottom : 0);
        return { left: 0, top: 0, right: window.innerWidth, bottom: down + MARGIN };
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

      // ---- Phantom touch (request 2026-10-12: "the jog header buttons
      // press what is behind") ----
      // Cause: the jog buttons act on pointerup (minimize hides the
      // panel, the gear opens the settings sheet).
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
        if (isJogOpen()) return jogCollapse();
        if (jogPanelLock()) return jogPanelLockTap(true); // project rule 2026-11-06: a jog that needs a session or a role is not opened; the tap signs in (17-role-reason.js)
        jogExpand();
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
        // full screen left the other floating widgets hidden
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
        jogHoldReset(); // a closed jog is not enabled (15-hold.js)
        var token = ++jogCloseToken;

        function finish() {
          if (token !== jogCloseToken) return; // se reabrio mientras tanto
          // The same fix as in the other floating panels -- take the focus out of the
          // panel BEFORE hiding it (otherwise the browser reassigns the
          // focus and may trigger the on-screen keyboard).
          if (jogPanelEl && document.activeElement && jogPanelEl.contains(document.activeElement)) {
            document.activeElement.blur();
          }
          if (jogPanelEl) {
            jogPanelEl.style.transition = jogPanelEl.style.animation = "none"; jogPanelEl.style.display = "none"; // gone at once, no transition or animation of any kind, reduced motion or not (owner, 2026-11-23)
            jogPanelEl.style.pointerEvents = "";
            delete jogPanelEl.dataset.closing;
          }
          jogNoticeInsetSync(); workshopNotify(); // closed: the notices take the bottom again
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
          "font-size:12px",
          "touch-action:none",
          "-webkit-user-select:none",
          "user-select:none",
        ].join(";");
        return b;
      }

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

      // createJogPanel() and its sections: 10-jog-panel.js and 10-jog-panel-*.js (2026-11-23).

      function createJogWidgets() {
        if (pluginStopped) return;
        createJogPanel();
        if (isJogExpanded()) {
          jogExpand();
        } else {
          jogCollapse(true);
        }
      }
