      // ---- Advanced section: control per axis and per mode (docs-internal/JOG-ADVANCED.md) ----
      //
      // ONE section for every mode (modos: []). Inside it the panels are chosen by the machine mode, so each mode sees
      // only its own (a mode never shows what belongs to another one; an unknown mode only gets the general panel):
      //   every mode : one row per axis of the model (extra axes included): position, - / + by the chosen step, release
      //   FFF        : heaters (current / target, set, off), extrude / retract, fans
      //   CNC        : spindle (state, rpm, M3 / M4, M5, live rpm) and tool change
      //   Laser      : pointer / laser choice. There is NO fire button: the jog never turns the laser on from here.
      // Everything that moves, heats or spins goes through ctx.send with mueve:true (double tap). Turning something OFF
      // (M104 S0, M140 S0, M5) goes with { apagar: true } and a single tap. The pure parts (panels per mode, code
      // construction, safety limits) are tested in tests/jog-axis-control.test.js. Needs 09-mode.js (jogBlockStep).

      var JOG_CE_FEED_FALLBACK = 300; // mm/min for an axis whose model gives no maximum speed (at 100 %)
      var JOG_CE_STEP_MAX = 1000; // largest step accepted (mm)
      var JOG_CE_TEMP_SANE = 500; // absolute ceiling when the model gives no maximum for a heater
      var JOG_CE_EXTRUDE_MAX = 100; // largest single extrusion / retraction (mm)
      var JOG_CE_COLD_DEFAULT = 160; // RRF default of heat.coldExtrudeTemperature, used only if the model omits it
      var JOG_CE_EXTRUDE_FEED_DEFAULT = 5; // mm/s offered in the extruder panel

      // Panels the section shows for a mode. Unknown / missing mode: only the general one.
      function jogCePanels(mode) {
        var m = jogModeKnown(mode);
        var out = ["axes"];
        if (m === "FFF") out.push("fff");
        else if (m === "CNC") out.push("cnc");
        else if (m === "Laser") out.push("laser");
        return out;
      }

      function jogCeNum(v) {
        return typeof v === "number" && isFinite(v) ? v : null;
      }

      // ---- axes ----

      function jogCeLetterOk(letter) {
        return typeof letter === "string" && /^[A-Za-z]$/.test(letter);
      }

      // Feed in mm/min for an axis: its model maximum speed (mm/s) times the chosen fraction (0..100 %), never above the
      // maximum. Without a maximum in the model: JOG_CE_FEED_FALLBACK times the fraction.
      function jogCeFeedAxis(speedMax, pct) {
        var p = Number(pct);
        if (!isFinite(p) || p <= 0) p = 25;
        if (p > 100) p = 100;
        var v = jogCeNum(speedMax);
        var cap = v !== null && v > 0 ? v * 60 : JOG_CE_FEED_FALLBACK;
        return Math.max(1, Math.round((cap * p) / 100));
      }

      function jogCeStepOk(step) {
        var s = Number(step);
        return isFinite(s) && s > 0 && s <= JOG_CE_STEP_MAX;
      }

      // { ok, motivo (i18n key suffix) }: the step must be valid and, if the axis has limits and its position is known,
      // must not leave the range (a move back toward the range is always allowed).
      function jogCeCheckMove(axis, sign, step) {
        if (!axis || !jogCeLetterOk(axis.letter)) return { ok: false, reason: "axis_invalid" };
        if (!jogCeStepOk(step)) return { ok: false, reason: "step_invalid" };
        var delta = (sign < 0 ? -1 : 1) * Number(step);
        var pos = jogCeNum(axis.machine), mn = jogCeNum(axis.min), mx = jogCeNum(axis.max);
        if (pos !== null) {
          if (mn !== null && delta < 0 && pos + delta < mn - 1e-6) return { ok: false, reason: "over_limit" };
          if (mx !== null && delta > 0 && pos + delta > mx + 1e-6) return { ok: false, reason: "over_limit" };
        }
        return { ok: true };
      }

      // G91 / G1 / G90 as one block; S0 is added by jogBlockStep only in Laser mode.
      function jogCeCodeMove(mode, letter, sign, step, feed) {
        if (!jogCeLetterOk(letter) || !jogCeStepOk(step)) return "";
        var d = (sign < 0 ? -1 : 1) * Number(step);
        return jogBlockStep(mode, [letter.toUpperCase() + d.toFixed(3)], feed);
      }

      // "Release this axis": the same operation of the service as the Motors page (motors.disable, level 4 confirmation: the axis loses its
      // homing and a vertical one can drop). Arguments of the call, or null for a letter that is not an axis.
      function jogCeReleaseArgs(letter) {
        return jogCeLetterOk(letter) ? { axes: [letter.toUpperCase()] } : null;
      }

      // ---- FFF: heaters, extruder, fans ----

      // Heaters that belong to a tool, to the bed or to the chamber, in that order:
      // [{kind: "tool"|"bed"|"chamber", n (tool number / bed or chamber index), idx (heater), current, state, target, max}]
      function jogCeHeaters(st) {
        var heat = st && st.heat, hs = heat && heat.heaters;
        if (!Array.isArray(hs)) return [];
        var out = [], used = {};
        function add(kind, n, idx) {
          var h = typeof idx === "number" ? hs[idx] : null;
          if (!h || used[idx]) return;
          used[idx] = true;
          var estado = h.state;
          out.push({
            kind: kind,
            n: n,
            idx: idx,
            current: jogCeNum(h.current),
            state: estado,
            target: estado === "active" ? jogCeNum(h.active) : estado === "standby" ? jogCeNum(h.standby) : 0,
            max: jogCeNum(h.max),
          });
        }
        (Array.isArray(st.tools) ? st.tools : []).forEach(function (t) {
          if (t && Array.isArray(t.heaters)) t.heaters.forEach(function (i) { add("tool", t.number, i); });
        });
        (Array.isArray(heat.bedHeaters) ? heat.bedHeaters : []).forEach(function (i, p) { add("bed", p, i); });
        (Array.isArray(heat.chamberHeaters) ? heat.chamberHeaters : []).forEach(function (i, p) { add("chamber", p, i); });
        return out;
      }

      // { ok, motivo }: a target must be > 0 and not above the model maximum of that heater (or the absolute ceiling).
      function jogCeCheckTemp(cal, t) {
        var v = Number(t);
        if (!cal || !isFinite(v) || v <= 0) return { ok: false, reason: "temp_invalid" };
        var cap = cal.max !== null && cal.max !== undefined && cal.max > 0 ? cal.max : JOG_CE_TEMP_SANE;
        if (v > cap) return { ok: false, reason: "temp_over_max", max: cap };
        return { ok: true };
      }

      // M104 T<tool> S<t> | M140 P<bed> S<t> | M141 P<chamber> S<t>. "" if the target is not valid.
      function jogCeCodeTemp(cal, t) {
        if (!jogCeCheckTemp(cal, t).ok) return "";
        return jogCeCodeTempBase(cal, Math.round(Number(t)));
      }
      // Same with S0 (heater off): always valid.
      function jogCeCodeTempOff(cal) {
        return cal ? jogCeCodeTempBase(cal, 0) : "";
      }
      function jogCeCodeTempBase(cal, s) {
        if (cal.kind === "tool") return "M104 T" + cal.n + " S" + s;
        if (cal.kind === "bed") return "M140 P" + cal.n + " S" + s;
        if (cal.kind === "chamber") return "M141 P" + cal.n + " S" + s;
        return "";
      }

      // Can the CURRENT tool extrude? Only its own extruders move with G1 E, so the tool must be selected. All its heaters
      // must be at or above heat.coldExtrudeTemperature. Returns { ok, motivo, tool, extruder, min, temp }.
      function jogCeExtrusion(st) {
        var cur = st && st.state ? st.state.currentTool : null;
        if (typeof cur !== "number" || cur < 0) return { ok: false, reason: "no_tool" };
        var tool = (Array.isArray(st.tools) ? st.tools : []).filter(function (t) { return t && t.number === cur; })[0];
        if (!tool) return { ok: false, reason: "no_tool" };
        if (!Array.isArray(tool.extruders) || !tool.extruders.length) return { ok: false, reason: "no_extruder" };
        var hs = st.heat && Array.isArray(st.heat.heaters) ? st.heat.heaters : [];
        if (!Array.isArray(tool.heaters) || !tool.heaters.length) return { ok: false, reason: "no_heater" };
        var min = jogCeNum(st.heat && st.heat.coldExtrudeTemperature);
        if (min === null) min = JOG_CE_COLD_DEFAULT;
        var temp = null;
        for (var i = 0; i < tool.heaters.length; i++) {
          var h = hs[tool.heaters[i]];
          var c = h ? jogCeNum(h.current) : null;
          if (c === null || h.state === "fault" || h.state === "offline") return { ok: false, reason: "heater_fault", tool: cur };
          if (temp === null || c < temp) temp = c;
        }
        if (temp < min) return { ok: false, reason: "cold", tool: cur, min: min, temp: temp };
        return { ok: true, tool: cur, extruder: tool.extruders[0], min: min, temp: temp };
      }

      // Extruder speed limit in mm/s from move.extruders[n].speed, or null.
      function jogCeSpeedExtruder(st, ext) {
        var l = st && st.move && Array.isArray(st.move.extruders) ? st.move.extruders : [];
        var e = l[ext];
        var v = e ? jogCeNum(e.speed) : null;
        return v !== null && v > 0 ? v : null;
      }

      // Extrusion mode of the HTTP input (where the jog sends code) so it can be restored: "M83" | "M82".
      // The model does not say it for sure on every firmware: unknown = M82, the RRF default.
      function jogCeRestoreMode(st) {
        var ins = st && Array.isArray(st.inputs) ? st.inputs : [];
        var http = ins.filter(function (i) { return i && i.name === "HTTP"; })[0];
        return http && http.drivesRelative === true ? "M83" : "M82";
      }

      // dir = +1 extrude, -1 retract. Amount (mm) and speed (mm/s) are limited: speed never above the extruder maximum of
      // the model. Returns { ok, motivo, code }.
      function jogCeCodeExtrude(st, dir, mm, speedMmS) {
        var chk = jogCeExtrusion(st);
        if (!chk.ok) return { ok: false, reason: chk.reason, min: chk.min, temp: chk.temp };
        var a = Number(mm);
        if (!isFinite(a) || a <= 0 || a > JOG_CE_EXTRUDE_MAX) return { ok: false, reason: "amount_invalid" };
        var v = Number(speedMmS);
        if (!isFinite(v) || v <= 0) return { ok: false, reason: "speed_invalid" };
        var cap = jogCeSpeedExtruder(st, chk.extruder);
        if (cap !== null && v > cap) v = cap;
        var f = Math.max(1, Math.round(v * 60));
        return { ok: true, code: "M83\nG1 E" + (dir < 0 ? "-" : "") + a.toFixed(2) + " F" + f + "\n" + jogCeRestoreMode(st) };
      }

      // Fans of the model: [{n, valor (0..1) | null}].
      function jogCeFans(st) {
        var f = st && Array.isArray(st.fans) ? st.fans : [];
        var out = [];
        f.forEach(function (x, n) {
          if (x) out.push({ n: n, value: jogCeNum(x.requestedValue), name: typeof x.name === "string" ? x.name : "" });
        });
        return out;
      }
      // M106 P<n> S<0..1>; the value is clamped.
      function jogCeCodeFan(n, frac) {
        var v = Number(frac);
        if (!isFinite(v) || typeof n !== "number" || n < 0) return "";
        return "M106 P" + n + " S" + Math.min(1, Math.max(0, v)).toFixed(2);
      }

      // ---- CNC: spindle and tool ----

      // Spindles of the model (top level `spindles`, or state.spindles): [{idx, state, active, current, min, max}].
      function jogCeSpindles(st) {
        var l = st && Array.isArray(st.spindles) ? st.spindles : st && st.state && Array.isArray(st.state.spindles) ? st.state.spindles : [];
        var out = [];
        l.forEach(function (s, idx) {
          if (!s) return;
          out.push({ idx: idx, state: s.state, active: jogCeNum(s.active), current: jogCeNum(s.current), min: jogCeNum(s.min), max: jogCeNum(s.max) });
        });
        return out;
      }

      // { ok, motivo }: the rpm must be > 0, not above the configured maximum of the spindle and not below its minimum.
      // A spindle whose model gives no maximum is refused (the limit cannot be checked).
      function jogCeCheckRpm(sp, rpm) {
        var v = Number(rpm);
        if (!sp || !isFinite(v) || v <= 0) return { ok: false, reason: "rpm_invalid" };
        if (sp.max === null || sp.max === undefined || !(sp.max > 0)) return { ok: false, reason: "rpm_no_limit" };
        if (v > sp.max) return { ok: false, reason: "rpm_over_max", max: sp.max };
        if (sp.min !== null && sp.min !== undefined && sp.min > 0 && v < sp.min) return { ok: false, reason: "rpm_under_min", min: sp.min };
        return { ok: true };
      }
      // dir "fwd" -> M3, "rev" -> M4: "M3 P<spindle> S<rpm>".
      function jogCeCodeSpindle(sp, dir, rpm) {
        if (!jogCeCheckRpm(sp, rpm).ok) return "";
        return (dir === "rev" ? "M4" : "M3") + " P" + sp.idx + " S" + Math.round(Number(rpm));
      }
      function jogCeCodeSpindleOff(sp) {
        return sp ? "M5 P" + sp.idx : "";
      }
      // Live rpm change keeps the direction the spindle runs in (M3 on a reverse spindle would flip it). "" if stopped.
      function jogCeCodeRpmLive(sp, rpm) {
        if (!sp || (sp.state !== "forward" && sp.state !== "reverse")) return "";
        return jogCeCodeSpindle(sp, sp.state === "reverse" ? "rev" : "fwd", rpm);
      }
      function jogCeCodeTool(n) {
        var v = Number(n);
        return isFinite(v) && v >= 0 && Math.floor(v) === v ? "T" + v : "";
      }
      function jogCeTools(st) {
        return (st && Array.isArray(st.tools) ? st.tools : [])
          .filter(function (t) { return t && typeof t.number === "number"; })
          .map(function (t) { return t.number; });
      }

      // ---- Laser: pointer / laser ----
      // { apunta: "puntero"|"laser" (effective), corr: {x, y} | null }. Only Laser mode has the choice.
      function jogCeLaserInfo(mode, apunta, correction) {
        var ef = jogPointsEffective(mode, apunta);
        var c = correction && isFinite(correction.x) && isFinite(correction.y) ? { x: correction.x, y: correction.y } : null;
        return { points: ef, correction: ef === "laser" ? c : null, has: jogHasPoints(mode) };
      }

      // ---- screen ----

      function jogCeEl(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text !== undefined) e.textContent = text;
        return e;
      }
      var JOG_CE_BTN = "min-width:36px;padding:0 8px;font-size:12px;";
      var JOG_CE_INP = "min-height:30px;width:64px;box-sizing:border-box;border-radius:6px;border:1px solid rgba(255,255,255,0.25);background:rgba(0,0,0,0.25);color:#eceff1;font-size:12px;padding:0 6px;";
      function jogCeBtn(text, fn) {
        var b = jogCeEl("button", JOG_CE_BTN, text);
        b.className = "wf-btn";
        b.type = "button";
        b.addEventListener("click", fn);
        return b;
      }
      function jogCeEnable(b, ok, reason) {
        b.disabled = !ok;
        b.style.opacity = ok ? "1" : "0.4";
        b.title = ok ? "" : reason || "";
      }
      function jogCeTitle(text) {
        return jogCeEl("div", "font-size:11px;font-weight:bold;color:#b0bec5;margin-top:4px;", text);
      }
      function jogCeRow() {
        return jogCeEl("div", "display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%;");
      }
      function jogCeReason(ctx, k, p) {
        return ctx.i18n("avAxis.why_" + k, p);
      }
      // OFF is always allowed by intent. ctx.send refuses any code when the machine is not free, so a refused OFF is
      // reported in the panel with the way out (see docs-internal/JOG-ADVANCED.md, "Apagar con bloqueos").
      function jogCePowerOff(ctx, codigo, note) {
        if (!codigo) return;
        ctx.send(codigo, { moves: false, poweroff: true }).then(function (r) {
          if (r && r.state === "blocked") {
            note.textContent = ctx.i18n("avAxis.off_blocked", { code: codigo.split("\n")[0] });
            ctx.record(note.textContent, "notice");
          } else {
            note.textContent = "";
          }
        });
      }

      // General panel: one row per axis of the model.
      function jogCePanelAxes(ctx) {
        var root = jogCeEl("div", "display:flex;flex-direction:column;gap:4px;width:100%;");
        root.appendChild(jogCeTitle(ctx.i18n("avAxis.axes_title")));
        var bar = jogCeRow();
        var selStep = jogCeEl("select", JOG_CE_INP + "width:90px;");
        var selSpeed = jogCeEl("select", JOG_CE_INP + "width:80px;");
        [10, 25, 50, 100].forEach(function (p) {
          var o = jogCeEl("option", "", p + " %");
          o.value = String(p);
          if (p === 25) o.selected = true;
          selSpeed.appendChild(o);
        });
        bar.appendChild(jogCeEl("span", "font-size:11px;color:#b0bec5;", ctx.i18n("avAxis.step")));
        bar.appendChild(selStep);
        bar.appendChild(jogCeEl("span", "font-size:11px;color:#b0bec5;", ctx.i18n("avAxis.speed")));
        bar.appendChild(selSpeed);
        root.appendChild(bar);
        var items = jogCeEl("div", "display:flex;flex-direction:column;gap:4px;width:100%;");
        root.appendChild(items);
        var note = jogCeEl("div", "font-size:11px;color:#ffb74d;");
        root.appendChild(note);
        var signature = "", rows = {}, stepsSignature = "";

        function axisCurrent(letter) {
          return ctx.axes().filter(function (e) { return e.letter === letter; })[0] || null;
        }
        function move(letter, sign) {
          var e = axisCurrent(letter);
          var step = Number(selStep.value);
          var chk = jogCeCheckMove(e, sign, step);
          if (!chk.ok) {
            note.textContent = jogCeReason(ctx, chk.reason);
            return;
          }
          note.textContent = "";
          var feed = jogCeFeedAxis(e.speedMax, Number(selSpeed.value));
          var txt = letter + " " + (sign < 0 ? "-" : "+") + step;
          ctx.send(jogCeCodeMove(ctx.state().mode, letter, sign, step, feed), { moves: true, confirm: txt });
        }
        function armRows(axes) {
          items.textContent = "";
          rows = {};
          if (!axes.length) {
            items.appendChild(jogCeEl("div", "font-size:11px;color:#b0bec5;", ctx.i18n("avAxis.no_axes")));
            return;
          }
          axes.forEach(function (e) {
            var f = jogCeRow();
            f.appendChild(jogCeEl("span", "font-weight:bold;width:18px;color:#eceff1;", e.letter));
            var pos = jogCeEl("span", "font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px;min-width:64px;color:#eceff1;", "--");
            f.appendChild(pos);
            f.appendChild(jogCeBtn("-", function () { move(e.letter, -1); }));
            f.appendChild(jogCeBtn("+", function () { move(e.letter, 1); }));
            f.appendChild(jogCeBtn(ctx.i18n("avAxis.release"), function () {
              var args = jogCeReleaseArgs(e.letter);
              if (!args) return;
              // workshopApi asks for the confirmation of the service (level 4) with its own dialog; a cancel is not an error
              workshopApi("motors.disable", args).then(
                function () { ctx.record(ctx.i18n("avAxis.release_done", { axis: e.letter }), "info"); },
                function (err) { if (!err || err.code !== "cancelled") ctx.record(String((err && err.message) || err), "error"); }
              );
            }));
            items.appendChild(f);
            rows[e.letter] = pos;
          });
        }
        function sync() {
          var axes = ctx.axes().filter(function (e) { return jogCeLetterOk(e.letter); });
          var f = axes.map(function (e) { return e.letter; }).join(",");
          if (f !== signature) {
            signature = f;
            armRows(axes);
          }
          var pf = ctx.steps().join(",");
          if (pf !== stepsSignature) {
            stepsSignature = pf;
            var ant = selStep.value;
            selStep.textContent = "";
            ctx.steps().filter(jogCeStepOk).sort(function (a, b) { return a - b; }).forEach(function (p) {
              var o = jogCeEl("option", "", p + " mm");
              o.value = String(p);
              selStep.appendChild(o);
            });
            if (ant) selStep.value = ant;
          }
          axes.forEach(function (e) {
            if (rows[e.letter]) rows[e.letter].textContent = jogCeNum(e.user) !== null ? e.user.toFixed(2) : "--";
          });
        }
        return { el: root, update: sync, destroy: function () {} };
      }

      // FFF panel: heaters, extruder, fans.
      function jogCePanelFFF(ctx) {
        var root = jogCeEl("div", "display:flex;flex-direction:column;gap:4px;width:100%;");
        root.appendChild(jogCeTitle(ctx.i18n("avAxis.heaters_title")));
        var items = jogCeEl("div", "display:flex;flex-direction:column;gap:4px;width:100%;");
        root.appendChild(items);
        var note = jogCeEl("div", "font-size:11px;color:#ffb74d;");
        root.appendChild(note);
        root.appendChild(jogCeTitle(ctx.i18n("avAxis.extruder_title")));
        var fe = jogCeRow();
        var inMm = jogCeEl("input", JOG_CE_INP);
        inMm.type = "number"; inMm.min = "0"; inMm.max = String(JOG_CE_EXTRUDE_MAX); inMm.step = "1"; inMm.value = "5";
        var inSpeed = jogCeEl("input", JOG_CE_INP);
        inSpeed.type = "number"; inSpeed.min = "0"; inSpeed.step = "1"; inSpeed.value = String(JOG_CE_EXTRUDE_FEED_DEFAULT);
        fe.appendChild(jogCeEl("span", "font-size:11px;color:#b0bec5;", ctx.i18n("avAxis.amount_mm")));
        fe.appendChild(inMm);
        fe.appendChild(jogCeEl("span", "font-size:11px;color:#b0bec5;", ctx.i18n("avAxis.speed_mms")));
        fe.appendChild(inSpeed);
        root.appendChild(fe);
        var fb = jogCeRow();
        var noteE = jogCeEl("div", "font-size:11px;color:#ffb74d;");
        function extruir(dir) {
          var r = jogCeCodeExtrude(ctx.state().status, dir, inMm.value, inSpeed.value);
          if (!r.ok) { noteE.textContent = jogCeReason(ctx, r.reason, { min: r.min, temp: r.temp }); return; }
          noteE.textContent = "";
          ctx.send(r.code, { moves: true, confirm: (dir < 0 ? ctx.i18n("avAxis.retract") : ctx.i18n("avAxis.extrude")) + " " + inMm.value + " mm" });
        }
        var bExt = jogCeBtn(ctx.i18n("avAxis.extrude"), function () { extruir(1); });
        var bRet = jogCeBtn(ctx.i18n("avAxis.retract"), function () { extruir(-1); });
        fb.appendChild(bExt);
        fb.appendChild(bRet);
        root.appendChild(fb);
        root.appendChild(noteE);
        root.appendChild(jogCeTitle(ctx.i18n("avAxis.fans_title")));
        var vents = jogCeEl("div", "display:flex;flex-direction:column;gap:4px;width:100%;");
        root.appendChild(vents);

        var signatureC = "", rowsC = {}, signatureV = "";
        function armCal(cals) {
          items.textContent = "";
          rowsC = {};
          if (!cals.length) items.appendChild(jogCeEl("div", "font-size:11px;color:#b0bec5;", ctx.i18n("avAxis.no_heaters")));
          cals.forEach(function (c) {
            var f = jogCeRow();
            var nom = c.kind === "tool" ? ctx.i18n("avAxis.heater_tool", { n: c.n }) : c.kind === "bed" ? ctx.i18n("avAxis.heater_bed", { n: c.n }) : ctx.i18n("avAxis.heater_chamber", { n: c.n });
            f.appendChild(jogCeEl("span", "min-width:70px;font-size:12px;color:#eceff1;", nom));
            var val = jogCeEl("span", "font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px;min-width:84px;color:#eceff1;", "--");
            f.appendChild(val);
            var inp = jogCeEl("input", JOG_CE_INP);
            inp.type = "number"; inp.min = "0"; inp.step = "5";
            if (c.max !== null) inp.max = String(c.max);
            f.appendChild(inp);
            f.appendChild(jogCeBtn(ctx.i18n("avAxis.set"), function () {
              var current = jogCeHeaters(ctx.state().status).filter(function (x) { return x.idx === c.idx; })[0] || c;
              var chk = jogCeCheckTemp(current, inp.value);
              if (!chk.ok) { note.textContent = jogCeReason(ctx, chk.reason, { max: chk.max }); return; }
              note.textContent = "";
              ctx.send(jogCeCodeTemp(current, inp.value), { moves: true, confirm: nom + " " + Math.round(Number(inp.value)) });
            }));
            f.appendChild(jogCeBtn(ctx.i18n("avAxis.off"), function () { jogCePowerOff(ctx, jogCeCodeTempOff(c), note); }));
            items.appendChild(f);
            rowsC[c.idx] = val;
          });
        }
        function armarVent(vs) {
          vents.textContent = "";
          if (!vs.length) vents.appendChild(jogCeEl("div", "font-size:11px;color:#b0bec5;", ctx.i18n("avAxis.no_fans")));
          vs.forEach(function (v) {
            var f = jogCeRow();
            f.appendChild(jogCeEl("span", "min-width:70px;font-size:12px;color:#eceff1;", v.name || ctx.i18n("avAxis.fan_n", { n: v.n })));
            var sl = jogCeEl("input", "flex:1 1 80px;min-width:60px;");
            sl.type = "range"; sl.min = "0"; sl.max = "100"; sl.step = "5"; sl.value = v.value !== null ? String(Math.round(v.value * 100)) : "0";
            var pc = jogCeEl("span", "font-size:11px;min-width:34px;color:#b0bec5;", sl.value + " %");
            sl.addEventListener("input", function () { pc.textContent = sl.value + " %"; });
            sl.addEventListener("change", function () { ctx.send(jogCeCodeFan(v.n, Number(sl.value) / 100), { moves: false }); });
            f.appendChild(sl);
            f.appendChild(pc);
            f.appendChild(jogCeBtn(ctx.i18n("avAxis.off"), function () {
              sl.value = "0";
              pc.textContent = "0 %";
              ctx.send(jogCeCodeFan(v.n, 0), { moves: false, poweroff: true });
            }));
            vents.appendChild(f);
          });
        }
        function sync() {
          var st = ctx.state().status;
          var cals = jogCeHeaters(st);
          var fc = cals.map(function (c) { return c.kind + c.n + ":" + c.idx; }).join(",");
          if (fc !== signatureC) { signatureC = fc; armCal(cals); }
          cals.forEach(function (c) {
            if (rowsC[c.idx]) rowsC[c.idx].textContent = (c.current !== null ? c.current.toFixed(1) : "--") + " / " + (c.target ? Math.round(c.target) : "off");
          });
          var fv = jogCeFans(st).map(function (v) { return v.n; }).join(",");
          if (fv !== signatureV) { signatureV = fv; armarVent(jogCeFans(st)); }
          var chk = jogCeExtrusion(st);
          var why = chk.ok ? "" : jogCeReason(ctx, chk.reason, { min: chk.min, temp: chk.temp });
          jogCeEnable(bExt, chk.ok, why);
          jogCeEnable(bRet, chk.ok, why);
          noteE.textContent = why;
        }
        return { el: root, update: sync, destroy: function () {} };
      }

      // CNC panel: spindle and tool.
      function jogCePanelCNC(ctx) {
        var root = jogCeEl("div", "display:flex;flex-direction:column;gap:4px;width:100%;");
        root.appendChild(jogCeTitle(ctx.i18n("avAxis.spindle_title")));
        var stateThe = jogCeEl("div", "font-size:12px;color:#eceff1;", "--");
        root.appendChild(stateThe);
        var f1 = jogCeRow();
        var selSp = jogCeEl("select", JOG_CE_INP + "width:80px;");
        var inRpm = jogCeEl("input", JOG_CE_INP + "width:80px;");
        inRpm.type = "number"; inRpm.min = "0"; inRpm.step = "100";
        f1.appendChild(selSp);
        f1.appendChild(jogCeEl("span", "font-size:11px;color:#b0bec5;", "rpm"));
        f1.appendChild(inRpm);
        root.appendChild(f1);
        var note = jogCeEl("div", "font-size:11px;color:#ffb74d;");
        function chosen() {
          var l = jogCeSpindles(ctx.state().status);
          var i = Number(selSp.value);
          return l.filter(function (s) { return s.idx === i; })[0] || null;
        }
        function turn_on(dir) {
          var sp = chosen();
          var chk = jogCeCheckRpm(sp, inRpm.value);
          if (!chk.ok) { note.textContent = jogCeReason(ctx, chk.reason, { max: chk.max, min: chk.min }); return; }
          note.textContent = "";
          ctx.send(jogCeCodeSpindle(sp, dir, inRpm.value), { moves: true, confirm: (dir === "rev" ? "M4 " : "M3 ") + inRpm.value + " rpm" });
        }
        var f2 = jogCeRow();
        f2.appendChild(jogCeBtn("M3", function () { turn_on("fwd"); }));
        f2.appendChild(jogCeBtn("M4", function () { turn_on("rev"); }));
        var bLive = jogCeBtn(ctx.i18n("avAxis.rpm_live"), function () {
          var sp = chosen();
          var chk = jogCeCheckRpm(sp, inRpm.value);
          var code = jogCeCodeRpmLive(sp, inRpm.value);
          if (!chk.ok || !code) { note.textContent = jogCeReason(ctx, chk.ok ? "spindle_stopped" : chk.reason, { max: chk.max, min: chk.min }); return; }
          note.textContent = "";
          ctx.send(code, { moves: true, confirm: inRpm.value + " rpm" });
        });
        f2.appendChild(bLive);
        f2.appendChild(jogCeBtn(ctx.i18n("avAxis.stop_spindle"), function () { jogCePowerOff(ctx, jogCeCodeSpindleOff(chosen()), note); }));
        root.appendChild(f2);
        root.appendChild(note);
        root.appendChild(jogCeTitle(ctx.i18n("avAxis.tool_title")));
        var herrEl = jogCeEl("div", "font-size:12px;color:#eceff1;", "--");
        root.appendChild(herrEl);
        var f3 = jogCeRow();
        var selT = jogCeEl("select", JOG_CE_INP + "width:80px;");
        f3.appendChild(selT);
        f3.appendChild(jogCeBtn(ctx.i18n("avAxis.change_tool"), function () {
          var code = jogCeCodeTool(selT.value);
          if (!code) return;
          ctx.send(code, { moves: true, confirm: code });
        }));
        root.appendChild(f3);
        root.appendChild(jogCeEl("div", "font-size:10px;color:#b0bec5;", ctx.i18n("avAxis.tool_hint")));

        var signatureS = "", signatureT = "";
        function sync() {
          var st = ctx.state().status;
          var sps = jogCeSpindles(st);
          var fs = sps.map(function (s) { return s.idx; }).join(",");
          if (fs !== signatureS) {
            signatureS = fs;
            var ant = selSp.value;
            selSp.textContent = "";
            sps.forEach(function (s) { var o = jogCeEl("option", "", "P" + s.idx); o.value = String(s.idx); selSp.appendChild(o); });
            if (ant) selSp.value = ant;
          }
          var sp = chosen();
          var runs = !!sp && (sp.state === "forward" || sp.state === "reverse");
          stateThe.textContent = sp
            ? ctx.i18n("avAxis.spindle_" + (runs ? sp.state : "stopped")) + "  " + (sp.current !== null ? Math.round(sp.current) : "--") + " / " + (sp.max !== null ? Math.round(sp.max) : "--") + " rpm"
            : ctx.i18n("avAxis.no_spindle");
          jogCeEnable(bLive, runs, ctx.i18n("avAxis.why_spindle_stopped"));
          var tl = jogCeTools(st);
          var ft = tl.join(",");
          if (ft !== signatureT) {
            signatureT = ft;
            selT.textContent = "";
            tl.forEach(function (n) { var o = jogCeEl("option", "", "T" + n); o.value = String(n); selT.appendChild(o); });
          }
          var cur = st && st.state ? st.state.currentTool : null;
          herrEl.textContent = ctx.i18n("avAxis.current_tool", { n: typeof cur === "number" && cur >= 0 ? "T" + cur : "--" });
        }
        return { el: root, update: sync, destroy: function () {} };
      }

      // Laser panel: pointer / laser. No fire button on purpose.
      function jogCePanelLaser(ctx) {
        var root = jogCeEl("div", "display:flex;flex-direction:column;gap:4px;width:100%;");
        root.appendChild(jogCeTitle(ctx.i18n("avAxis.aim_title")));
        var row = jogCeRow();
        var bP = jogCeBtn(ctx.i18n("avAxis.aim_pointer"), function () { put("pointer"); });
        var bL = jogCeBtn(ctx.i18n("avAxis.aim_laser"), function () { put("laser"); });
        row.appendChild(bP);
        row.appendChild(bL);
        root.appendChild(row);
        var correctionThe = jogCeEl("div", "font-size:11px;color:#b0bec5;");
        root.appendChild(correctionThe);
        root.appendChild(jogCeEl("div", "font-size:10px;color:#b0bec5;", ctx.i18n("avAxis.no_fire")));
        function current() {
          return typeof jog2Get === "function" ? jog2Get("workshopJog2Points", "pointer") : "pointer";
        }
        function put(v) {
          if (typeof jog2Set === "function") jog2Set("workshopJog2Points", v);
          sync();
        }
        function sync() {
          var correction = typeof tjLaserCorrection === "function" ? tjLaserCorrection() : null;
          var info = jogCeLaserInfo(ctx.state().mode, current(), correction);
          [[bP, info.points === "pointer"], [bL, info.points === "laser"]].forEach(function (x) {
            x[0].style.background = x[1] ? "#1976d2" : "rgba(255,255,255,0.08)";
          });
          correctionThe.textContent = info.correction ? ctx.i18n("avAxis.correction", { x: info.correction.x.toFixed(2), y: info.correction.y.toFixed(2) }) : ctx.i18n("avAxis.no_correction");
        }
        sync();
        return { el: root, update: sync, destroy: function () {} };
      }

      var JOG_CE_FACTORIES = { axes: jogCePanelAxes, fff: jogCePanelFFF, cnc: jogCePanelCNC, laser: jogCePanelLaser };

      jogRegisterSectionAdvanced({
        id: "control_axis",
        title: "avAxis.title",
        icon: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
        modes: [],
        order: 40,
        mount: function (ctx) {
          var active = {}; // panel name -> api { el, actualizar, destruir }
          function safe(fn) {
            try { fn(); } catch (e) { ctx.record("control_axis: " + (e && e.message ? e.message : e), "error"); }
          }
          // Panels follow the mode: the ones of another mode are destroyed and removed, the missing ones are created.
          function sync() {
            var want = jogCePanels(ctx.state().mode);
            Object.keys(active).forEach(function (k) {
              if (want.indexOf(k) >= 0) return;
              safe(function () { active[k].destroy(); });
              if (active[k].el.parentNode) active[k].el.parentNode.removeChild(active[k].el);
              delete active[k];
            });
            want.forEach(function (k) {
              if (active[k]) return;
              safe(function () {
                var api = JOG_CE_FACTORIES[k](ctx);
                active[k] = api;
                ctx.container.appendChild(api.el);
              });
            });
          }
          function paint(status) {
            sync();
            Object.keys(active).forEach(function (k) { safe(function () { active[k].update(status); }); });
          }
          return {
            render: function () { paint(ctx.state().status); },
            update: paint,
            destroy: function () {
              Object.keys(active).forEach(function (k) { safe(function () { active[k].destroy(); }); });
              active = {};
            },
          };
        },
      });
