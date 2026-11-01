      // ---- Where a button made in the Jog comes from (the first <select> of the form "New button" in the Settings) ----
      //
      // "existing" (a button of the control bar) names another plugin, so it is offered only while the bar is installed and enabled. "macro" (a file
      // of the machine) and "gcode" (typed by hand) need no other plugin. The list follows the bar: the bar can load after the Jog or be stopped later.

      function jogMacroSources(barLoaded) {
        return barLoaded ? ["existing", "macro", "gcode"] : ["macro", "gcode"];
      }

      // Makes the options of `sel` for the bar as it is now. state = { bar } keeps what the last list was made for (null = never made).
      // Nothing is touched while the bar did not change (rebuilding would drop what the person picked). The pick is kept if it still
      // exists, else it falls on the first source. Returns true when the list changed.
      function jogMacroSourcesFill(sel, state) {
        var bar = workshopPluginActive("bar");
        if (bar === state.bar) return false;
        state.bar = bar;
        var keep = sel.value;
        var sources = jogMacroSources(bar);
        var names = { existing: i18nT('jog.use_a_button_that_already_exists'), macro: i18nT('jog.macro_choose_from_the_list'), gcode: i18nT('jog.g_code_type_it') };
        sel.innerHTML = "";
        sources.forEach(function (id) {
          var op = document.createElement("option");
          op.value = id;
          op.textContent = names[id];
          sel.appendChild(op);
        });
        sel.value = sources.indexOf(keep) >= 0 ? keep : sources[0];
        return true;
      }

      // Redoes the list on every change of the registry (a plugin loaded or stopped) and calls onChange when it changed; lets go on stop.
      function jogMacroSourcesFollow(sel, state, onChange) {
        function sync() {
          if (jogMacroSourcesFill(sel, state)) onChange();
        }
        workshopOnChange(sync);
        workshopOnStop(function () {
          workshopOffChange(sync);
        });
      }
