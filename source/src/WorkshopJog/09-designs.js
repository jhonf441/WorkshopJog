      // ---- The four designs of the Jog (chosen in the settings sheet, the gear) ----
      //
      // The design number: 1 = knob and tabs, 2 = by tasks, 3 = pendant (12-jog3.js), 4 = hive (12-jog4.js). Anything else is 1.
      var JOG_AJ_DESIGNS = [1, 2, 3, 4];
      function jogAjIdx(n) {
        return n === 2 || n === 3 || n === 4 ? n : 1;
      }
      // Designs 3 and 4 have their own controls (the wheel, the keypad, the hexagons), so the settings of "Controls to move" do not apply to them: the
      // sheet shows why instead of the options. "More" in these designs does NOT repeat what the design already has: no knob, no sliders, no Z, no Step tab
      // (it only keeps what the design lacks: the Advanced tab, the macro buttons, Move without limits, and for the hive the speed).
      function jogAjDesignOwnControls(n) {
        return n === 3 || n === 4;
      }

      // The "Tabs" setting of the sheet: Step and Advanced. The pendant and the hive have no More (they keep to their own controls), so there is nothing to show.
      function jogAjDrawTabs(h, row, check, parent, a) {
        if (jogAjDesignOwnControls(a.style)) return;
        h(parent, i18nT("settings.tabs"));
        var r = row(parent);
        [["step", i18nT("jog.step")], ["advanced", i18nT("jog.advanced")]].forEach(function (t) {
          check(r, t[1], a.tabs[t[0]], function (v) {
            a.tabs[t[0]] = v;
          });
        });
      }
