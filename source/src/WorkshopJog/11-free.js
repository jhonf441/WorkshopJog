      // ---- Move without limits (request 2026-10-10) ----
      //
      // "Add to the jog some way to move the axes without homing or outside
      // the limits; there must be many warnings, the jog must blink in
      // orange/red, if it detects no movement it must turn itself off after
      // configurable seconds, and there must be guards: the drivers to see
      // when an axis crashes or when it goes a few extra millimeters out."
      //
      // Everything that protects lives in the backend (WorkshopService, jog_move.py:
      // margin, speed, current, crash by driver, automatic exit) and
      // in the board (sys/workshop/macros/jogFreeFailsafe.g from daemon.g). This
      // file only asks to enter/exit, shows the state (plugin data
      // jogFree, read in jogCheckEnabled) and saves the settings in
      // 0:/sys/workshop/config/jog.json "free" (reread by the backend).

      var JOG_FREE_DEF = { mode: "withoutHoming", color: "#ff1744", timeoutS: 60, marginMm: 5, speedPct: 25, correctionXY: 50, correctionZ: 100, crash: true, crashSens: 8, crashSteps: 100 };
      var JOG_FREE_LIM = { timeoutS: [10, 600], marginMm: [0, 30], speedPct: [5, 100], correctionXY: [20, 100], correctionZ: [40, 100], crashSens: [-64, 63], crashSteps: [20, 400] };
      var JOG_FREE_FAILSAFE_LINE = 'M98 P"0:/sys/workshop/macros/jogFreeFailsafe.g"   ; failsafe of the jog without limits (WorkshopJog)';
      var jogFree = null; // ultimo plugins.WorkshopService.data.jogFree
      var jogFreeAt = 0; // when it arrived (for the countdown between readings)
      var jogFreeBox = null; // aviso dentro del panel
      var jogFreeBtn = null;
      var jogFreeRequest = 0; // ms of the last request (shows "activating..." until the state arrives)

      function jogFreeCfgClean(o) {
        var c = JSON.parse(JSON.stringify(JOG_FREE_DEF));
        if (o && typeof o === "object") {
          Object.keys(JOG_FREE_LIM).forEach(function (k) {
            var v = parseFloat(o[k]);
            if (isFinite(v)) c[k] = Math.min(JOG_FREE_LIM[k][1], Math.max(JOG_FREE_LIM[k][0], v));
          });
          if (typeof o.crash === "boolean") c.crash = o.crash;
          if (o.mode === "withoutHoming" || o.mode === "outsideLimits") c.mode = o.mode;
          if (/^#[0-9a-f]{6}$/i.test(o.color || "")) c.color = o.color;
        }
        return c;
      }

      function jogFreeCfgLoad() {
        return tzGetText(JOG_AJ_FILE)
          .then(function (t) {
            return jogFreeCfgClean((JSON.parse(t) || {}).free);
          })
          .catch(function () {
            return jogFreeCfgClean(null);
          });
      }

      function jogFreeActive() {
        return !!(jogFree && jogFree.active);
      }

      // blink CSS (once): the WHOLE panel alternates red / orange.
      function jogFreeCss() {
        if (document.getElementById("workshop-jog-free-css")) return;
        var st = document.createElement("style");
        st.id = "workshop-jog-free-css";
        st.textContent = [
          // a single color (configurable in the sheet): on / off
          // 2026-10-11 ("with the no-limits mode the jog does not seem to light up"): the light theme sets
          // the panel's border, shadow and background with !important inline, and that beats an
          // animation; the blink uses outline and glow (filter), which the theme does not touch
          "@keyframes tjFreeBlink{0%,49%{outline-color:var(--tjFreeColor);filter:drop-shadow(0 0 12px var(--tjFreeColor))}50%,100%{outline-color:transparent;filter:none}}",
          "#" + JOG_PANEL_ID + "[data-free='1']{outline:4px solid var(--tjFreeColor,#ff1744) !important;outline-offset:0;animation:tjFreeBlink 0.9s infinite !important}",
          "#" + JOG_PANEL_ID + "[data-free='1'] > div:first-child{background:var(--tjFreeColor,#ff1744) !important;box-shadow:inset 0 0 0 999px var(--tjFreeColor,#ff1744) !important}",
          "@media (prefers-reduced-motion: reduce){#" + JOG_PANEL_ID + "[data-free='1']{animation-duration:2s !important}}",
        ].join("\n");
        document.head.appendChild(st);
      }

      // Lo llama createJogPanel debajo de STOP / E-STOP.
      function jogFreeMount(body) {
        jogFreeCss();
        jogFreeBox = document.createElement("div");
        jogFreeBox.style.cssText = "display:none;width:100%;box-sizing:border-box;border-radius:6px;padding:6px;font-size:11px;line-height:1.35;";
        body.appendChild(jogFreeBox);
        jogFreeBtn = document.createElement("button");
        jogFreeBtn.type = "button";
        // a small padlock icon in the panel header, next to the gear (2026-10-16): the text chip ("Sin limites: no") was wider
        // than the header and pushed the title and the minimize button out of it. The text lives in the tooltip.
        jogFreeBtn.style.cssText =
          "flex:none;width:22px;height:20px;box-sizing:border-box;border-radius:4px;border:1px solid #ffb74d;background:transparent;color:#ffb74d;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-right:4px;cursor:pointer;touch-action:none;";
        jogFreeBtn.setAttribute("data-tip-pass", "1");
        jogFreeBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        jogFreeBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          if (jogFreeBtn.disabled) return;
          if (!jogFreeActive() && !jogEnabled) return; // the jog is blocked: no sheet, nothing to confirm
          if (jogFreeActive()) jogFreeExit();
          else jogFreeOpenSheet();
        });
        if (jogHeaderEl) jogHeaderEl.insertBefore(jogFreeBtn, jogHeaderEl.firstChild.nextSibling); // title, chip, gear
        else body.appendChild(jogFreeBtn);
        jogFreeRender();
      }

      function jogFreeExit() {
        jogFreeRequest = Date.now();
        jogReleaseAllHolds();
        postJogCommand("jog.free", { on: false });
        jogFreeRender();
      }

      // Called by jogCheckEnabled with each state reading (every ~2 s).
      function jogFreeUpdate(d) {
        var before = jogFreeActive();
        jogFree = d || null;
        jogFreeAt = Date.now();
        if (before && !jogFreeActive()) jogReleaseAllHolds(); // salio (choque, inactivo, trabajo): soltar todo
        jogFreeRender();
      }

      var jogFreeDetails = false; // recuadro del modo: detalles abiertos
      // Repaints only the button when the blocked state of the jog changes (called from the status poll).
      var jogFreeLockPrev = null;
      function jogFreeBlockPaint() {
        if (!jogFreeBtn) return;
        var b = !jogEnabled && !jogFreeActive();
        if (b === jogFreeLockPrev) return;
        jogFreeLockPrev = b;
        jogFreeRender();
      }

      function jogFreeRender() {
        if (!jogFreeBtn) return;
        var on = jogFreeActive();
        if (jogPanelEl) {
          jogPanelEl.dataset.free = on ? "1" : "";
          if (jogFree && jogFree.color) jogPanelEl.style.setProperty("--tjFreeColor", jogFree.color);
        }
        var esperando = jogFreeRequest && Date.now() - jogFreeRequest < 4000;
        // closed padlock = the limits protect the machine; open padlock = no limits (on) or waiting for the service
        jogFreeBtn.innerHTML =
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="' +
          (on || esperando
            ? "M18,1C15.24,1 13,3.24 13,6V8H4A2,2 0 0,0 2,10V20A2,2 0 0,0 4,22H16A2,2 0 0,0 18,20V10A2,2 0 0,0 16,8H15V6C15,4.34 16.34,3 18,3C19.66,3 21,4.34 21,6V8H23V6C23,3.24 20.76,1 18,1M10,13A2,2 0 0,1 12,15C12,16.11 11.11,17 10,17C8.89,17 8,16.1 8,15C8,13.89 8.9,13 10,13Z"
            : "M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z") +
          '"/></svg>';
        jogFreeBtn.title = on ? i18nT('free.exit_no_limits_mode') : esperando ? i18nT('free.waiting_for_the_backend') : i18nT('free.move_without_limits');
        jogFreeBtn.style.background = on ? "#b71c1c" : "transparent";
        jogFreeBtn.style.color = on ? "#fff" : "#ffb74d";
        jogFreeBtn.style.border = on ? "2px solid #fff" : "1px solid #ffb74d";
        var blocked = !jogEnabled && !on; // the jog is blocked (job, no service...): the mode cannot be asked for
        jogFreeBtn.disabled = (!!esperando && !on) || blocked;
        jogFreeBtn.style.opacity = (esperando || blocked) && !on ? "0.4" : "1";
        jogFreeBtn.style.cursor = blocked ? "not-allowed" : esperando && !on ? "wait" : "pointer";
        var box = jogFreeBox;
        box.textContent = "";
        var d = jogFree || {};
        if (on) {
          box.style.display = "block";
          box.style.background = "rgba(0,0,0,0.55)";
          box.style.border = "1px solid #ff5252";
          // 2026-10-10 ("it takes up a lot of space, it could be small"): one line
          // with the essentials; current / crash / margin in "Details".
          // What is dangerous (crash disabled, notice, no fallback) is always in view.
          var t = document.createElement("div");
          t.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;font-weight:bold;color:#ef9a9a;";
          var titleThe = document.createElement("span");
          titleThe.style.flex = "1";
          titleThe.textContent = d.mode === "outsideLimits" ? i18nT('free.beyond_the_limits_careful') : i18nT('free.no_homing_no_limits_careful');
          t.appendChild(titleThe);
          var subtracts = d.remainingS != null ? Math.max(0, d.remainingS - (Date.now() - jogFreeAt) / 1000) : null;
          if (subtracts != null) {
            var rs = document.createElement("span");
            rs.style.cssText = "font-weight:normal;color:#eceff1;";
            rs.title = i18nT('free.turns_itself_off_if_there_is');
            rs.textContent = Math.ceil(subtracts) + " s";
            t.appendChild(rs);
          }
          var db = document.createElement("button");
          db.type = "button";
          db.style.cssText = "background:none;border:none;color:#b0bec5;font-size:11px;cursor:pointer;padding:0 2px;";
          db.textContent = jogFreeDetails ? i18nT('free.less') : i18nT('free.details');
          db.addEventListener("click", function (ev) {
            ev.stopPropagation();
            jogFreeDetails = !jogFreeDetails;
            jogFreeRender();
          });
          t.appendChild(db);
          box.appendChild(t);
          var lines = [
            i18nT('free.max_speed', { v: d.withoutHoming && d.withoutHoming.length ? i18nT('free.not_homed', { axes: d.withoutHoming.join(", ") }) : i18nT('free.homed'), speedPct: d.speedPct }),
          ];
          if (jogFreeDetails) {
            lines.push(i18nT('free.margin_beyond_the_limits_mm_2', { marginMm: d.marginMm }));
            lines.push(i18nT('free.current_xy_z', { correctionXY: d.correctionXY, correctionZ: d.correctionZ }));
            if (subtracts != null) lines.push(i18nT('free.turns_itself_off_after_s_without', { s: Math.ceil(subtracts) }));
          }
          // 2026-10-10 ("I put my hand to brake and it did not stop"): from what
          // speed the driver measures, always in view; orange if the
          // mode's maximum speed does not reach it (it never detects).
          var naranja = {};
          if (!d.crash) {
            lines.push(i18nT('free.driver_stall_detection_off'));
            naranja[i18nT('free.driver_stall_detection_off')] = 1;
          } else if (d.crashMmS) {
            var never = d.vMaxMmS != null && d.vMaxMmS < d.crashMmS;
            var lc = never ? i18nT('free.stall_not_detected_it_moves_at', { v: d.vMaxMmS.toFixed(0), c: d.crashMmS.toFixed(0) }) : i18nT('free.stall_only_detected_above_mm_s', { c: d.crashMmS.toFixed(0) });
            lines.push(lc);
            if (never) naranja[lc] = 1;
          }
          lines.forEach(function (s) {
            var l = document.createElement("div");
            l.textContent = s;
            if (naranja[s]) l.style.color = "#ffb74d";
            box.appendChild(l);
          });
          if (d.notice) {
            var a = document.createElement("div");
            a.style.cssText = "color:#ffb74d;margin-top:3px;";
            a.textContent = d.notice;
            box.appendChild(a);
          }
          if (d.backup === false) {
            var r = document.createElement("div");
            r.style.cssText = "color:#ef9a9a;margin-top:3px;";
            r.textContent = i18nT('free.no_backup_on_the_board_daemon');
            box.appendChild(r);
          }
          return;
        }
        // It just exited: why (2 min). A crash is seen in red.
        var u = d.last;
        if (u && Date.now() - u.at < 120000) {
          box.style.display = "block";
          var crash = u.reason === "crash";
          box.style.background = crash ? "rgba(183,28,28,0.35)" : "rgba(255,255,255,0.06)";
          box.style.border = "1px solid " + (crash ? "#ff5252" : "rgba(255,255,255,0.2)");
          var m = document.createElement("div");
          m.style.cssText = "font-weight:bold;" + (crash ? "color:#ef9a9a;" : "color:#eceff1;");
          m.textContent = i18nT('free.no_limits_mode_2', { text: u.text });
          box.appendChild(m);
          if (crash) {
            var c = document.createElement("div");
            c.textContent = i18nT('free.check_the_machine_before_going_on');
            box.appendChild(c);
          }
        } else {
          box.style.display = "none";
        }
      }
      setInterval(function () {
        if (jogFreeActive() || (jogFreeRequest && Date.now() - jogFreeRequest < 5000)) jogFreeRender(); // cuenta regresiva / fin de la espera
      }, 1000);

      // Installs the fallback line at the end of sys/daemon.g (creating it if it does not exist).
      function jogFreeInstallBackup() {
        return tzGetText("0:/sys/daemon.g")
          .catch(function () {
            return "";
          })
          .then(function (t) {
            if (t.indexOf("jogFreeFailsafe") >= 0) return;
            var nuevo = t + (t && !/\n$/.test(t) ? "\n" : "") + JOG_FREE_FAILSAFE_LINE + "\n";
            return tzPutText("0:/sys/daemon.g", nuevo);
          });
      }

      // Hoja de activacion: advertencias, ajustes y confirmacion.
      function jogFreeOpenSheet() {
        var old = document.getElementById("workshop-jog-free");
        if (old) old.remove();
        var ov = document.createElement("div");
        ov.id = "workshop-jog-free";
        ov.setAttribute("data-workshop-i18n", "1");
        ov.style.cssText =
          "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-family:Roboto,Helvetica,Arial,sans-serif;";
        var box = document.createElement("div");
        box.style.cssText =
          "background:#263238;color:#eceff1;border:2px solid #ff5252;border-radius:10px;width:min(460px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-shadow:0 6px 24px rgba(0,0,0,0.6);";
        ov.appendChild(box);
        ov.addEventListener("pointerdown", function (ev) {
          if (ev.target === ov) cerrar();
        });
        function el(tag, css, text) {
          var e = document.createElement(tag);
          if (css) e.style.cssText = css;
          if (text !== undefined) e.textContent = text;
          return e;
        }
        function cerrar() {
          ov.remove();
        }
        var hd = el("div", "display:flex;align-items:center;padding:10px 12px;background:#b71c1c;border-radius:8px 8px 0 0;");
        hd.appendChild(el("div", "font-size:16px;font-weight:bold;flex:1;", i18nT('common.move_without_limits')));
        var xb = el("button", "background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;", "x");
        xb.type = "button";
        xb.addEventListener("click", cerrar);
        hd.appendChild(xb);
        box.appendChild(hd);
        var cuerpo = el("div", "overflow-y:auto;padding:10px 12px;flex:1;font-size:13px;");
        box.appendChild(cuerpo);
        var pie = el("div", "display:flex;gap:6px;padding:10px 12px;border-top:1px solid rgba(255,255,255,0.12);align-items:center;flex-wrap:wrap;");
        box.appendChild(pie);
        var msg = el("div", "font-size:12px;flex:1 1 100%;color:#ffb74d;");
        pie.appendChild(msg);

        var notices = [
          i18nT('free.while_it_s_on_the_travel'),
          i18nT('free.an_axis_that_isn_t_homed'),
          i18nT('free.the_drivers_stall_detection_only_works'),
          i18nT('free.only_moves_from_the_jog_the'),
          i18nT('free.keep_your_hand_near_the_emergency'),
          i18nT('free.in_laser_mode_the_jog_always'),
        ];
        var ul = el("ul", "margin:0 0 8px 0;padding-left:18px;");
        notices.forEach(function (s) {
          ul.appendChild(el("li", "margin:3px 0;", s));
        });
        cuerpo.appendChild(ul);

        var cfg = jogFreeCfgClean(null);
        var fields = el("div", "");
        cuerpo.appendChild(fields);
        function numero(etq, k, help) {
          var r = el("div", "display:flex;align-items:center;gap:8px;margin:5px 0;flex-wrap:wrap;");
          r.appendChild(el("span", "flex:1 1 170px;", etq));
          var i = document.createElement("input");
          i.type = "number";
          i.min = JOG_FREE_LIM[k][0];
          i.max = JOG_FREE_LIM[k][1];
          i.step = k === "marginMm" ? "0.5" : "1";
          i.value = cfg[k];
          i.style.cssText = "width:80px;padding:4px;background:#1e272c;color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:4px;";
          i.addEventListener("input", function () {
            var v = parseFloat(i.value);
            if (isFinite(v)) cfg[k] = v;
          });
          r.appendChild(i);
          fields.appendChild(r);
          if (help) fields.appendChild(el("div", "font-size:11px;color:#b0bec5;margin:-2px 0 6px 0;", help));
        }
        function dibujarCampos() {
          fields.textContent = "";
          fields.appendChild(el("div", "font-size:12px;font-weight:bold;color:#ef9a9a;margin:6px 0 2px 0;", i18nT('free.mode')));
          [
            ["withoutHoming", i18nT('free.no_homing'), i18nT('free.moves_axes_without_homing_and_beyond')],
            ["outsideLimits", i18nT('free.beyond_the_limits_homed'), i18nT('free.requires_x_y_z_homing_only')],
          ].forEach(function (m) {
            var l = el("label", "display:flex;align-items:flex-start;gap:6px;margin:4px 0;cursor:pointer;");
            var r = document.createElement("input");
            r.type = "radio";
            r.name = "tjFreeMode";
            r.checked = cfg.mode === m[0];
            r.style.cssText = "width:18px;height:18px;flex:none;margin-top:1px;";
            r.addEventListener("change", function () {
              if (r.checked) cfg.mode = m[0];
            });
            l.appendChild(r);
            var tx = el("span", "");
            tx.appendChild(el("b", "", m[1]));
            tx.appendChild(el("div", "font-size:11px;color:#b0bec5;", m[2]));
            l.appendChild(tx);
            fields.appendChild(l);
          });
          var rc = el("div", "display:flex;align-items:center;gap:8px;margin:6px 0;");
          rc.appendChild(el("span", "flex:1 1 170px;", i18nT('free.blink_color')));
          var ci = document.createElement("input");
          ci.type = "color";
          ci.value = cfg.color;
          ci.style.cssText = "width:60px;height:30px;padding:0;border:none;background:none;";
          ci.addEventListener("input", function () {
            cfg.color = ci.value;
          });
          rc.appendChild(ci);
          fields.appendChild(rc);
          fields.appendChild(el("div", "font-size:12px;font-weight:bold;color:#ef9a9a;margin:10px 0 2px 0;", i18nT('free.safeguards_for_every_screen')));
          numero(i18nT('free.turns_itself_off_without_movement_s'), "timeoutS", i18nT('free.if_you_don_t_move_anything'));
          numero(i18nT('free.margin_beyond_the_limits_mm'), "marginMm", i18nT('free.on_homed_axes_it_never_goes'));
          numero(i18nT('free.maximum_speed_of_the_jog'), "speedPct", "");
          numero(i18nT('free.x_y_current'), "correctionXY", i18nT('free.less_current_less_force_if_it'));
          numero(i18nT('free.z_current'), "correctionZ", i18nT('free.with_low_current_z_may_drop'));
          var l = el("label", "display:flex;align-items:center;gap:6px;margin:8px 0 2px 0;cursor:pointer;");
          var c = document.createElement("input");
          c.type = "checkbox";
          c.checked = cfg.crash;
          c.style.cssText = "width:18px;height:18px;";
          c.addEventListener("change", function () {
            cfg.crash = c.checked;
            dibujarCampos();
          });
          l.appendChild(c);
          l.appendChild(el("span", "", i18nT('free.detect_crashes_with_the_drivers_stallguard')));
          fields.appendChild(l);
          // the sensitivity and the minimum speed are edited ONLY in Motors (Crash tab); here a shortcut for technician and admin
          var motorsLink = cfg.crash ? jogMotorsLinkMake(el) : null;
          if (motorsLink) fields.appendChild(motorsLink);
          var hint = jogFree && jogFree.backup === false;
          if (hint) {
            var rr = el("div", "margin-top:8px;padding:6px;border:1px solid #ff8a80;border-radius:6px;font-size:12px;");
            rr.appendChild(el("div", "", i18nT('free.the_backup_on_the_board_is')));
            var ib = el("button", "margin-top:4px;padding:5px 10px;border-radius:6px;border:1px solid #fff;background:#455a64;color:#fff;cursor:pointer;", i18nT('free.install_backup_in_sys_daemon_g'));
            ib.type = "button";
            ib.addEventListener("click", function () {
              ib.disabled = true;
              jogFreeInstallBackup()
                .then(function () {
                  if (jogFree) jogFree.backup = true;
                  msg.textContent = i18nT('free.backup_installed');
                  dibujarCampos();
                })
                .catch(function (e) {
                  ib.disabled = false;
                  msg.textContent = i18nT('free.could_not_install_the_backup', { err: e && e.message ? e.message : e });
                });
            });
            rr.appendChild(ib);
            fields.appendChild(rr);
          }
        }
        jogFreeCfgLoad().then(function (c) {
          cfg = c;
          dibujarCampos();
        });
        dibujarCampos();

        var entiendo = el("label", "display:flex;align-items:center;gap:8px;margin:10px 0 0 0;font-weight:bold;cursor:pointer;color:#ef9a9a;");
        var ck = document.createElement("input");
        ck.type = "checkbox";
        ck.style.cssText = "width:20px;height:20px;";
        entiendo.appendChild(ck);
        entiendo.appendChild(el("span", "", i18nT('free.i_understand_the_risks_and_i')));
        cuerpo.appendChild(entiendo);

        pie.appendChild(el("span", "flex:1;"));
        var cancel = el("button", "padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.3);background:#455a64;color:#fff;cursor:pointer;", i18nT('jog.cancel'));
        cancel.type = "button";
        cancel.addEventListener("click", cerrar);
        pie.appendChild(cancel);
        var act = el("button", "padding:6px 12px;border-radius:6px;border:2px solid #fff;background:#b71c1c;color:#fff;font-weight:bold;cursor:pointer;opacity:0.4;", i18nT('free.turn_on'));
        act.type = "button";
        act.disabled = true;
        ck.addEventListener("change", function () {
          act.disabled = !ck.checked;
          act.style.opacity = ck.checked ? "1" : "0.4";
          armed = false;
          act.textContent = i18nT('free.turn_on');
        });
        var armed = false;
        var armedT = null;
        act.addEventListener("click", function () {
          if (!ck.checked) return;
          if (!armed) {
            armed = true;
            act.textContent = i18nT('free.tap_again_to_turn_on');
            clearTimeout(armedT);
            armedT = setTimeout(function () {
              armed = false;
              act.textContent = i18nT('free.turn_on');
            }, 4000);
            return;
          }
          clearTimeout(armedT);
          // 2026-10-10 ("the button must be disabled so it does not keep getting
          // clicks"): disabled TO THE EYE, like Cancel, until
          // it finishes; the panel's button says "Waiting for the backend...".
          act.disabled = true;
          act.textContent = i18nT('free.turning_on');
          act.style.opacity = "0.4";
          act.style.cursor = "wait";
          cancel.disabled = true;
          cancel.style.opacity = "0.4";
          ck.disabled = true;
          msg.textContent = i18nT('free.saving_the_safeguards');
          var c = jogFreeCfgClean(cfg);
          jogAjMachMerge({ free: c })
            .then(function () {
              // the backend rereads the file every 2 s: wait for it to take it
              msg.textContent = i18nT('free.turning_on');
              return new Promise(function (res) {
                setTimeout(res, 2500);
              });
            })
            .then(function () {
              jogFreeRequest = Date.now();
              jogReleaseAllHolds();
              return postJogCommand("jog.free", { on: true });
            })
            .then(function () {
              cerrar();
              jogFreeRender();
            })
            .catch(function (e) {
              act.disabled = false;
              act.textContent = i18nT('free.turn_on');
              act.style.opacity = "1";
              act.style.cursor = "pointer";
              cancel.disabled = false;
              cancel.style.opacity = "1";
              ck.disabled = false;
              msg.textContent = i18nT('free.could_not_turn_on_2', { err: e && e.message ? e.message : e });
            });
        });
        pie.appendChild(act);
        document.body.appendChild(ov);
      }
