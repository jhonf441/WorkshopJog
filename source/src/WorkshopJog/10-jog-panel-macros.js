      // ---- Jog panel: the macro buttons -- saved list, the bar's buttons, the state of each button (sections listed in 10-jog-panel.js) ----
      //
      // The user defines a label + code (G-code or M98 P"0:/macros/..."); the buttons are saved in a file of the machine (the same on every
      // screen and phone that opens the jog; the browser copy is only the first paint) and sent with postCode() like any other button.
      // 2026-10-15: the jog only shows and presses the buttons; creating, ordering and deleting (double tap) is Settings > Macro buttons
      // (jogMacroAdmin, mounted there). The form is 10-jog-panel-macros-form.js, the drawn buttons 10-jog-panel-macros-list.js.
      //
      // jm is the explicit state of the macro buttons of one panel:
      //   mem         the saved list in memory (null until first read)
      //   cat         what macros.catalog answered (07-macro-catalog.js): { ok, mine, plugins, hidden }; null until read
      //   hidden      the workshop group is left out because the role cannot read it
      //   barButtons  the bar's buttons [{label, kind, action, group, ...}]; null until read
      //   els         [{el, act, dot, state, color}] of the last list drawn
      //   delArmed / delTimer   the row armed for delete (double tap) and its timer
      //   the elements of the list, the admin block and the form (list, manageList, admin, addForm, labelInput, srcSel, srcState,
      //   pickSel, viewBtn, info, codeInput, stateBox, stateW, statePath, stateValue, statePowerOff, saveBtn, cancelBtn, addBtn)

      var JOG_CUSTOM_MACROS_KEY = "emergencyFabJogCustomMacros";
      var JOG_CUSTOM_MACROS_FILE = "0:/sys/workshop/config/jog-macros.json";
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

      function jogMacrosState() {
        return {
          mem: null, cat: null, hidden: false, barButtons: null, els: [], delArmed: -1, delTimer: null,
          list: null, manageList: null, admin: null, addForm: null, labelInput: null, srcSel: null, srcState: { bar: null }, pickSel: null,
          viewBtn: null, info: null, codeInput: null, stateBox: null, stateW: null, statePath: null, stateValue: null, statePowerOff: null,
          saveBtn: null, cancelBtn: null, addBtn: null,
        };
      }

      function jogPanelMacros(jp) {
        var jm = jogMacrosState();
        jp.macros = jm;
        jogMacrosListMake(jm, jp.secMacros);
        jogMacrosSourceMake(jm);
        jogMacroPaintHook = function (status) {
          jogMacroPaintActive(jm, status);
        };
        jogMacrosPickWire(jm);
        jogMacrosStateMake(jm);
        jogMacrosActionsMake(jm);
        var render = function () {
          jogRenderCustomMacros(jm);
        };
        render();
        if (jogLoadCustomMacros(jm).length) jogLoadBarButtons(jm).then(render);
        jogMacrosSinceFile(jm, function () {
          render();
          jogLoadBarButtons(jm).then(render);
        });
        jogMacrosButtonsWire(jm);
      }

      function jogMacrosLocal() {
        try {
          var raw = localStorage.getItem(JOG_CUSTOM_MACROS_KEY);
          var l = raw ? JSON.parse(raw) : [];
          return Array.isArray(l) ? l : [];
        } catch (e) {
          return [];
        }
      }

      function jogLoadCustomMacros(jm) {
        if (!jm.mem) jm.mem = jogMacrosLocal();
        return jm.mem.slice();
      }

      function jogSaveCustomMacros(jm, list) {
        jm.mem = list.slice();
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
      function jogMacrosSinceFile(jm, alChange) {
        tzGetTextOptional(JOG_CUSTOM_MACROS_FILE) // the file is created by the first save: before that, "not there" is normal and asked once
          .then(function (t) {
            if (t === null) return;
            var o = JSON.parse(t);
            var l = o && Array.isArray(o.buttons) ? o.buttons : null;
            if (!l) return;
            if (JSON.stringify(l) !== JSON.stringify(jm.mem || [])) {
              jm.mem = l;
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

      function jogMacroPaintActive(jm, status) {
        jm.els.forEach(function (m) {
          var on = jogStateActive(m.state, status) === true;
          if (m.el._armed || m.el._notice) return;
          m.el.style.border = on ? "2px solid #fff" : "1px solid rgba(255,255,255,0.35)";
          m.el.style.boxShadow = on ? "0 0 10px " + m.color : "none";
          m.act.style.display = on ? "" : "none";
          m.dot.style.display = on ? "" : "none";
        });
      }

      function jogLoadMacroFiles(jm) {
        return workshopMacroCatalogLoad().then(function (cat) {
          jm.cat = cat;
        });
      }

      function jogLoadBarButtons(jm) {
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
            jm.barButtons = out;
          })
          .catch(function () {
            jm.barButtons = [];
          });
      }

      // Code to send for a saved button.
      function jogMacroCode(m) {
        return workshopMacroCode(m); // M98 for a macro of 0:/macros or "plugin:<path>"; "" when the path is not clean
      }
