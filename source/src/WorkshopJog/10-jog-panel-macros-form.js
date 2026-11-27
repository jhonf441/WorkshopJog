      // ---- Jog panel: the form of a new macro button (Settings > Macro buttons mounts it; state jm in 10-jog-panel-macros.js) ----

      // The visible list under the macro section, and the blocks Settings mounts: the list to order / delete and the form.
      function jogMacrosListMake(jm, secMacros) {
        var macroLabel = document.createElement("div");
        macroLabel.style.cssText = "font-size:12px;color:rgba(255,255,255,0.4);width:100%;margin-top:6px;";
        macroLabel.textContent = i18nT('jog.macro_buttons_2');
        secMacros.appendChild(macroLabel);
        // what Settings mounts: new button, the list to order / delete, and the form
        jm.admin = document.createElement("div");
        jm.admin.style.cssText = "display:flex;flex-direction:column;gap:6px;width:100%;";
        jm.manageList = document.createElement("div");
        jm.manageList.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;";

        jm.list = document.createElement("div");
        jm.list.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;width:100%;";
        secMacros.appendChild(jm.list);

        jm.addForm = document.createElement("div");
        jm.addForm.style.cssText = "display:none;flex-direction:column;gap:3px;width:100%;margin-top:3px;";
      }

      // Where the button comes from (request 2026-10-08: "choose whether it is a
      // macro or a G-code, list, or use one that already exists"):
      //   existente -> one of the bar's buttons (sys/workshop/config/buttons.json)
      //   macro     -> choose from the list of 0:/macros (recursive)
      //   gcode     -> typed by hand
      // {label, kind: "macro"|"gcode", action} is saved.
      function jogMacrosSourceMake(jm) {
        var macroLabelInput = workshopInputEl("input", "width:100%;background:#1e272c;color:#fff;"); // size, border and radius: class wf-input
        macroLabelInput.type = "text";
        macroLabelInput.placeholder = i18nT('jog.button_label');
        jm.addForm.appendChild(macroLabelInput);
        jm.labelInput = macroLabelInput;

        var macroSelCss = "width:100%;background:#1e272c;color:#fff;";
        var macroSrcSel = workshopInputEl("select", macroSelCss);
        jm.srcSel = macroSrcSel;
        // "existing" names the bar: it is offered only while the control bar is there, and follows it (09-macro-sources.js)
        var macroSrcState = jm.srcState;
        jogMacroSourcesFill(macroSrcSel, macroSrcState);
        jogMacroSourcesFollow(macroSrcSel, macroSrcState, function () { jogFillMacroPick(jm); jogStateBoxVer(jm); });
        jm.addForm.insertBefore(macroSrcSel, macroLabelInput);

        jm.pickSel = workshopInputEl("select", macroSelCss); // existente o macro
        jm.addForm.insertBefore(jm.pickSel, macroLabelInput);

        // The chosen macro, READ-ONLY in a dialog of its own: a macro is never edited from here, and never opened in the editor or the viewer of DWC.
        jm.viewBtn = jogMacroSmall(i18nT('macropick.view'), i18nT('macropick.view_tip'), null, function () {
          if (jm.pickSel.value) workshopMacroView(jm.pickSel.value);
        });
        jm.viewBtn.style.cssText += ";width:100%;margin-top:2px;";
        jm.addForm.insertBefore(jm.viewBtn, macroLabelInput);
        jm.info = document.createElement("div"); // what the chosen workshop macro does, or why the group is missing
        jm.info.style.cssText = "font-size:12px;line-height:1.3;color:rgba(255,255,255,0.75);min-height:2.7em;";
        jm.addForm.insertBefore(jm.info, macroLabelInput);
        jm.codeInput = workshopInputEl("input", macroLabelInput.style.cssText);
        jm.codeInput.type = "text";
        jm.codeInput.placeholder = "G-code";
        jm.addForm.appendChild(jm.codeInput);
      }

      function jogMacroPaintInfo(jm) {
        var macro = jm.srcSel.value === "macro";
        jm.viewBtn.style.display = macro && jm.pickSel.value ? "" : "none";
        jm.info.textContent = !macro ? "" : workshopMacroDescription(jm.cat, jm.pickSel.value) || (jm.hidden ? i18nT('macropick.hidden_note') : jm.cat && !jm.cat.ok ? i18nT('macropick.old_service') : "");
      }

      function jogFillMacroPick(jm) {
        var src = jm.srcSel.value;
        jm.pickSel.style.display = src === "gcode" ? "none" : "";
        jm.codeInput.style.display = src === "gcode" ? "" : "none";
        if (src === "macro") {
          jm.hidden = workshopMacroFill(jm.pickSel, jm.cat, ""); // two groups: your macros and the workshop's
          return jogMacroPaintInfo(jm);
        }
        jm.pickSel.innerHTML = "";
        jogMacroPaintInfo(jm);
        if (src === "gcode") return;
        var list = jm.barButtons;
        var op0 = document.createElement("option");
        op0.value = "";
        op0.textContent = list === null ? i18nT('jog.loading') : list.length ? i18nT('jog.choose_button') : i18nT('jog.none');
        jm.pickSel.appendChild(op0);
        (list || []).forEach(function (it, i) {
          var op = document.createElement("option");
          op.value = String(i);
          op.textContent = it.label + (it.group ? "  (" + it.group + ")" : "");
          jm.pickSel.appendChild(op);
        });
      }

      function jogMacrosPickWire(jm) {
        jm.srcSel.addEventListener("change", function () {
          jogFillMacroPick(jm);
        });
        jm.pickSel.addEventListener("change", function () {
          if (jm.srcSel.value === "macro") {
            jogMacroPaintInfo(jm);
            var plug = ((jm.cat && jm.cat.plugins) || []).filter(function (m) { return m.action === jm.pickSel.value; })[0];
            if (jm.pickSel.value && !jm.labelInput.value.trim()) jm.labelInput.value = plug ? plug.title : jm.pickSel.value.split("/").pop().replace(/\.g$/i, "");
            return;
          }
          var i = parseInt(jm.pickSel.value, 10);
          if (!isNaN(i) && jm.srcSel.value === "existing" && jm.barButtons[i]) jm.labelInput.value = jm.barButtons[i].label;
        });
        [jm.srcSel, jm.pickSel].forEach(function (el) {
          el.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
          });
        });
      }

      // State of the button (optional): it lights up while this value of the object model matches, and the button can
      // run another macro or G-code to turn the function off when it is lit.
      function jogMacrosStateMake(jm) {
        jm.stateBox = document.createElement("div");
        jm.stateBox.style.cssText = "display:none;flex-direction:column;gap:3px;width:100%;";
        var macroStateTitle = document.createElement("div");
        macroStateTitle.textContent = i18nT('jog.state_title');
        macroStateTitle.title = i18nT('jog.state_tip');
        macroStateTitle.style.cssText = "font-size:12px;color:#b0bec5;line-height:1.3;";
        // path and value with the checks against the live object model, ONE fold of help and the "Test" row (07-state-fields.js)
        jm.stateW = workshopStateFieldsEl({ css: jm.labelInput.style.cssText, getModel: function () { return jogStatusCache.status; } });
        jm.statePath = jm.stateW.pathInput;
        jm.stateValue = jm.stateW.valueInput;
        jm.stateW.el.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation(); // the panel is dragged: a touch on the fields must not start it
        });
        jm.statePowerOff = workshopInputEl("input", jm.labelInput.style.cssText);
        jm.statePowerOff.type = "text";
        jm.statePowerOff.placeholder = i18nT('jog.state_off_ph');
        [macroStateTitle, jm.stateW.el, jm.statePowerOff].forEach(function (el) {
          jm.stateBox.appendChild(el);
        });
        jm.addForm.appendChild(jm.stateBox);
        jm.srcSel.addEventListener("change", function () {
          jogStateBoxVer(jm);
        });

        [jm.labelInput, jm.codeInput, jm.statePath, jm.stateValue, jm.statePowerOff].forEach(function (inp) {
          inp.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
          });
        });
      }

      function jogStateBoxVer(jm) {
        var v = jm.srcSel.value;
        jm.stateBox.style.display = v === "macro" || v === "gcode" ? "flex" : "none";
        jm.stateW.refresh();
      }

      // Save / Cancel of the form, then the "New button" row; the admin block is what Settings > Macro buttons mounts.
      function jogMacrosActionsMake(jm) {
        var macroAddActionsRow = document.createElement("div");
        macroAddActionsRow.style.cssText = "display:flex;gap:4px;width:100%;";
        jm.addForm.appendChild(macroAddActionsRow);

        jm.saveBtn = jogMakeSmallButton(i18nT('jog.save'), i18nT('jog.save_macro_button'));
        jm.saveBtn.style.flex = "1 1 0";
        jm.cancelBtn = jogMakeSmallButton(i18nT('jog.cancel'), i18nT('jog.cancel'));
        jm.cancelBtn.style.flex = "1 1 0";
        macroAddActionsRow.appendChild(jm.saveBtn);
        macroAddActionsRow.appendChild(jm.cancelBtn);

        var macroBtnRow = document.createElement("div");
        macroBtnRow.style.cssText = "display:flex;gap:4px;width:100%;margin-top:4px;";
        jm.addBtn = jogMakeSmallButton(i18nT('jog.new_button'), i18nT('jog.add_a_new_macro_button'));
        jm.addBtn.style.cssText += ";flex:1 1 0;";
        macroBtnRow.appendChild(jm.addBtn);
        jm.admin.appendChild(macroBtnRow);
        jm.admin.appendChild(jm.manageList);
        jm.admin.appendChild(jm.addForm);
        jogMacroAdmin = {
          mount: function (parentThe) {
            parentThe.appendChild(jm.admin);
            jogRenderCustomMacros(jm);
          },
        };
      }

      function jogMacrosButtonsWire(jm) {
        jm.addBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        jm.addBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          var opening = jm.addForm.style.display === "none";
          jm.addForm.style.display = opening ? "flex" : "none";
          if (opening) {
            jogFillMacroPick(jm);
            Promise.all([jogLoadMacroFiles(jm), jogLoadBarButtons(jm)]).then(function () {
              jogFillMacroPick(jm);
            });
          }
        });
        jm.saveBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        jm.saveBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          jogMacroSaveTap(jm);
        });
        jm.cancelBtn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        jm.cancelBtn.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          jm.labelInput.value = "";
          jm.codeInput.value = "";
          jm.addForm.style.display = "none";
        });
      }

      function jogMacroSaveTap(jm) {
        var label = jm.labelInput.value.trim();
        var src = jm.srcSel.value;
        var item = null;
        var i = parseInt(jm.pickSel.value, 10);
        if (src === "gcode") {
          var code = jm.codeInput.value.trim();
          if (code) item = { kind: "gcode", action: code };
        } else if (src === "macro" && jm.pickSel.value && workshopMacroActions(jm.cat).indexOf(jm.pickSel.value) >= 0) {
          item = { kind: "macro", action: jm.pickSel.value };
        } else if (src === "existing" && jm.barButtons && jm.barButtons[i]) {
          var bb = jm.barButtons[i];
          item = { kind: bb.kind, action: bb.action, color: bb.color, confirm: bb.confirm, modes: bb.modes, inJob: bb.inJob, state: bb.state, ofBar: true };
        }
        if (!item) {
          jm.labelInput.placeholder = src === "gcode" ? i18nT('jog.g_code_missing') : i18nT('jog.choose_from_the_list');
          return;
        }
        item.label = label || (src === "existing" ? jm.barButtons[i].label : src === "macro" ? item.action.split("/").pop() : item.action.slice(0, 12));
        if (src !== "existing") {
          var ePath = jm.statePath.value.trim();
          if (ePath) item.state = { path: ePath, value: jm.stateValue.value.trim() };
          var ePowerOff = jm.statePowerOff.value.trim();
          if (ePowerOff && item.state) item.poweroff = ePowerOff;
        }
        var list = jogLoadCustomMacros(jm);
        list.push(item);
        jogSaveCustomMacros(jm, list);
        jm.labelInput.value = "";
        jm.codeInput.value = "";
        jm.statePath.value = "";
        jm.stateValue.value = "";
        jm.statePowerOff.value = "";
        jm.addForm.style.display = "none";
        jogRenderCustomMacros(jm);
      }
