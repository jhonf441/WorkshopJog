      // ---- Jog panel: the drawn macro buttons and the rows of Settings to order / delete them (state jm in 10-jog-panel-macros.js) ----

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

      function jogRenderCustomMacros(jm) {
        jm.list.innerHTML = "";
        jm.manageList.innerHTML = "";
        jm.els = [];
        var list = jogLoadCustomMacros(jm);
        list.forEach(function (macro, idx) {
          jogMacroManageRow(jm, macro, idx);
          jogMacroRunCell(jm, macro);
        });
        jogMacroPaintActive(jm, jogStatusCache.status);
        if (!list.length) {
          var empty = document.createElement("div");
          empty.textContent = i18nT('jog.no_buttons_yet_new_button');
          empty.style.cssText = "font-size:12px;color:rgba(255,255,255,0.4);";
          jm.list.appendChild(empty);
        }
      }

      // The row of Settings: the name, move earlier / later, delete (double tap).
      function jogMacroManageRow(jm, macro, idx) {
        var wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;align-items:center;gap:3px;width:100%;";
        jm.manageList.appendChild(wrap);
        var name = document.createElement("span");
        name.textContent = macro.label;
        name.title = macro.kind === "macro" ? i18nT('jog.macro', { action: macro.action }) : "G-code: " + macro.action;
        name.style.cssText = "flex:1 1 auto;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        wrap.appendChild(name);
        wrap.appendChild(
          jogMacroSmall("<", i18nT('jog.move_earlier'), null, function () {
            if (idx === 0) return;
            var l = jogLoadCustomMacros(jm);
            l.splice(idx - 1, 0, l.splice(idx, 1)[0]);
            jogSaveCustomMacros(jm, l);
            jogRenderCustomMacros(jm);
          })
        );
        wrap.appendChild(
          jogMacroSmall(">", i18nT('jog.move_later'), null, function () {
            var l = jogLoadCustomMacros(jm);
            if (idx >= l.length - 1) return;
            l.splice(idx + 1, 0, l.splice(idx, 1)[0]);
            jogSaveCustomMacros(jm, l);
            jogRenderCustomMacros(jm);
          })
        );
        var armed = jm.delArmed === idx;
        wrap.appendChild(
          jogMacroSmall(armed ? i18nT('jog.sure') : i18nT('jog.delete'), i18nT('jog.delete_double_tap', { label: macro.label }), armed ? "#b71c1c" : "#5a1a1a", function () {
            if (jm.delArmed !== idx) {
              jm.delArmed = idx;
              clearTimeout(jm.delTimer);
              jm.delTimer = setTimeout(function () {
                jm.delArmed = -1;
                jogRenderCustomMacros(jm);
              }, JOG_ARM_MS);
              jogRenderCustomMacros(jm);
              return;
            }
            jm.delArmed = -1;
            var l = jogLoadCustomMacros(jm);
            l.splice(idx, 1);
            jogSaveCustomMacros(jm, l);
            jogRenderCustomMacros(jm);
          })
        );
      }

      // The button the jog shows and presses. rb is the state of ONE drawn button: the saved macro, the rules it follows, its elements
      // and the timer of its confirmation / notice.
      function jogMacroRunCell(jm, macro) {
        var wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;align-items:center;gap:2px;";
        jm.list.appendChild(wrap);
        // the bar owns the macro buttons: a copy of one of its buttons is not drawn a second time (it stays in the list of Settings)
        if (jogMacroIsBarDuplicate(macro, jm.barButtons, workshopPluginActive("bar"))) wrap.style.display = "none";
        var rb = jogMacroRunRules(jm, macro);
        wrap.style.cssText = "display:flex;flex:1 1 calc(50% - 4px);min-width:0;";
        jogMacroRunButton(jm, rb);
        wrap.appendChild(rb.btn);
        jogMacroRunWire(jm, rb);
      }

      // The same look as in the sidebar (request 2026-10-09: "the macro buttons are not copied the same, nor do they have a button
      // shape"). Those copied before saving the color take it from the original button. Copied from the bar: the same rules as there
      // (modes / job in progress), NOT the jog's lock -- "Light ON" has to work with the machine off (2026-10-09). Loose G-code or macro
      // ones, which could move the machine, still require the jog enabled.
      function jogMacroRunRules(jm, macro) {
        var orig = jm.barButtons
          ? jm.barButtons.filter(function (b) { return b.kind === macro.kind && b.action === macro.action; })[0]
          : null;
        return {
          macro: macro,
          orig: orig,
          color: macro.color || (orig && orig.color) || "#455a64",
          confirm: macro.confirm != null ? !!macro.confirm : !!(orig && orig.confirm),
          ofBar: !!(macro.ofBar || orig),
          modes: macro.modes || (orig && orig.modes) || [],
          inJob: macro.inJob != null ? !!macro.inJob : !(orig && orig.inJob === false),
          btn: null, lbl: null, act: null, dot: null, state: null, armTimer: null,
        };
      }

      function jogMacroRunButton(jm, rb) {
        var macro = rb.macro;
        var runBtn = jogMakeSmallButton(macro.label, (macro.kind === "macro" ? i18nT('jog.macro', { action: macro.action }) : "G-code: " + macro.action));
        runBtn.style.cssText += ";flex:1 1 auto;height:auto;min-height:44px;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.35);" +
          "background:" + rb.color + ";font-size:12px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
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
        actThe.style.cssText = "display:none;font-size:12px;font-weight:bold;letter-spacing:0.08em;";
        runBtn.appendChild(actThe);
        var dotThe = document.createElement("span");
        dotThe.style.cssText = "display:none;position:absolute;top:3px;right:4px;width:8px;height:8px;border-radius:50%;background:#69f0ae;box-shadow:0 0 4px #69f0ae;";
        runBtn.appendChild(dotThe);
        rb.state = macro.state !== undefined ? macro.state : rb.orig ? rb.orig.state : jogStateOf(macro);
        rb.btn = runBtn;
        rb.lbl = lblEl;
        rb.act = actThe;
        rb.dot = dotThe;
        jm.els.push({ el: runBtn, act: actThe, dot: dotThe, state: rb.state, color: rb.color });
      }

      // Why the button cannot run now ("" = it can).
      function jogMacroBlock(rb) {
        var macro = rb.macro;
        var switchDenied = jogModeSwitchBlock(jogMacroCode(macro)); // a mode macro follows the one switch rule (09-mode-confirm.js)
        if (switchDenied) return switchDenied;
        if (!rb.ofBar) return jogEnabled ? "" : i18nT('jog.jog_locked');
        if (rb.modes.length && jogMachineMode && rb.modes.indexOf(jogMachineMode) < 0) return i18nT('jog.only_in_mode', { modes: rb.modes.join(" / ") });
        var est = jogStatusCache.status && jogStatusCache.status.state && jogStatusCache.status.state.status;
        if (!rb.inJob && ["processing", "pausing", "paused", "resuming", "simulating"].indexOf(est) >= 0) return i18nT('jog.not_while_a_job_is_running');
        return "";
      }

      // A short notice on the button itself (2 s), then its label and its state again.
      function jogMacroNotify(jm, rb, t) {
        clearTimeout(rb.armTimer);
        rb.btn._armed = false;
        rb.btn._notice = true;
        rb.lbl.textContent = t;
        rb.btn.style.background = "#5d4037";
        rb.armTimer = setTimeout(function () {
          rb.btn._notice = false;
          rb.lbl.textContent = rb.macro.label;
          rb.btn.style.background = rb.color;
          jogMacroPaintActive(jm, jogStatusCache.status);
        }, 2000);
      }

      function jogMacroRunWire(jm, rb) {
        rb.btn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        rb.btn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          jogMacroRunTap(jm, rb);
        });
      }

      function jogMacroRunTap(jm, rb) {
        var macro = rb.macro;
        var runBtn = rb.btn;
        var notify = function (t) {
          jogMacroNotify(jm, rb, t);
        };
        var reason = jogMacroBlock(rb);
        if (reason) return notify(reason);
        if (rb.confirm && !runBtn._armed) {
          runBtn._armed = true;
          rb.lbl.textContent = i18nT('jog.confirm');
          runBtn.style.background = "#b71c1c";
          clearTimeout(rb.armTimer);
          rb.armTimer = setTimeout(function () {
            runBtn._armed = false;
            rb.lbl.textContent = macro.label;
            runBtn.style.background = rb.color;
          }, JOG_ARM_MS);
          return;
        }
        clearTimeout(rb.armTimer);
        runBtn._armed = false;
        rb.lbl.textContent = macro.label;
        runBtn.style.background = rb.color;
        // lit and with an "off" action: pressing it turns the function off (a macro of the SD or a G-code)
        var code = jogMacroCode(macro);
        if (macro.poweroff && jogStateActive(rb.state, jogStatusCache.status) === true) {
          var ap = String(macro.poweroff);
          code = /\.g$/i.test(ap) ? workshopMacroCode({ kind: "macro", action: ap }) : ap;
        }
        if (!code) return notify(i18nT('macropick.bad_path'));
        jogPostMacro(code, macro.label, notify); // 09-mode-confirm.js: a mode macro answers ok before the machine changes: the model is awaited
      }
