      // ---- Jog settings (gear button in the header) ----
      //
      // Request 2026-10-09: "I need a section, for example a gear in
      // the jog, that lets me configure it to taste". The user chose the 4
      // parts: What is seen, Speed and response, Steps and Appearance.
      //
      // Two places to save, on purpose:
      // - OF THIS SCREEN (localStorage workshopJogSettings): what is seen, steps
      //   and appearance. The kiosk and the phone may want different things
      //   (like the A-/A+ size, which was already per screen).
      // - OF THE MACHINE (0:/sys/workshop/config/jog.json): maximum speed, Z,
      //   curve and dead zone. Used by the backend (jog_move.py rereads it
      //   every 2 s), so they hold for all the screens.
      //
      // Everything is function declarations: 10-jog.js calls them when building the
      // panel (before this file finishes executing). On saving,
      // the panel is taken out of the DOM and workshopWatchDom builds it again with the
      // new settings.

      var JOG_AJ_KEY = "workshopJogSettings";
      var JOG_AJ_FILE = "0:/sys/workshop/config/jog.json";
      // 2026-10-11: without the "Keyboard" section (it is now Controls to move >
      // X / Y > Keyboard, controles.keyboard). What was saved before (secs/open.keyboard and
      // "teclado" in order) is ignored: jogAjGet only copies ids from jogAjDefaults.
      var JOG_AJ_SECS = [
        ["position", i18nT('settings.position_and_speed')],
        ["macros", i18nT('jog.macro_buttons')],
      ];
      var JOG_AJ_STEPS_DEF = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 25, 50, 100];
      var JOG_AJ_COLORS = ["#1976d2", "#00897b", "#7b1fa2", "#e65100", "#c62828", "#546e7a"];
      var JOG_AJ_BORDERS = ["#ffffff", "#1976d2", "#00897b", "#ffb300", "#e53935", "#455a64"];
      // Valores de fabrica de la maquina = constantes de jog_move.py.
      var JOG_AJ_MACH_DEF = { feedMax: 6000, zRatio: 0.35, exponent: 1.6, deadzone: 0.12 };
      var JOG_AJ_MACH_LIM = { feedMax: [600, 15000], zRatio: [0.05, 1], exponent: [1, 3], deadzone: [0.02, 0.4] };
      var jogAjMach = null; // lo leido de JOG_AJ_FILE (null = de fabrica)

      // Settings are stored PER DESIGN (2026-10-13): each of the two designs has its
      // own layout (tabs, sections, extra axes, controls, colours) and its own
      // factory values. What is shared: steps, speed at start, how the panel opens
      // and which design is in use. jogAjGet() returns the shared fields plus the
      // fields of the design in use at the top level (so the rest of the plugin
      // reads them as before) and `d` with both designs.
      var JOG_AJ_LAYOUT_KEYS = ["tabs", "secs", "open", "order", "axesHidden", "accent", "border", "controls", "jog2Free"];
      function jogAjDesignDefaults() {
        return {
          tabs: { step: true, advanced: true },
          secs: { position: true, macros: true },
          open: { position: true, macros: false },
          order: ["macros"],
          axesHidden: [], // ejes extra (U, V, A...) that are NOT shown in the Paso tab
          accent: "#1976d2",
          border: "#ffffff",
          controls: null, // null = the factory controls of this design, else {perilla, deslizantes, flechas, teclado, zDesl, zBot}
          jog2Free: false, // design 2: "Move without limits" in the main view (not only inside More)
        };
      }
      function jogAjSharedDefaults() {
        return {
          style: 1, // 1 = knob and tabs; 2 = by tasks (12-jog2.js)
          speedStart: "last", // or a number 1..100
          steps: JOG_AJ_STEPS_DEF.slice(),
          stepDefault: 1,
          openOnLoad: "remember", // "recordar" | "abierto" | "cerrado"
        };
      }
      function jogAjClone(v) {
        return v === undefined ? v : JSON.parse(JSON.stringify(v));
      }
      // The fields of one design copied to the top level of `a` (a = flat settings).
      function jogAjCompose(g, d) {
        var a = jogAjClone(g);
        a.d = d;
        var cur = d[a.style === 2 ? 2 : 1];
        JOG_AJ_LAYOUT_KEYS.forEach(function (k) { a[k] = jogAjClone(cur[k]); });
        return a;
      }
      function jogAjDefaults() {
        return jogAjCompose(jogAjSharedDefaults(), { 1: jogAjDesignDefaults(), 2: jogAjDesignDefaults() });
      }
      // The top-level layout fields of `a` go back into a.d[design in use].
      function jogAjStash(a) {
        var cur = {};
        JOG_AJ_LAYOUT_KEYS.forEach(function (k) { cur[k] = jogAjClone(a[k]); });
        a.d[a.style === 2 ? 2 : 1] = cur;
      }
      // Changes the design being edited: keeps what was edited and loads the other one.
      function jogAjSwitch(a, n) {
        jogAjStash(a);
        a.style = n === 2 ? 2 : 1;
        var cur = a.d[a.style];
        JOG_AJ_LAYOUT_KEYS.forEach(function (k) { a[k] = jogAjClone(cur[k]); });
      }
      // Controls to move (2026-10-10, "that the user chooses whether they want the
      // sliders or the buttons, and that it is the same in both versions"):
      // a single set for both options; null = the factory ones of each
      // (option 1: knob, sliders and Z slider; option 2: arrows and
      // Z buttons), so nothing changes until the user chooses it.
      var JOG_CTRL_FAB = {
        1: { knob: true, sliders: true, arrows: false, keyboard: false, zSlide: true, zBot: false },
        2: { knob: false, sliders: false, arrows: true, keyboard: false, zSlide: false, zBot: true },
      };
      // Keyboard (2026-10-11, "if the keyboard is active it cannot allow control
      // of X and Y; if you use one you cannot use the others"): it is ONE MORE option of the
      // single X/Y control, it is not added. Since it also moves Z (Page Up / Page Down), with
      // Keyboard the Z is the keyboard: no slider nor Z buttons on screen.
      var JOG_CTRL_XY = ["knob", "sliders", "arrows", "keyboard"];
      function jogControlsClean(c) {
        if (!c || typeof c !== "object") return null;
        var out = {};
        JOG_CTRL_XY.concat(["zSlide", "zBot"]).forEach(function (k) { out[k] = !!c[k]; });
        // X/Y: only one ("it makes no sense to have more than one control to move X and Y");
        // if several are saved the first of JOG_CTRL_XY wins
        var one = JOG_CTRL_XY.filter(function (k) { return out[k]; })[0];
        JOG_CTRL_XY.forEach(function (k) { out[k] = k === one; });
        if (out.keyboard) {
          out.zSlide = false; // Z goes with the keyboard
          out.zBot = false;
          return out;
        }
        // Z: also only one (2026-10-11, "it should only allow one control of the Z axis;
        // now it has a slider and buttons, which makes no sense"). With both
        // saved, the one that goes with X/Y: arrows -> buttons, otherwise slider.
        if (out.zSlide && out.zBot) {
          out.zBot = out.arrows;
          out.zSlide = !out.arrows;
        }
        // X/Y with arrows (buttons) and Z with a slider do not go together (2026-10-13): arrows bring the Z buttons
        if (out.arrows) {
          out.zBot = true;
          out.zSlide = false;
        }
        if (!one || !(out.zSlide || out.zBot)) return null; // always something for X/Y and for Z
        return out;
      }
      // Keyboard (2026-10-11, "if it is a mobile or touch device that option must
      // not be allowed"): there is no API to know whether there is a PHYSICAL keyboard. Without
      // a touch screen (PC, common notebook) it is assumed that there is. With a
      // touch screen only if there is also a fine pointer (mouse / touchpad):
      // notebook or 2-in-1 with keyboard. Phone, tablet and the touch kiosk without
      // mouse: no (the option stays gray and the little keyboard is not drawn).
      function jogAjHasKeyboard() {
        if (!(navigator.maxTouchPoints > 0)) return true;
        try {
          return !!(window.matchMedia && window.matchMedia("(any-pointer: fine)").matches);
        } catch (e) {
          return false;
        }
      }
      // Keyboard chosen on a screen without a keyboard: the design's factory ones.
      // Each design keeps its own controls (null = its factory ones).
      function jogControls(estilo) {
        var n = estilo === 2 ? 2 : 1;
        var c = jogAjGet().d[n].controls;
        if (c && c.keyboard && !jogAjHasKeyboard()) c = null;
        return c ? JSON.parse(JSON.stringify(c)) : JSON.parse(JSON.stringify(JOG_CTRL_FAB[n]));
      }
      // One design's stored settings, validated and completed with its factory values.
      function jogAjCleanDesign(o) {
        var d = jogAjDesignDefaults();
        if (!o || typeof o !== "object") return d;
        ["tabs", "secs", "open"].forEach(function (k) {
          if (o[k] && typeof o[k] === "object")
            Object.keys(d[k]).forEach(function (id) {
              if (typeof o[k][id] === "boolean") d[k][id] = o[k][id];
            });
        });
        if (Array.isArray(o.order)) {
          var ord = o.order.filter(function (id) { return d.order.indexOf(id) !== -1; });
          d.order.forEach(function (id) { if (ord.indexOf(id) === -1) ord.push(id); });
          d.order = ord;
        }
        if (/^#[0-9a-f]{6}$/i.test(o.accent || "")) d.accent = o.accent;
        if (/^#[0-9a-f]{6}$/i.test(o.border || "")) d.border = o.border;
        if (typeof o.jog2Free === "boolean") d.jog2Free = o.jog2Free;
        d.controls = jogControlsClean(o.controls);
        // usarTeclado (2.1.x, the keyboard was added to the controls): if it was
        // true it becomes X/Y = Keyboard. The field is not saved again.
        if (o.useKeyboard === true && !(d.controls && d.controls.keyboard)) d.controls = jogControlsClean({ keyboard: true });
        if (Array.isArray(o.axesHidden))
          d.axesHidden = o.axesHidden.filter(function (L) {
            return typeof L === "string" && /^[A-Z]$/.test(L);
          });
        return d;
      }
      function jogAjGet() {
        var g = jogAjSharedDefaults();
        var d = { 1: jogAjDesignDefaults(), 2: jogAjDesignDefaults() };
        try {
          var o = JSON.parse(localStorage.getItem(JOG_AJ_KEY) || "{}");
          if (typeof o.speedStart === "number" && o.speedStart >= 1 && o.speedStart <= 100) g.speedStart = o.speedStart;
          var st = jogAjCleanSteps(o.steps);
          if (st) g.steps = st;
          if (typeof o.stepDefault === "number" && isFinite(o.stepDefault)) g.stepDefault = o.stepDefault;
          if (o.openOnLoad === "open" || o.openOnLoad === "closed") g.openOnLoad = o.openOnLoad;
          if (o.style === 2) g.style = 2;
          if (o.d && typeof o.d === "object") {
            d[1] = jogAjCleanDesign(o.d[1]);
            d[2] = jogAjCleanDesign(o.d[2]);
          }
        } catch (e) {
          /* defaults */
        }
        return jogAjCompose(g, d);
      }
      function jogAjSet(a) {
        try {
          jogAjStash(a);
          localStorage.setItem(
            JOG_AJ_KEY,
            JSON.stringify({ style: a.style, speedStart: a.speedStart, steps: a.steps, stepDefault: a.stepDefault, openOnLoad: a.openOnLoad, d: a.d })
          );
        } catch (e) {
          /* no critico */
        }
      }
      // List of steps: numbers 0.001..500, no repeats, sorted (max 12).
      function jogAjCleanSteps(arr) {
        if (!Array.isArray(arr)) return null;
        var out = [];
        arr.forEach(function (v) {
          v = Math.round(parseFloat(v) * 1000) / 1000;
          if (v >= 0.001 && v <= 500 && out.indexOf(v) === -1) out.push(v);
        });
        out.sort(function (a, b) { return a - b; });
        return out.length ? out.slice(0, 12) : null;
      }

      // ---- hooks used by 10-jog.js ----
      function jogAjSteps() {
        return jogAjGet().steps;
      }
      function jogAjStepIndex(list) {
        var want = jogAjGet().stepDefault, best = 0;
        list.forEach(function (v, i) {
          if (Math.abs(v - want) < Math.abs(list[best] - want)) best = i;
        });
        return best;
      }
      function jogAjAccent() {
        return jogAjGet().accent;
      }
      function jogAjOpen(id, def) {
        var o = jogAjGet().open;
        return typeof o[id] === "boolean" ? o[id] : def;
      }
      // Ocultar/ordenar pestanas y secciones, despues de armar el panel.
      // secs: {id: wrap de la seccion plegable}; adv = contenedor de Avanzado.
      function jogAjApplyLayout(secs, adv, tabBtns, tabBar) {
        var a = jogAjGet();
        a.order.forEach(function (id) {
          if (secs[id] && secs[id].parentNode === adv) adv.appendChild(secs[id]);
        });
        Object.keys(secs).forEach(function (id) {
          if (secs[id]) secs[id].style.display = a.secs[id] === false ? "none" : "";
        });
        var visible = 0;
        Object.keys(tabBtns).forEach(function (id) {
          var on = a.tabs[id] !== false && (id !== "advanced" || jogRoleNow().advanced);
          tabBtns[id].style.display = on ? "" : "none";
          if (on) visible++;
        });
        // the first visible section of the Avanzado tab has no line of its own: the line of the
        // tab bar is right above it (two lines with nothing between looked like a mistake)
        var first = true;
        Array.prototype.forEach.call(adv.children, function (c) {
          if (c.style.display === "none") return;
          c.style.borderTop = first ? "none" : "1px solid rgba(255,255,255,0.12)";
          c.style.marginTop = first ? "0" : "4px";
          c.style.paddingTop = first ? "0" : "4px";
          first = false;
        });
        if (tabBar) tabBar.style.display = visible ? "flex" : "none";
      }
      // Tab to show on opening: the saved one if it is visible, otherwise the
      // first visible one (null = none).
      function jogAjFirstTab(saved) {
        var t = jogAjGet().tabs;
        if (saved && t[saved] !== false && (saved !== "advanced" || jogRoleNow().advanced)) return saved;
        var ids = ["step", "advanced"].filter(function (id) { return t[id] !== false && (id !== "advanced" || jogRoleNow().advanced); });
        return ids.length ? ids[0] : null;
      }

      // ---- machine settings (file shared with the backend) ----
      function jogAjMachClean(o) {
        var out = {};
        Object.keys(JOG_AJ_MACH_DEF).forEach(function (k) {
          var v = parseFloat(o && o[k]);
          var lim = JOG_AJ_MACH_LIM[k];
          out[k] = isFinite(v) ? Math.min(lim[1], Math.max(lim[0], v)) : JOG_AJ_MACH_DEF[k];
        });
        return out;
      }
      function jogAjMachApply(m) {
        jogAjMach = m;
        // the browser uses these to show mm/s and for the steps (G1)
        JOG_FEED_MAX = m.feedMax;
        JOG_Z_FEED_RATIO = m.zRatio;
      }
      function jogAjMachLoad() {
        return tzGetText(JOG_AJ_FILE)
          .then(function (t) {
            var o = JSON.parse(t);
            jogAjAvApply(o && o.advanced); // old files have no "avanzado": defaults
            jogAjMachApply(jogAjMachClean(o));
          })
          .catch(function () { jogAjMachApply(jogAjMachClean({})); });
      }
      // Choice of the Advanced tab sections (shown / order), shared by every screen: key "avanzado" of JOG_AJ_FILE.
      function jogAjAvApply(o) {
        jogAjAv = jogAvCleanCfg(o);
        if (jogAvChangeHook) jogAvChangeHook();
      }

      // Writes into JOG_AJ_FILE only the keys of `part`, without deleting the others
      // (the machine and the no-limits mode share the file). Through the settings store with revision
      // (workshopSettings, 02-settings.js): if another person saved the file meanwhile their changes are kept
      // and this one is applied over them; if it conflicts twice it fails with a clear message.
      function jogAjMachMerge(part) {
        return workshopSettings.save("jog", function (o) {
          Object.keys(part).forEach(function (k) {
            o[k] = part[k];
          });
        });
      }

      // ---- la hoja de ajustes ----
      function jogAjOpenSheet() {
        workshopInjectFamily(); // the design family (wf-* classes): the tabs and buttons of the sheet
        var old = document.getElementById("workshop-jog-settings");
        if (old) old.remove();
        var a = jogAjGet();
        var m = JSON.parse(JSON.stringify(jogAjMach || jogAjMachClean({})));
        var origM = JSON.stringify(m);
        var av = jogAvCleanCfg(jogAjAv); // copy being edited (Advanced tab sections)
        var origAv = JSON.stringify(av);

        var ov = document.createElement("div");
        ov.id = "workshop-jog-settings";
        ov.setAttribute("data-workshop-i18n", "1");
        ov.style.cssText =
          "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;font-family:Roboto,Helvetica,Arial,sans-serif;";
        var box = document.createElement("div");
        box.style.cssText =
          "background:#263238;color:#eceff1;border:1px solid #455a64;border-radius:10px;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-shadow:0 6px 24px rgba(0,0,0,0.6);";
        ov.appendChild(box);
        ov.addEventListener("pointerdown", function (ev) {
          if (ev.target === ov) close();
        });
        function el(tag, css, text) {
          var e = document.createElement(tag);
          if (css) e.style.cssText = css;
          if (text !== undefined) e.textContent = text;
          return e;
        }
        var hd = el("div", "display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.12);");
        hd.appendChild(el("div", "font-size:16px;font-weight:500;flex:1;", i18nT('settings.jog_settings')));
        var xb = el("button", "background:none;border:none;color:#b0bec5;font-size:18px;cursor:pointer;padding:0 4px;", "x");
        xb.type = "button";
        xb.addEventListener("click", close);
        hd.appendChild(xb);
        box.appendChild(hd); box.appendChild(jogStartupCard(function () { close(); jogStartupInput.open(); })); // first thing to do (19-startup.js)

        // Design chooser (2026-10-13): every page of the sheet edits the design in use,
        // each design with its own settings and its own factory values.
        var dsg = el("div", "padding:8px 12px 0 12px;");
        box.appendChild(dsg);
        var dsgRow = el("div", "display:flex;gap:4px;flex-wrap:wrap;align-items:center;");
        dsg.appendChild(dsgRow);
        dsgRow.appendChild(el("span", "font-size:12px;color:#b0bec5;margin-right:4px;", i18nT('settings.design')));
        var dsgBtns = {};
        [[1, i18nT('settings.option_1_knob_and_tabs')], [2, i18nT('settings.option_2_task_based')]].forEach(function (o) {
          var b = el("button", "", o[1]);
          b.type = "button";
          b.addEventListener("click", function () {
            if (a.style === o[0]) return;
            jogAjSwitch(a, o[0]);
            draw();
          });
          dsgRow.appendChild(b);
          dsgBtns[o[0]] = b;
        });
        var dsgHint = el("div", "font-size:11px;color:#b0bec5;margin:4px 0 0 0;");
        dsg.appendChild(dsgHint);

        // pestanas de la hoja
        var tabs = el("div", "padding:8px 12px 0 12px;");
        tabs.className = "wf-tabs";
        box.appendChild(tabs);
        var bodyThe = el("div", "overflow-y:auto;padding:10px 12px;flex:1;font-size:13px;");
        box.appendChild(bodyThe);
        var foot = el("div", "display:flex;gap:6px;padding:10px 12px;border-top:1px solid rgba(255,255,255,0.12);align-items:center;flex-wrap:wrap;");
        box.appendChild(foot);
        var msg = el("div", "font-size:12px;flex:1 1 100%;min-height:0;");
        foot.appendChild(msg);

        var cur = "see";
        try {
          cur = jogRoleTab(sessionStorage.getItem("workshopJogAjTab"));
        } catch (e) {
          /* default */
        }
        var pages = jogRolePages([
          ["see", i18nT('settings.what_is_shown')],
          ["speed", i18nT('jog2.speed')],
          ["steps", i18nT('settings.steps')],
          ["look", i18nT('settings.appearance')],
          ["macros", i18nT('jog.macro_buttons')],
        ]);
        var tabBtns = {};
        pages.forEach(function (p) {
          var b = el("button", "", p[1]);
          b.type = "button";
          b.className = "wf-tab";
          b.addEventListener("click", function () {
            cur = p[0];
            try {
              sessionStorage.setItem("workshopJogAjTab", cur);
            } catch (e) {
              /* no critico */
            }
            draw();
          });
          tabs.appendChild(b);
          tabBtns[p[0]] = b;
        });

        function btn(label, primary, fn) {
          var b = el("button", "", label);
          b.className = "wf-btn" + (primary ? " wf-main" : "");
          b.type = "button";
          b.addEventListener("click", fn);
          return b;
        }
        function row(parent) {
          var r = el("div", "display:flex;align-items:center;gap:8px;margin:5px 0;flex-wrap:wrap;");
          parent.appendChild(r);
          return r;
        }
        function hint(parent, text) {
          parent.appendChild(el("div", "font-size:11px;color:#b0bec5;margin:2px 0 8px 0;", text));
        }
        // One single "Reset" lives in the footer (2026-10-13: "I only want a
        // default in a single place"): no per-item default buttons.
        function h(parent, text) {
          parent.appendChild(el("div", "font-size:12px;font-weight:bold;color:#90caf9;margin:10px 0 4px 0;text-transform:uppercase;letter-spacing:0.5px;", text));
        }
        function check(parent, label, val, fn) {
          var l = el("label", "display:flex;align-items:center;gap:6px;cursor:pointer;");
          var c = document.createElement("input");
          c.type = "checkbox";
          c.checked = !!val;
          c.style.cssText = "width:18px;height:18px;";
          c.addEventListener("change", function () { fn(c.checked); });
          l.appendChild(c);
          l.appendChild(el("span", "", label));
          parent.appendChild(l);
          return c;
        }
        function num(parent, val, min, max, step, w, fn) {
          var i = document.createElement("input");
          i.type = "number";
          i.min = String(min);
          i.max = String(max);
          i.step = String(step);
          i.value = String(val);
          i.style.cssText = "width:" + (w || 80) + "px;padding:4px 6px;background:#1e272c;color:#fff;border:1px solid #455a64;border-radius:4px;font-size:13px;";
          i.addEventListener("input", function () { fn(parseFloat(i.value)); });
          parent.appendChild(i);
          return i;
        }
        function slider(parent, label, val, min, max, step, fmt, fn) {
          var r = row(parent);
          r.appendChild(el("span", "flex:0 0 150px;", label));
          var s = document.createElement("input");
          s.type = "range";
          s.min = String(min);
          s.max = String(max);
          s.step = String(step);
          s.value = String(val);
          s.style.cssText = "flex:1 1 120px;";
          var v = el("span", "flex:0 0 80px;text-align:right;color:#ffe082;", fmt(val));
          s.addEventListener("input", function () {
            var x = parseFloat(s.value);
            v.textContent = fmt(x);
            fn(x);
          });
          r.appendChild(s);
          r.appendChild(v);
          return s;
        }
        function swatches(parent, list, val, fn) {
          var r = row(parent);
          list.forEach(function (c) {
            var b = el("button", "width:28px;height:28px;border-radius:50%;cursor:pointer;background:" + c + ";border:" + (c === val ? "3px solid #ffe082" : "2px solid rgba(255,255,255,0.25)") + ";");
            b.type = "button";
            b.title = c;
            b.addEventListener("click", function () { fn(c); draw(); });
            r.appendChild(b);
          });
        }

        function draw() {
          pages.forEach(function (p) {
            var on = p[0] === cur;
            tabBtns[p[0]].classList.toggle("on", on);
          });
          [1, 2].forEach(function (n) {
            var on = a.style === n;
            dsgBtns[n].style.cssText =
              "padding:5px 10px;border-radius:14px;cursor:pointer;font-size:12px;border:1px solid " + (on ? a.accent : "rgba(255,255,255,0.3)") + ";background:" + (on ? a.accent : "transparent") + ";color:#fff;";
          });
          dsgHint.textContent = a.style === 2
            ? i18nT('settings.option_2_large_position_arrows_tap')
            : i18nT('settings.option_1_knob_z_and_home');
          bodyThe.innerHTML = "";
          if (cur === "see") drawVer();
          else if (cur === "speed") drawSpeed();
          else if (cur === "steps") drawSteps();
          else if (cur === "macros") drawMacros();
          else drawLook();
        }

        function drawControles() {
          h(bodyThe, i18nT('settings.controls_to_move'));
          var hayTeclado = jogAjHasKeyboard();
          var fab = JSON.parse(JSON.stringify(JOG_CTRL_FAB[a.style === 2 ? 2 : 1]));
          var c = a.controls ? JSON.parse(JSON.stringify(a.controls)) : fab;
          // Keyboard saved on a touch screen: the factory ones are used (and shown)
          var tecladoSinTeclado = !!(c.keyboard && !hayTeclado);
          if (tecladoSinTeclado) c = fab;
          var notice = el("div", "font-size:11px;color:#ef9a9a;margin:2px 0;");
          function put(k, v) {
            c[k] = v;
            var clean = jogControlsClean(c);
            if (clean) {
              a.controls = clean;
              notice.textContent = "";
            } else {
              notice.textContent = i18nT('settings.at_least_one_control_for_x');
            }
          }
          // X/Y: only one, to choose from (2026-10-10); Keyboard is one more (2026-10-11)
          var rx = row(bodyThe);
          rx.appendChild(el("span", "min-width:40px;", i18nT('settings.x_y')));
          var xyCurrent = c.keyboard ? "keyboard" : c.arrows && !c.knob && !c.sliders ? "arrows" : c.sliders && !c.knob ? "sliders" : "knob";
          [["knob", i18nT('settings.knob')], ["sliders", i18nT('settings.x_and_y_sliders')], ["arrows", i18nT('settings.arrows')], ["keyboard", i18nT('settings.keyboard')]].forEach(function (op) {
            var l = el("label", "display:flex;align-items:center;gap:6px;cursor:pointer;");
            var r = document.createElement("input");
            r.type = "radio";
            r.name = "jogCtrlXY";
            r.checked = xyCurrent === op[0];
            r.style.cssText = "width:18px;height:18px;";
            if (op[0] === "keyboard" && !hayTeclado) {
              // DESIGN.md 5: disabled = gray and with the reason written (below)
              r.disabled = true;
              l.style.opacity = "0.45";
              l.style.cursor = "default";
            }
            r.addEventListener("change", function () {
              if (!r.checked) return;
              JOG_CTRL_XY.forEach(function (k) { c[k] = k === op[0]; });
              // on leaving the keyboard Z has its own control again: the one that goes with X/Y
              if (op[0] !== "keyboard" && !c.zSlide && !c.zBot) {
                c.zBot = op[0] === "arrows";
                c.zSlide = op[0] !== "arrows";
              }
              // buttons for X/Y: Z goes with buttons too (a slider next to arrows makes no sense)
              if (op[0] === "arrows") {
                c.zBot = true;
                c.zSlide = false;
              }
              put(op[0], true);
              draw(); // la fila Z cambia (teclado o deslizante / botones)
            });
            l.appendChild(r);
            l.appendChild(el("span", "", op[1]));
            rx.appendChild(l);
          });
          if (!hayTeclado)
            bodyThe.appendChild(el("div", "font-size:11px;color:#ffb74d;margin:2px 0 6px 0;",
              tecladoSinTeclado
                ? i18nT('settings.keyboard_this_screen_is_a_touchscreen')
                : i18nT('settings.keyboard_this_screen_is_a_touchscreen_2')));
          // Z: only one, like X/Y (2026-10-11); with Keyboard, Z is also the keyboard
          var rz = row(bodyThe);
          rz.appendChild(el("span", "min-width:40px;", "Z"));
          if (c.keyboard) {
            rz.appendChild(el("span", "color:#b0bec5;", i18nT('settings.with_the_keyboard_pgup_raises_pgdn')));
          } else {
            var zCurrent = c.zBot && !c.zSlide ? "zBot" : c.zSlide && !c.zBot ? "zSlide" : c.arrows ? "zBot" : "zSlide";
            [["zSlide", i18nT('settings.slider')], ["zBot", i18nT('settings.z_z_buttons')]].forEach(function (op) {
              var l = el("label", "display:flex;align-items:center;gap:6px;cursor:pointer;");
              var r = document.createElement("input");
              r.type = "radio";
              r.name = "jogCtrlZ";
              r.checked = zCurrent === op[0];
              r.style.cssText = "width:18px;height:18px;";
              if (op[0] === "zSlide" && c.arrows) {
                // DESIGN.md 5: gray and with the reason (below)
                r.disabled = true;
                l.style.opacity = "0.45";
                l.style.cursor = "default";
                l.title = i18nT('settings.z_slider_with_arrows');
              }
              r.addEventListener("change", function () {
                if (!r.checked) return;
                c.zSlide = op[0] === "zSlide";
                c.zBot = op[0] === "zBot";
                put(op[0], true);
              });
              l.appendChild(r);
              l.appendChild(el("span", "", op[1]));
              rz.appendChild(l);
            });
          }
          bodyThe.appendChild(notice);
          if (c.keyboard)
            hint(bodyThe, i18nT('settings.only_the_keys_are_drawn_on'));
          hint(bodyThe, a.controls && !tecladoSinTeclado
            ? i18nT('settings.they_only_apply_to_this_option')
            : a.style === 2
              ? i18nT('settings.now_the_factory_ones_of_this')
              : i18nT('settings.now_the_factory_ones_of_this_2'));
        }
        function drawVer() {
          drawControles();
          // Position (2026-10-11): a single card, at the top, in both options (13-position.js)
          h(bodyThe, i18nT('position.position'));
          check(row(bodyThe), i18nT('settings.show_the_position_above_the_controls'), a.secs.position, function (v) { a.secs.position = v; });
          hint(bodyThe, i18nT('settings.large_numbers_in_the_work_area'));
          drawEstructura();
        }
        // Tabs, extra axes and sections: both designs (in option 2 they are inside "Mas").
        function drawEstructura() {
          hint(bodyThe, a.style === 2
            ? i18nT('settings.only_on_this_screen_in_option')
            : i18nT('settings.only_on_this_screen_the_knob'));
          h(bodyThe, i18nT('settings.tabs'));
          var r = row(bodyThe);
          [["step", i18nT("jog.step")], ["advanced", i18nT("jog.advanced")]].forEach(function (t) {
            check(r, t[1], a.tabs[t[0]], function (v) { a.tabs[t[0]] = v; });
          });
          h(bodyThe, i18nT('settings.extra_axes_step_tab'));
          if (!jogAxesExtra.length) hint(bodyThe, i18nT('settings.this_machine_only_has_x_y'));
          else {
            hint(bodyThe, i18nT('settings.tap_one_step_of_the_chosen'));
            var re = row(bodyThe);
            jogAxesExtra.forEach(function (L) {
              check(re, i18nT('settings.axis', { l: L }), a.axesHidden.indexOf(L) < 0, function (v) {
                a.axesHidden = a.axesHidden.filter(function (x) {
                  return x !== L;
                });
                if (!v) a.axesHidden.push(L);
              });
            });
          }
          h(bodyThe, i18nT('settings.sections'));
          hint(bodyThe, i18nT('settings.show_it_is_displayed_open_it'));
          var names = {};
          JOG_AJ_SECS.forEach(function (sd) { names[sd[0]] = sd[1]; });
          a.order.forEach(function (id) {
            var r2 = el("div", "display:flex;align-items:center;gap:8px;padding:5px 6px;margin:3px 0;background:rgba(255,255,255,0.04);border-radius:6px;flex-wrap:wrap;");
            bodyThe.appendChild(r2);
            r2.appendChild(el("span", "flex:1 1 140px;", names[id]));
            check(r2, i18nT('settings.view'), a.secs[id], function (v) { a.secs[id] = v; });
            check(r2, i18nT('settings.open'), a.open[id], function (v) { a.open[id] = v; });
            var oi = a.order.indexOf(id);
            var up = btn("▲", false, function () {
              if (oi > 0) {
                a.order.splice(oi, 1);
                a.order.splice(oi - 1, 0, id);
                draw();
              }
            });
            up.style.padding = "2px 8px";
            up.disabled = oi === 0;
            var dn = btn("▼", false, function () {
              if (oi < a.order.length - 1) {
                a.order.splice(oi, 1);
                a.order.splice(oi + 1, 0, id);
                draw();
              }
            });
            dn.style.padding = "2px 8px";
            dn.disabled = oi === a.order.length - 1;
            r2.appendChild(up);
            r2.appendChild(dn);
          });
          // Sections of the Advanced tab (registered by other files): shown / hidden and order, for the whole machine
          if (jogAvDefs.length) {
            h(bodyThe, i18nT('jog.adv_sections'));
            hint(bodyThe, i18nT('jog.adv_sections_hint'));
            var all = jogAvSort(jogAvDefs, av);
            all.forEach(function (d, ai) {
              var r3 = el("div", "display:flex;align-items:center;gap:8px;padding:5px 6px;margin:3px 0;background:rgba(255,255,255,0.04);border-radius:6px;flex-wrap:wrap;");
              bodyThe.appendChild(r3);
              r3.appendChild(el("span", "flex:1 1 140px;", i18nT(d.title) + (d.modes.length ? " (" + d.modes.join(" / ") + ")" : "")));
              check(r3, i18nT('settings.view'), av.ocultas.indexOf(d.id) < 0, function (v) {
                av.ocultas = av.ocultas.filter(function (x) { return x !== d.id; });
                if (!v) av.ocultas.push(d.id);
              });
              function move(delta) {
                var ids = all.map(function (x) { return x.id; });
                ids.splice(ai, 1);
                ids.splice(ai + delta, 0, d.id);
                av.order = ids;
                draw();
              }
              var up2 = btn("▲", false, function () { if (ai > 0) move(-1); });
              up2.style.padding = "2px 8px";
              up2.disabled = ai === 0;
              var dn2 = btn("▼", false, function () { if (ai < all.length - 1) move(1); });
              dn2.style.padding = "2px 8px";
              dn2.disabled = ai === all.length - 1;
              r3.appendChild(up2);
              r3.appendChild(dn2);
            });
          }
        }

        // Macro buttons: made, ordered and deleted here; the jog only shows and presses them. They are saved in a file of the
        // machine, so every screen and phone shows the same ones.
        function drawMacros() {
          h(bodyThe, i18nT('jog.macro_buttons'));
          hint(bodyThe, i18nT('settings.macro_buttons_what'));
          if (jogMacroAdmin) jogMacroAdmin.mount(bodyThe);
          else hint(bodyThe, i18nT('settings.macro_buttons_not_ready'));
        }

        function drawSpeed() {
          hint(bodyThe, i18nT('settings.from_the_machine_they_apply_to'));
          slider(bodyThe, i18nT('settings.maximum_x_y_speed'), m.feedMax, 600, 15000, 100, function (v) { return Math.round(v) + " mm/min"; }, function (v) { m.feedMax = v; });
          hint(bodyThe, i18nT('settings.what_the_knob_gives_at_full'));
          slider(bodyThe, i18nT('settings.z_relative_to_x_y'), m.zRatio, 0.05, 1, 0.05, function (v) { return Math.round(v * 100) + " %"; }, function (v) { m.zRatio = v; });
          hint(bodyThe, i18nT('settings.z_at_full_this_percentage_of'));
          slider(bodyThe, i18nT('settings.knob_curve'), m.exponent, 1, 3, 0.1, function (v) { return v.toFixed(1) + (v < 1.3 ? i18nT('settings.linear') : v > 2.2 ? i18nT('settings.very_fine') : ""); }, function (v) { m.exponent = v; });
          hint(bodyThe, i18nT('settings.1_linear_half_the_knob_half'));
          slider(bodyThe, i18nT('settings.dead_zone'), m.deadzone, 0.02, 0.4, 0.01, function (v) { return Math.round(v * 100) + " %"; }, function (v) { m.deadzone = v; });
          hint(bodyThe, i18nT('settings.how_far_the_knob_must_move'));
          h(bodyThe, i18nT('settings.on_opening_this_screen'));
          var r = row(bodyThe);
          var sel = document.createElement("select");
          sel.style.cssText = "padding:4px 6px;background:#1e272c;color:#fff;border:1px solid #455a64;border-radius:4px;";
          [["last", i18nT('settings.remember_the_last_speed')], ["fixed", i18nT('settings.always_start_at')]].forEach(function (o) {
            var op = document.createElement("option");
            op.value = o[0];
            op.textContent = o[1];
            sel.appendChild(op);
          });
          sel.value = typeof a.speedStart === "number" ? "fixed" : "last";
          r.appendChild(sel);
          var n = num(r, typeof a.speedStart === "number" ? a.speedStart : 50, 1, 100, 1, 64, function (v) {
            if (v >= 1 && v <= 100) a.speedStart = Math.round(v);
          });
          r.appendChild(el("span", "", "%"));
          n.disabled = sel.value !== "fixed";
          sel.addEventListener("change", function () {
            n.disabled = sel.value !== "fixed";
            a.speedStart = sel.value === "fixed" ? Math.round(parseFloat(n.value)) || 50 : "last";
          });
        }

        function drawSteps() {
          hint(bodyThe, i18nT('settings.this_screen_only_the_distances_of'));
          var r = row(bodyThe);
          var t = document.createElement("input");
          t.type = "text";
          t.value = a.steps.join(", ");
          t.style.cssText = "flex:1 1 220px;padding:6px;background:#1e272c;color:#fff;border:1px solid #455a64;border-radius:4px;font-size:13px;";
          r.appendChild(t);
          var prev = el("div", "display:flex;gap:4px;flex-wrap:wrap;margin:6px 0;");
          bodyThe.appendChild(prev);
          var r2 = row(bodyThe);
          r2.appendChild(el("span", "", i18nT('settings.step_chosen_on_opening')));
          var sel = document.createElement("select");
          sel.style.cssText = "padding:4px 6px;background:#1e272c;color:#fff;border:1px solid #455a64;border-radius:4px;";
          r2.appendChild(sel);
          function sync() {
            var list = jogAjCleanSteps(t.value.split(/[,;\s]+/)) || [];
            prev.innerHTML = "";
            sel.innerHTML = "";
            list.forEach(function (v) {
              prev.appendChild(el("span", "padding:2px 8px;border-radius:10px;background:#455a64;font-size:12px;", v + " mm"));
              var op = document.createElement("option");
              op.value = String(v);
              op.textContent = v + " mm";
              sel.appendChild(op);
            });
            if (!list.length) prev.appendChild(el("span", "color:#ef9a9a;font-size:12px;", i18nT('settings.type_at_least_one_number_e')));
            else {
              a.steps = list;
              var best = list[jogAjStepIndexOf(list, a.stepDefault)];
              sel.value = String(best);
              a.stepDefault = best;
            }
          }
          t.addEventListener("input", sync);
          sel.addEventListener("change", function () { a.stepDefault = parseFloat(sel.value); });
          sync();
        }

        function drawLook() {
          hint(bodyThe, i18nT('settings.only_on_this_screen'));
          // The design in use is chosen at the top of the sheet (every page edits it).
          slider(bodyThe, i18nT('settings.size'), jogScale, JOG_SCALE_MIN, JOG_SCALE_MAX, JOG_SCALE_STEP, function (v) { return Math.round(v * 100) + " %"; }, function (v) { jogApplyScale(v); });
          hint(bodyThe, i18nT('settings.same_as_a_a_applied_at')); check(bodyThe, i18nT('settings.zoom_in_bar'), jogZoomBarOn(), function (v) { jogZoomBarSet(v); });
          h(bodyThe, i18nT('settings.tab_colour'));
          var colTabs = el("div");
          bodyThe.appendChild(colTabs);
          swatches(colTabs, JOG_AJ_COLORS, a.accent, function (c) { a.accent = c; });
          h(bodyThe, i18nT('settings.border_colour'));
          swatches(bodyThe, JOG_AJ_BORDERS, a.border, function (c) { a.border = c; });
          h(bodyThe, i18nT('settings.on_page_load'));
          var r = row(bodyThe);
          var sel = document.createElement("select");
          sel.style.cssText = "padding:4px 6px;background:#1e272c;color:#fff;border:1px solid #455a64;border-radius:4px;";
          [["remember", i18nT('settings.as_i_left_it')], ["open", i18nT('settings.always_open')], ["closed", i18nT('settings.always_minimized')]].forEach(function (o) {
            var op = document.createElement("option");
            op.value = o[0];
            op.textContent = o[1];
            sel.appendChild(op);
          });
          sel.value = a.openOnLoad;
          sel.addEventListener("change", function () { a.openOnLoad = sel.value; });
          r.appendChild(sel);
          hint(bodyThe, i18nT('settings.the_double_tap_confirmations_of_the'));
        }

        function setMsg(t, ok) {
          msg.textContent = t || "";
          msg.style.color = ok === false ? "#ef9a9a" : "#a5d6a7";
        }
        function close() {
          ov.remove();
        }
        // The only "default" button of the sheet: it takes THIS design (its layout,
        // controls and colours) and the shared screen settings (steps, starting
        // speed, how the panel opens) back to factory, plus the machine values of
        // the Velocidad page. The size (A- / A+) is not touched. Nothing is
        // applied until Guardar, so Cancelar undoes it.
        foot.appendChild(btn(i18nT('settings.restore_this_design'), false, function () {
          var est = a.style;
          var f = jogAjDefaults();
          a.d[est] = jogAjDesignDefaults();
          JOG_AJ_LAYOUT_KEYS.forEach(function (k) { a[k] = jogAjClone(a.d[est][k]); });
          a.steps = f.steps;
          a.stepDefault = f.stepDefault;
          a.speedStart = f.speedStart;
          a.openOnLoad = f.openOnLoad;
          m = JSON.parse(JSON.stringify(JOG_AJ_MACH_DEF));
          draw();
          setMsg(i18nT('settings.factory_values_of_this_design_loaded'), true);
        }));
        var sp = el("span", "flex:1;");
        foot.appendChild(sp);
        foot.appendChild(btn(i18nT('jog.cancel'), false, close));
        foot.appendChild(btn(i18nT('jog.save'), true, function () {
          if (jogPointerId !== null || jogZHeldSign !== 0) return setMsg(i18nT('settings.release_the_knob_z_first'), false);
          jogAjSet(a);
          var p = Promise.resolve();
          if (JSON.stringify(m) !== origM) {
            m = jogAjMachClean(m);
            // keeps the rest of the file (e.g. "free", the no-limits mode of 11-free.js)
            p = jogAjMachMerge(m).then(function () { jogAjMachApply(m); });
          }
          if (JSON.stringify(av) !== origAv) {
            p = p.then(function () { return jogAjMachMerge({ advanced: av }); }).then(function () { jogAjAvApply(av); });
          }
          p.then(function () {
            close();
            // rebuild the panel with the new settings (workshopWatchDom creates it
            // again on seeing it is not there)
            if (jogPanelEl && jogPanelEl.parentNode) jogPanelEl.parentNode.removeChild(jogPanelEl);
          }).catch(function (e) {
            setMsg(i18nT('settings.the_machine_part_was_not_saved', { err: e && e.message ? e.message : e }), false);
          });
        }));
        draw();
        document.body.appendChild(ov);
      }
      function jogAjStepIndexOf(list, want) {
        var best = 0;
        list.forEach(function (v, i) {
          if (Math.abs(v - want) < Math.abs(list[best] - want)) best = i;
        });
        return best;
      }
