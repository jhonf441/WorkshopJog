      // ---- Jog option 2: "by tasks" (2026-10-10) ----
      //
      // Request: "a second style for the jog that can be chosen from its
      // settings; more than a style a redesign of functionality, leaving the one
      // that is already there as option 1" and "leave the knob in More; button and slider
      // controlled by the speed curve so that it looks and feels smooth".
      //
      // A single screen, without tabs: where it is (big position, zone or
      // machine, pointer or laser), move (8-direction cross + Z: tap =
      // one step, hold = continuous with soft start), step, speed, Go
      // to (numbers), actions, and STOP / E-STOP at the bottom.
      // The usual jog (option 1) does NOT change: it stays whole inside "More"
      // (knob, Z, tabs, Advanced, no limits...). STOP / E-STOP are
      // the same buttons as option 1's, moved to the very bottom.
      //
      // Continuous goes through the SAME path as the knob (API jog.xy /
      // S"z", jog_move.py on the Pi), which applies the curve and the dead zone of
      // Settings > Speed: the held button rises from 0.3 to 1 in ~0.7 s and the
      // curve smooths it (no jumps on start).

      var JOG2_HOLD_MS = 250; // more than this held = continuous
      var JOG2_RAMP_MS = 700;
      var JOG2_TICK_MS = 100;

      function jog2Get(k, def) {
        try {
          var v = localStorage.getItem(k);
          return v === null ? def : v;
        } catch (e) {
          return def;
        }
      }
      function jog2Set(k, v) {
        try {
          localStorage.setItem(k, v);
        } catch (e) {
          /* no critico */
        }
      }

      // o: {body, statusEl, avisoEl, stopRow, speedSlider, stepSlider, pasos,
      //     getStepIndex()}
      // Style and buttons of option 2 (also used by option 1 for the
      // arrows, Settings > What is shown > Controls).
      function jog2Helpers() {
        var C = { background: "#263238", edge: "rgba(255,255,255,0.18)", text: "#eceff1", sec: "#b0bec5", prim: "#1976d2", amber: "#ff8f00" };

        function el(tag, css, text) {
          var e = document.createElement(tag);
          if (css) e.style.cssText = css;
          if (text != null) e.textContent = text;
          return e;
        }
        // buttons: pointerdown does not drag the panel nor give focus (see jog)
        function boton(text, css, onTap) {
          var b = el("button", "min-height:36px;border-radius:6px;border:1px solid " + C.edge + ";background:transparent;color:" + C.text + ";font:inherit;font-size:12px;cursor:pointer;touch-action:none;padding:0 8px;" + (css || ""), text);
          b.type = "button";
          b.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); ev.preventDefault(); });
          if (onTap) b.addEventListener("pointerup", function (ev) { ev.stopPropagation(); onTap(b); });
          return b;
        }
        // doble toque (nivel 2, DESIGN.md 5): mueve la maquina
        function botonDoble(text, confirmar, css, onGo) {
          var armed = null;
          var b = boton(text, css, function () {
            if (!armed) {
              b.dataset.t = b.textContent;
              b.textContent = confirmar;
              b.style.background = C.amber;
              b.style.borderColor = C.amber;
              b.style.color = "#fff";
              armed = setTimeout(desarmar, 4000);
              return;
            }
            desarmar();
            onGo();
          });
          function desarmar() {
            clearTimeout(armed);
            armed = null;
            if (b.dataset.t) b.textContent = b.dataset.t;
            b.style.background = "transparent";
            b.style.borderColor = C.edge;
            b.style.color = C.text;
          }
          return b;
        }

        return { C: C, el: el, button: boton, buttonDouble: botonDoble };
      }

      // Empty "Go to" box = that axis stays where it is: its placeholder shows where that is.
      function jog2Placeholders(inp, est) {
        ["X", "Y", "Z"].forEach(function (L) {
          var t = est.num(L);
          inp[L].placeholder = t === "--" ? "" : t;
        });
      }

      function jog2Assemble(o) {
        var body = o.body;
        var H = jog2Helpers();
        var C = H.C, el = H.el, boton = H.button, botonDoble = H.buttonDouble;

        // -- assembly: option 2 on top, the usual jog in "More" --
        var root = el("div", "width:100%;display:flex;flex-direction:column;gap:8px;");
        var more = el("div", "width:100%;display:none;flex-direction:column;align-items:center;gap:8px;border-top:1px solid " + C.edge + ";padding-top:8px;");
        Array.prototype.slice.call(body.children).forEach(function (h) {
          if (h !== o.statusEl && h !== o.noticeEl && h !== o.stopRow && h !== o.posT.card && h !== o.posT.mini) more.appendChild(h);
        });
        body.insertBefore(root, body.firstChild);
        body.insertBefore(o.posT.mini, root); // compact position/speed bar pinned under the status bar (13-position.js)
        // the status and the warnings live in the fixed bar under the header (10-jog.js)

        // 1. where it is: the common position card (13-position.js); Settings decides whether it is seen
        root.appendChild(o.posT.card);

        // 2. move: according to Settings > What is shown > Controls (both options)
        var ctrl = jogControls(2);
        if (ctrl.knob || ctrl.sliders || ctrl.zSlide) {
          // knob / sliders of option 1, taken out of More
          if (o.axisModeRow) root.appendChild(o.axisModeRow);
          if (o.knobRow) root.appendChild(o.knobRow);
        }
        if (o.applyControls) o.applyControls(ctrl);
        var mv = jog2Move(o, H, ctrl);
        // without arrows: Z+/Z- next to the knob or the sliders, of the same height
        if (mv && !ctrl.arrows && o.zButtonsInRow && o.zButtonsInRow(mv)) mv = null;
        else if (mv) root.appendChild(mv.move);
        // little keyboard (Settings > Controls to move > Keyboard, 2026-10-11): built
        // by 10-jog.js with its button to activate it; here it goes below the controls
        if (o.keyboard) root.appendChild(o.keyboard);

        // paso y velocidad
        // Step: three groups (fine / medium / large) with the active value shown on the right, instead of one
        // long row of ten buttons. The groups come from the values of Settings: < 1 mm, 1 to 10 mm, over 10 mm.
        var stepRow = el("div", "display:flex;flex-direction:column;gap:4px;");
        root.appendChild(stepRow);
        function paintSteps() {
          stepRow.textContent = "";
          var active = o.getStepIndex();
          var cab = el("div", "display:flex;align-items:baseline;justify-content:space-between;");
          cab.appendChild(el("span", "font-size:11px;color:" + C.sec + ";", i18nT('jog.step')));
          cab.appendChild(el("span", "font-size:14px;font-weight:600;color:" + C.text + ";", String(o.steps[active]) + " mm"));
          stepRow.appendChild(cab);
          [["jog2.step_fine", function (v) { return v < 1; }], ["jog2.step_medium", function (v) { return v >= 1 && v <= 10; }], ["jog2.step_large", function (v) { return v > 10; }]].forEach(function (g) {
            var idx = [];
            o.steps.forEach(function (v, i) { if (g[1](v)) idx.push(i); });
            if (!idx.length) return;
            var row = el("div", "display:flex;align-items:center;gap:6px;");
            row.appendChild(el("span", "flex:0 0 46px;font-size:10px;color:" + C.sec + ";", i18nT(g[0])));
            var seg = el("div", "display:flex;flex:1 1 auto;min-width:0;");
            idx.forEach(function (i, k) {
              var on = i === active;
              var radius = (k === 0 ? "6px 0 0 6px" : k === idx.length - 1 ? "0 6px 6px 0" : "0");
              var b = boton(String(o.steps[i]), "flex:1 1 0;min-width:0;min-height:30px;padding:0 2px;border-radius:" + radius + ";" + (k ? "margin-left:-1px;" : "") + (on ? "background:" + C.prim + ";border-color:" + C.prim + ";color:#fff;position:relative;z-index:1;" : ""), function () {
                o.stepSlider.value = String(i);
                o.stepSlider.dispatchEvent(new Event("input")); // option 1 saves the step (same value)
                paintSteps();
              });
              seg.appendChild(b);
            });
            row.appendChild(seg);
            stepRow.appendChild(row);
          });
        }
        paintSteps();
        if (mv) root.appendChild(el("div", "font-size:10px;color:" + C.sec + ";", i18nT('jog2.tap_an_arrow_one_step_hold')));
        var speedRow = el("div", "display:flex;align-items:center;gap:6px;flex-wrap:wrap;");
        root.appendChild(speedRow);
        speedRow.appendChild(el("span", "font-size:11px;color:" + C.sec + ";", i18nT('jog2.speed')));
        var speed = el("input", "flex:1 1 120px;min-width:80px;");
        speed.type = "range";
        speed.min = o.speedSlider.min || "5";
        speed.max = o.speedSlider.max || "100";
        speed.step = o.speedSlider.step || "1";
        speed.value = o.speedSlider.value;
        speed.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
        var speedTxt = el("span", "font-size:11px;white-space:nowrap;width:100%;text-align:right;color:" + C.sec + ";");
        speedRow.appendChild(speed);
        speedRow.appendChild(speedTxt);
        function paintSpeed() {
          speedTxt.textContent = Math.round(jogSpeedPercent) + " % · " + Math.round(jogMaxFeedXY()) + " mm/min";
        }
        speed.addEventListener("input", function () {
          o.speedSlider.value = speed.value;
          o.speedSlider.dispatchEvent(new Event("input")); // same value and saving as option 1
          paintSpeed();
        });
        paintSpeed();

        // 3. ir a
        var irCard = el("div", "background:" + C.background + ";border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;");
        root.appendChild(irCard);
        irCard.appendChild(el("span", "font-size:11px;color:" + C.sec + ";", i18nT('jog2.go_to')));
        var irRow = el("div", "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;align-items:center;");
        irCard.appendChild(irRow);
        var inp = {};
        ["X", "Y", "Z"].forEach(function (L) {
          var l = el("label", "flex:1;display:flex;align-items:center;gap:3px;font-size:12px;min-width:0;", L);
          var i = el("input", "width:100%;min-width:0;height:32px;box-sizing:border-box;border-radius:4px;border:1px solid " + C.edge + ";background:#1e272c;color:" + C.text + ";padding:0 4px;font:inherit;");
          i.type = "number";
          i.step = "0.1";
          i.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
          inp[L] = i;
          l.appendChild(i);
          irRow.appendChild(l);
        });
        var irMsg = el("div", "font-size:11px;color:#ffb74d;display:none;");
        irCard.appendChild(botonDoble(i18nT('jog2.go'), i18nT('jog2.go_2'), "width:100%;", function () { irA(); }));
        irCard.appendChild(irMsg);

        var last = null; // {ax, marco, apunta} of the position card
        function notice(t) {
          irMsg.textContent = t || "";
          irMsg.style.display = t ? "block" : "none";
        }
        // destino en coords de MAQUINA (null = no se mueve ese eje)
        function destination() {
          var ax = last && last.ax;
          if (!ax) return null;
          var est = o.posT.state(); // Zona / Maquina y Puntero / Laser como estan ahora
          var frame = est.border, apunta = est.points;
          var correction = typeof tjLaserCorrection === "function" ? tjLaserCorrection() : null;
          var out = {};
          var algo = false;
          ["X", "Y", "Z"].forEach(function (L) {
            var v = parseFloat(inp[L].value);
            if (!isFinite(v) || !ax[L]) { out[L] = null; return; } // no value, or the machine has no such axis
            algo = true;
            var m = frame === "machine" ? v : v + (ax[L].machinePosition - ax[L].userPosition);
            if (frame === "machine" && jogPointsEffective(jogMachineMode, apunta) === "laser" && correction && L !== "Z") m += L === "X" ? correction.x : correction.y; // Laser mode only: the beam lands at machine - correction
            out[L] = m;
          });
          return algo ? out : null;
        }
        // sube Z primero, despues X/Y, y al final baja
        function moveA(t) {
          var ax = last && last.ax;
          if (!ax || !jogMachineFree()) return notice(i18nT('jog2.the_machine_isn_t_free'));
          var outside = ["X", "Y", "Z"].filter(function (L) { return t[L] !== null && t[L] !== undefined && ax[L] && (t[L] < ax[L].min - 0.01 || t[L] > ax[L].max + 0.01); });
          if (outside.length) return notice(i18nT('jog2.outside_the_travel', { list: outside.join(", ") }));
          notice("");
          // machines without a Z axis: no raise / lower moves
          var hasZ = !!ax.Z;
          var zNow = hasZ ? ax.Z.machinePosition : null;
          var zEnd = hasZ ? (t.Z !== null && t.Z !== undefined ? t.Z : zNow) : null;
          var zSec = hasZ ? Math.max(zNow, zEnd) : null;
          var f = jogMaxFeedXY(), fz = jogMaxFeedZ();
          var xy = (t.X !== null && t.X !== undefined ? " X" + t.X.toFixed(3) : "") + (t.Y !== null && t.Y !== undefined ? " Y" + t.Y.toFixed(3) : "");
          var queue = Promise.resolve();
          jogGoCodes(jogMachineMode, zSec, xy, zEnd, f, fz).forEach(function (c) { queue = queue.then(function () { return postCode(c); }); });
          queue.catch(function (e) { notice(i18nT('jog2.could_not_move_2', { err: e.message || e })); });
        }
        function irA() {
          var t = destination();
          if (!t) return notice(i18nT('jog2.type_at_least_one_value_x'));
          moveA(t);
        }
        // 4. acciones
        var acc = el("div", "display:grid;grid-template-columns:minmax(0,1fr);gap:4px;");
        root.appendChild(acc);
        var bMore = boton(i18nT('jog2.more'), "", function () {
          var abrir = more.style.display === "none";
          more.style.display = abrir ? "flex" : "none";
          bMore.textContent = abrir ? i18nT('free.less') : i18nT('jog2.more');
          bMore.title = i18nT('jog2.knob_z_home_step_advanced_tabs');
        });
        bMore.title = i18nT('jog2.knob_z_home_step_advanced_tabs');
        acc.appendChild(bMore);
        // nothing to show in "More" (Advanced and the macro buttons turned off in Settings): no button, and the panel stays closed
        function paintMore() {
          var has = typeof o.moreHasSomething === "function" ? o.moreHasSomething() : true;
          bMore.style.display = has ? "" : "none";
          if (!has && more.style.display !== "none") {
            more.style.display = "none";
            bMore.textContent = i18nT('jog2.more');
          }
        }
        paintMore();

        // STOP / E-STOP (those of option 1) at the bottom, and "More" below
        // "Move without limits" (11-free.js) below STOP if it was chosen in Settings >
        // What is shown; otherwise, it stays inside More (2026-10-10)
        // "Move without limits": its chip is in the header (both designs); only the notice box goes under STOP
        if (typeof jogFreeBox !== "undefined" && jogFreeBox) root.appendChild(jogFreeBox);
        if (o.removeRepeated) o.removeRepeated();
        body.appendChild(more);

        var reader = setInterval(function () {
          if (!document.body.contains(body)) return clearInterval(reader);
          if (body.offsetParent === null) return; paintMore(); // minimized or closed panel: nothing; else repaint without the connection
          jogFetchStatus(400).then(function (s) {
            o.posT.update(s);
            paintMore();
            last = o.posT.state();
            jog2Placeholders(inp, last);
            paintSpeed();
          }).catch(function () { /*  the jog already warns if there is no connection */ });
        }, 500);
      }

      // Cruz de 8 direcciones y Z+ / Z- (tocar = un paso, mantener = continuo
      // suave). cfg = {flechas, zBot} de jogControls. null si no va ninguno.
      // o: {stopRow, pasos, getStepIndex()}; H = jog2Helpers().
      function jog2Move(o, H, cfg) {
        if (!cfg.arrows && !cfg.zBot) return null;
        var C = H.C, el = H.el, boton = H.button, botonDoble = H.buttonDouble;
        var move = el("div", "display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1fr);gap:6px;align-items:stretch;");
        var cross = el("div", "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:46px;gap:4px;");
        move.appendChild(cross);
        var colZ = el("div", "display:grid;grid-template-rows:repeat(2,minmax(0,1fr));gap:4px;");
        move.appendChild(colZ);

        var hold = null; // {nx, ny, nz, desde, timer}
        function estadoMovible(axes) {
          if (!jogEnabled) return false;
          jogNotifyWithoutHoming(axes);
          return true;
        }
        function step(nx, ny, nz) {
          var d = o.steps[o.getStepIndex()];
          var parts = [];
          if (nx) parts.push("X" + (nx * d).toFixed(3));
          if (ny) parts.push("Y" + (ny * d).toFixed(3));
          if (nz) parts.push("Z" + (nz * d).toFixed(3));
          if (!parts.length) return;
          var f = nz ? jogMaxFeedZ() : jogMaxFeedXY();
          // one block and in line (the same as option 1): G91 / G1 / G90 together
          jog2Queue = jog2Queue.then(function () {
            return postCode(jogBlockStep(jogMachineMode, parts, f)); // S0 only in Laser mode (09-mode.js)
          }).catch(function (e) { console.error("[WorkshopJog] paso:", e); });
        }
        var jog2Queue = Promise.resolve();
        // BUG 2026-10-10 ("when the axis is released it keeps moving"): with one
        // send every 100 ms there were several POSTs in flight; HTTP does not guarantee
        // order and an "xy" that reached the Pi after the stop (past
        // jog_move's 0.15 s grace) started again until the watchdog
        // (0.9 s). Now: ONE single send in flight at a time, and on release a stop
        // at once, another when the last pending send ends and another
        // as a backup at 300 ms (a repeated stop does nothing).
        var enVuelo = null;
        function send(op, args) {
          if (enVuelo) return; // el anterior no llego: no apilar
          enVuelo = postJogCommand(op, args)
            .catch(function (e) { console.error("[WorkshopJog] jog2:", e); })
            .then(function () { enVuelo = null; });
        }
        function sendHold() {
          if (!hold) return;
          var t = Date.now() - hold.since;
          var m = 0.3 + 0.7 * Math.min(1, t / JOG2_RAMP_MS); // soft start; the system applies the curve
          var F = Math.round(jogSpeedPercent);
          if (hold.nz) send("jog.z", { z: Number((hold.nz * m).toFixed(3)), speed: F });
          else {
            var k = hold.nx && hold.ny ? Math.SQRT1_2 : 1; // diagonal a la misma velocidad
            send("jog.xy", { x: Number((hold.nx * m * k).toFixed(3)), y: Number((hold.ny * m * k).toFixed(3)), speed: F });
          }
        }
        function release() {
          if (!hold) return;
          var h = hold;
          hold = null;
          clearInterval(h.timer);
          var parar = h.nz ? jogSendStopZ : jogSendStopXY;
          parar();
          if (enVuelo) enVuelo.then(function () { if (!hold) parar(); });
          setTimeout(function () { if (!hold) parar(); }, 300);
        }
        // flecha: tocar = paso; mantener > JOG2_HOLD_MS = continuo
        function arrow(text, nx, ny, nz, css) {
          var b = el("button", "min-width:0;padding:0;border-radius:8px;border:none;background:#455a64;color:#fff;font:inherit;font-weight:600;font-size:13px;touch-action:none;cursor:pointer;" + (css || ""), text);
          b.type = "button";
          var pid = null, t0 = 0, wait = null;
          b.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            if (pid !== null || !estadoMovible(nz ? ["Z"] : [nx ? "X" : null, ny ? "Y" : null].filter(Boolean))) return;
            pid = ev.pointerId;
            t0 = Date.now();
            try { b.setPointerCapture(pid); } catch (e) { /* no critico */ }
            b.style.background = C.prim;
            wait = setTimeout(function () {
              wait = null;
              if (pid === null) return;
              // continuous: Y+ on screen is NEGATIVE ny for the backend (the same as the jog's arrows)
              hold = { nx: nx, ny: -ny, nz: nz, since: Date.now(), timer: null };
              sendHold();
              hold.timer = setInterval(sendHold, JOG2_TICK_MS);
            }, JOG2_HOLD_MS);
          });
          function end(ev) {
            if (pid === null || (ev && ev.pointerId !== pid)) return;
            pid = null;
            b.style.background = "#455a64";
            if (wait) {
              clearTimeout(wait);
              wait = null;
              if (Date.now() - t0 < JOG2_HOLD_MS + 50) step(nx, ny, nz);
            }
            release();
          }
          b.addEventListener("pointerup", function (ev) { ev.stopPropagation(); end(ev); });
          b.addEventListener("pointercancel", end);
          b.addEventListener("lostpointercapture", end);
          return b;
        }
        var diag = "background:#37474f;color:" + C.sec + ";font-weight:500;";
        cross.appendChild(arrow("↖", -1, 1, 0, diag));
        cross.appendChild(arrow("Y+", 0, 1, 0));
        cross.appendChild(arrow("↗", 1, 1, 0, diag));
        cross.appendChild(arrow("X-", -1, 0, 0));
        // centre of the cross: "go to the zero X0 Y0 of the active zone" (two taps: it moves the machine; workzero.g
        // raises Z first and leaves it up). The step is in its own row
        var center = el("div", "display:flex;align-items:center;justify-content:center;");
        var bZero = botonDoble("X0 Y0", i18nT('jog2.go_2'), "width:100%;height:100%;min-height:0;padding:0;font-size:11px;font-weight:600;border-color:" + C.prim + ";", function () {
          if (jogBlockedExplain()) return;
          postCode('M98 P"0:/sys/workshop/macros/workzero.g"').catch(function (e) { console.error("[WorkshopJog] go to zero:", e); });
        });
        bZero.title = i18nT('jog2.go_to_zero_xy_help');
        center.appendChild(bZero);
        cross.appendChild(center);
        cross.appendChild(arrow("X+", 1, 0, 0));
        cross.appendChild(arrow("↙", -1, -1, 0, diag));
        cross.appendChild(arrow("Y-", 0, -1, 0));
        cross.appendChild(arrow("↘", 1, -1, 0, diag));
        var zMore = arrow("Z+", 0, 0, 1);
        var zMenos = arrow("Z-", 0, 0, -1);
        colZ.appendChild(zMore);
        colZ.appendChild(zMenos);
        // the jog's STOP also cuts a hold of option 2
        o.stopRow.addEventListener("pointerdown", release, true);
        // changing tab or window with the button pressed: release
        window.addEventListener("blur", release);
        document.addEventListener("visibilitychange", function () { if (document.hidden) release(); });
        if (!cfg.arrows) {
          cross.style.display = "none";
          move.style.gridTemplateColumns = "minmax(0,1fr)";
        }
        if (!cfg.zBot) {
          colZ.style.display = "none";
          move.style.gridTemplateColumns = "minmax(0,1fr)";
        }
        return { move: move, colZ: colZ, release: release };
      }
