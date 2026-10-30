      // ---- Advanced tab: registry of sections (API in docs-internal/JOG-ADVANCED.md) ----
      //
      // The Advanced tab is a list of collapsible sections that other files register with
      // jogRegisterSectionAdvanced(). This file holds the registry, the in-memory log of the jog, the single way a
      // section may send G-code (with the same blocks as the rest of the jog) and the tab itself. The pure parts
      // (registry order / mode filter, settings cleaning, send decision, log) are tested in tests/jog-advanced.test.js.

      var JOG_AV_LOG_MAX = 200;
      var JOG_AV_ARMED_MS = 4000; // a moving code sent from a section needs a second tap within this time
      var jogAvLog = []; // [{t: ms, texto, nivel: "info" | "aviso" | "error"}], oldest first
      var jogAvDefs = []; // registered sections
      var jogAvChangeHook = null; // set by the tab: repaint when the registry changes
      var jogAvLogHook = null; // set by the log section: repaint when a line is added
      var jogAjAv = { ocultas: [], order: [] }; // user choice (0:/sys/workshop/config/jog.json, key "avanzado")

      function jogAvRecord(text, level) {
        if (level !== "notice" && level !== "error") level = "info";
        jogAvLog.push({ t: Date.now(), text: String(text === undefined || text === null ? "" : text).slice(0, 400), level: level });
        while (jogAvLog.length > JOG_AV_LOG_MAX) jogAvLog.shift();
        if (jogAvLogHook) {
          try {
            jogAvLogHook();
          } catch (e) {
            /* a broken view must not break the jog */
          }
        }
      }

      function jogAvHour(ms) {
        var d = new Date(ms);
        function z(n) { return (n < 10 ? "0" : "") + n; }
        return z(d.getHours()) + ":" + z(d.getMinutes()) + ":" + z(d.getSeconds());
      }

      // def = { id, titulo (i18n key), icono (inner SVG of a 24x24 viewBox, optional), modos: [] (all) or ["Laser","CNC","FFF"],
      //         orden (number), montar(ctx) -> { render, actualizar, destruir } }
      function jogRegisterSectionAdvanced(def) {
        if (!def || typeof def.id !== "string" || !/^[A-Za-z0-9_]+$/.test(def.id)) return false;
        if (typeof def.title !== "string" || typeof def.mount !== "function") return false;
        var modes = Array.isArray(def.modes) ? def.modes.filter(function (m) { return jogModeKnown(m); }) : [];
        var clean = {
          id: def.id,
          title: def.title,
          icon: typeof def.icon === "string" ? def.icon : "",
          modes: modes,
          order: typeof def.order === "number" && isFinite(def.order) ? def.order : 100,
          mount: def.mount,
        };
        var i = jogAvDefs.map(function (d) { return d.id; }).indexOf(def.id);
        if (i >= 0) jogAvDefs[i] = clean;
        else jogAvDefs.push(clean);
        if (jogAvChangeHook) jogAvChangeHook();
        return true;
      }

      // The user choice, validated. A file without the key gives the defaults (everything shown, registered order).
      function jogAvCleanCfg(o) {
        var out = { ocultas: [], order: [] };
        if (!o || typeof o !== "object") return out;
        ["ocultas", "order"].forEach(function (k) {
          if (!Array.isArray(o[k])) return;
          o[k].forEach(function (id) {
            if (typeof id === "string" && /^[A-Za-z0-9_]+$/.test(id) && out[k].indexOf(id) < 0) out[k].push(id);
          });
        });
        return out;
      }

      // All sections in display order: first the ones the user ordered, then the rest by their own `order` and id.
      function jogAvSort(defs, cfg) {
        var order = (cfg && cfg.order) || [];
        function pos(d) {
          var i = order.indexOf(d.id);
          return i < 0 ? 1e9 : i;
        }
        return defs.slice().sort(function (a, b) {
          return pos(a) - pos(b) || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        });
      }

      // The ones to show now: in the current mode (unknown mode = only those for every mode) and not hidden by the user.
      // allowed === false (a role without the advanced operations, 08-role.js) shows none; undefined = allowed.
      function jogAvVisible(defs, mode, cfg, allowed) {
        if (allowed === false) return [];
        var m = jogModeKnown(mode);
        var ocultas = (cfg && cfg.ocultas) || [];
        return jogAvSort(defs, cfg).filter(function (d) {
          if (ocultas.indexOf(d.id) >= 0) return false;
          return !d.modes.length || (m !== null && d.modes.indexOf(m) >= 0);
        });
      }

      // How many extras the "More" panel would show: the sections of the Advanced tab that are visible (same predicate as the tab:
      // jogAvVisible, so hidden by the user, by the mode or by the role count as nothing) plus the macro blocks that are shown.
      // The tab counts only when its button is shown AND it has at least one section. Pure; the page passes the facts.
      function jogMoreExtrasCount(st) {
        var tab = st.tabShown && st.sections > 0 ? st.sections : 0;
        return tab + (st.macros > 0 ? st.macros : 0);
      }
      // The facts read from the live panel: the Advanced tab button, the tab bar and the block of macro buttons.
      function jogMoreHasSomething(advBtn, tabBar, macrosHost) {
        var shown = function (c) { return c.style.display !== "none"; };
        return jogMoreExtrasCount({
          tabShown: !!advBtn && shown(advBtn) && shown(tabBar),
          sections: jogAvVisible(jogAvDefs, jogMachineMode, jogAjAv, jogRoleNow().advanced).length,
          macros: Array.prototype.filter.call(macrosHost.children, function (c) { return shown(c) && c.childNodes.length > 0; }).length,
        }) > 0;
      }

      // What ctx.send does, with its dependencies injected (so it can be tested):
      //   deps = { libre(): bool, ahora(): ms, aviso(texto), registro(texto, nivel), i18n(key, params) }
      //   st   = { codigo, hasta } the armed code, kept by the caller between taps
      // Returns { estado: "bloqueado" | "armado" | "enviar" | "vacio" }. Only "enviar" means the caller must post the code.
      // The codes that only switch something OFF (a heater to 0, the spindle stop): they pass even when the machine is not
      // free (a job, a live job...) if the section marks them with {apagar: true}. Anything else keeps the lock.
      var JOG_AV_POWER_OFF_RX = /^(M5|M104\b[^\n]*\bS0|M140\b[^\n]*\bS0|M141\b[^\n]*\bS0|M106\b[^\n]*\bS0)(\s|$)/i;
      function jogAvIsPowerOff(code) {
        return code.split("\n").every(function (l) { l = l.trim(); return !l || JOG_AV_POWER_OFF_RX.test(l); });
      }
      function jogAvDecideSending(st, deps, codigo, opts) {
        opts = opts || {};
        var code = String(codigo === undefined || codigo === null ? "" : codigo).trim();
        if (!code) return { state: "empty" };
        if (!deps.free() && !(opts.poweroff && jogAvIsPowerOff(code))) {
          deps.record(deps.i18n("jog.adv_blocked_not_sent", { code: code.split("\n")[0] }), "notice");
          deps.notice(deps.i18n("jog.adv_machine_not_free"));
          st.code = null;
          return { state: "blocked" };
        }
        if (opts.moves) {
          var now = deps.now();
          if (st.code !== code || now > st.until) {
            st.code = code;
            st.until = now + JOG_AV_ARMED_MS;
            deps.notice(deps.i18n("jog.adv_tap_again", { text: opts.confirm || code.split("\n")[0] }));
            return { state: "armed" };
          }
          st.code = null;
        }
        return { state: "send", code: code };
      }

      var jogAvSendingState = { code: null, until: 0 };
      function jogAvSend(codigo, opts) {
        var d = jogAvDecideSending(
          jogAvSendingState,
          {
            free: jogAvFree,
            now: Date.now,
            notice: function (t) { jogShowNotice(t, JOG_AV_ARMED_MS); },
            record: jogAvRecord,
            i18n: i18nT,
          },
          codigo,
          opts
        );
        if (d.state !== "send") return Promise.resolve({ ok: false, state: d.state });
        jogAvRecord(d.code.split("\n").join(" ; "), "info");
        return postCode(d.code).then(
          function () { return { ok: true, state: "sent" }; },
          function (e) {
            jogAvRecord(d.code.split("\n")[0] + ": " + (e && e.message ? e.message : e), "error");
            return { ok: false, state: "error", error: e };
          }
        );
      }

      // Free for a section to act: same rule as the rest of the jog (a job, a live job, a firm block of the service or
      // another owner of the movement keep it locked) and the plugin running.
      function jogAvFree() {
        return !pluginStopped && jogMachineFree();
      }

      // Axes of the object model with their letter (extra axes included), in the model order.
      function jogAvAxes() {
        var st = jogStatusCache.status;
        var axes = (st && st.move && st.move.axes) || [];
        return axes
          .filter(function (a) { return a && typeof a.letter === "string"; })
          .map(function (a) {
            return {
              letter: a.letter,
              extra: jogIsAxisExtra(a.letter),
              homing: !!a.homed,
              machine: a.machinePosition,
              user: a.userPosition,
              min: a.min,
              max: a.max,
              speedMax: a.speed,
            };
          });
      }

      function jogAvCtx(contenedor) {
        return {
          container: contenedor,
          state: function () { return { status: jogStatusCache.status, mode: jogMachineMode }; },
          free: jogAvFree,
          send: jogAvSend,
          record: jogAvRecord,
          i18n: function (key, params) { return i18nT(key, params); },
          steps: function () { return jogAjSteps().slice(); },
          axes: jogAvAxes,
        };
      }

      // The tab body. host = the div of the tab. Returns { repintar(), actualizar(status), destruir() }.
      function jogAvAssembleTab(host) {
        var inst = {}; // id -> { wrap, content, header arrow, api, abierta }
        var abiertas = {}; // id -> bool, remembered while the panel lives
        var firstTime = true;
        host.style.cssText += ";flex-direction:column;gap:0;";
        var empty = document.createElement("div");
        empty.style.cssText = "font-size:11px;color:#b0bec5;padding:8px 4px;";
        empty.textContent = i18nT("jog.adv_no_sections");
        host.appendChild(empty);

        function safe(id, fn) {
          try {
            fn();
          } catch (e) {
            jogAvRecord("section " + id + ": " + (e && e.message ? e.message : e), "error");
          }
        }
        function crear(def, first) {
          var wrap = document.createElement("div");
          wrap.style.cssText = "width:100%;border-top:1px solid rgba(255,255,255,0.12);padding-top:4px;margin-top:4px;";
          var hd = document.createElement("button");
          hd.type = "button";
          hd.style.cssText =
            "display:flex;align-items:center;gap:6px;width:100%;background:none;border:none;color:#eceff1;font-size:11px;font-weight:bold;padding:6px 2px;min-height:32px;cursor:pointer;touch-action:none;-webkit-user-select:none;user-select:none;text-align:left;";
          if (def.icon) {
            var ic = document.createElement("span");
            ic.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px">' + def.icon + "</svg>";
            ic.style.cssText = "flex:none;color:#b0bec5;pointer-events:none;";
            hd.appendChild(ic);
          }
          var tt = document.createElement("span");
          tt.style.cssText = "flex:1 1 0;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          tt.textContent = i18nT(def.title);
          hd.appendChild(tt);
          var arrow = document.createElement("span");
          arrow.style.cssText = "flex:none;color:rgba(255,255,255,0.4);";
          hd.appendChild(arrow);
          wrap.appendChild(hd);
          var content = document.createElement("div");
          content.style.cssText = "display:none;flex-direction:column;gap:4px;width:100%;padding:2px 0 4px 0;";
          wrap.appendChild(content);
          var it = { wrap: wrap, content: content, arrow: arrow, api: null, open: abiertas[def.id] !== undefined ? abiertas[def.id] : first };
          function paint() {
            content.style.display = it.open ? "flex" : "none";
            arrow.textContent = it.open ? "v" : ">";
          }
          hd.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
          });
          hd.addEventListener("pointerup", function (ev) {
            ev.stopPropagation();
            it.open = !it.open;
            abiertas[def.id] = it.open;
            paint();
            if (it.open && it.api) safe(def.id, function () { if (typeof it.api.render === "function") it.api.render(); });
          });
          paint();
          safe(def.id, function () {
            it.api = def.mount(jogAvCtx(content)) || null;
            if (it.api && typeof it.api.render === "function") it.api.render();
          });
          return it;
        }
        function remove(id) {
          var it = inst[id];
          if (!it) return;
          safe(id, function () { if (it.api && typeof it.api.destroy === "function") it.api.destroy(); });
          if (it.wrap.parentNode) it.wrap.parentNode.removeChild(it.wrap);
          delete inst[id];
        }
        function repaint() {
          var vis = jogAvVisible(jogAvDefs, jogMachineMode, jogAjAv, jogRoleNow().advanced);
          var ids = vis.map(function (d) { return d.id; });
          Object.keys(inst).forEach(function (id) { if (ids.indexOf(id) < 0) remove(id); });
          vis.forEach(function (d, i) {
            if (!inst[d.id]) inst[d.id] = crear(d, i === 0 && firstTime);
            host.appendChild(inst[d.id].wrap); // moves it into the right order
          });
          if (vis.length) firstTime = false;
          empty.style.display = vis.length ? "none" : "block"; empty.textContent = i18nT(jogAvDefs.length && !vis.length && jogAjAv.ocultas.length ? "jog.adv_all_hidden" : "jog.adv_no_sections");
        }
        var modePrev = jogMachineMode;
        jogAvChangeHook = repaint;
        repaint();
        return {
          repaint: repaint,
          update: function (status) {
            if (jogMachineMode !== modePrev) {
              modePrev = jogMachineMode;
              repaint(); // the mode changed: other sections apply
            }
            if (host.offsetParent === null) return; // tab hidden: nothing to refresh
            Object.keys(inst).forEach(function (id) {
              var it = inst[id];
              if (it.api && typeof it.api.update === "function") safe(id, function () { it.api.update(status); });
            });
          },
          destroy: function () {
            if (jogAvChangeHook === repaint) jogAvChangeHook = null;
            Object.keys(inst).forEach(remove);
          },
        };
      }

      // Example section, also the log of the jog: shows what ctx.record / ctx.send wrote (max 200 lines, newest first).
      jogRegisterSectionAdvanced({
        id: "record",
        title: "jog.adv_log_title",
        modes: [],
        order: 900,
        mount: function (ctx) {
          var items = document.createElement("div");
          items.style.cssText = "max-height:160px;overflow-y:auto;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;line-height:1.4;color:#b0bec5;word-break:break-word;";
          ctx.container.appendChild(items);
          function render() {
            items.textContent = "";
            if (!jogAvLog.length) {
              items.textContent = ctx.i18n("jog.adv_log_empty");
              return;
            }
            jogAvLog.slice().reverse().forEach(function (e) {
              var l = document.createElement("div");
              l.style.color = e.level === "error" ? "#ef9a9a" : e.level === "notice" ? "#ffb74d" : "#b0bec5";
              l.textContent = jogAvHour(e.t) + "  " + e.text;
              items.appendChild(l);
            });
          }
          var hook = function () { if (ctx.container.offsetParent !== null) render(); };
          jogAvLogHook = hook;
          return {
            render: render,
            update: function () {},
            destroy: function () { if (jogAvLogHook === hook) jogAvLogHook = null; },
          };
        },
      });
