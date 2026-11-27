      // ---- Jog panel: the first tab, the design assembler, the role and the mount on the page (sections listed in 10-jog-panel.js) ----

      function jogPanelFirstTab(jp) {
        var savedTab = null;
        try {
          savedTab = localStorage.getItem(JOG_TAB_KEY);
        } catch (e) {
          /* default "home" */
        }
        var firstTab = jogAjFirstTab(jp.tabSections[savedTab] ? savedTab : "step");
        if (firstTab) jogSelectTab(jp, firstTab);
        else jp.tabContent.style.display = "none"; // all tabs hidden (Settings)

        // Suppresses the native context menu on the WHOLE panel (knob,
        // Z track, header, sensitivity -- the event bubbles, a single
        // listener here is enough). Without this, holding the finger on the
        // knob/a Z control to move it triggers the browser's options menu,
        // which cancels the pointer gesture in progress (seen
        // live, 2026-10-07: "it releases and goes back to the center").
        jp.panel.addEventListener("contextmenu", function (ev) {
          ev.preventDefault();
        });
      }

      // Chosen controls (Settings > What is shown > Controls, valid for both
      // options): knob / X and Y sliders / arrows and slider / Z buttons.
      // Without arrows, the Z buttons go in the same row as the knob or the
      // sliders, centered and of the same height (2026-10-10: "if they are sliders
      // they must be centered; slider and buttons for Z, center and arrange at the
      // proper size").
      function jogZButtonsInRow(jp, mv) {
        if (!mv || !mv.colZ) return false;
        // the same cell as an X / Y button (JOG2_CELL_H, 12-jog2.js), the pair centered beside the knob
        mv.colZ.style.cssText = "display:grid;grid-template-rows:repeat(2," + JOG2_CELL_H + "px);gap:4px;width:" + JOG2_CELL_H + "px;align-self:center;flex:0 0 auto;";
        mv.colZ.children[1].style.gridRow = "2";
        jp.row.appendChild(mv.colZ);
        jp.row.style.display = "flex";
        return true;
      }

      function jogApplyControls(jp, ctrl) {
        var xy = ctrl.knob || ctrl.sliders;
        jp.axisModeRow.style.display = ctrl.knob && ctrl.sliders ? "flex" : "none";
        if (ctrl.knob && !ctrl.sliders) jogApplyAxisMode(jp, "free");
        else if (!ctrl.knob && ctrl.sliders) jogApplyAxisMode(jp, "straight");
        if (!xy) {
          jp.ring.style.display = "none";
          jogXTrackEl.style.display = "none";
          jogYTrackEl.style.display = "none";
        }
        jp.zTrack.style.display = ctrl.zSlide ? "" : "none";
        jp.row.style.display = xy || ctrl.zSlide ? "flex" : "none";
        jp.row.style.justifyContent = "center"; // deslizantes / perilla / Z siempre centrados
        jp.row.style.width = "100%";
      }

      // Jog option 2 (12-jog2.js, Settings > Appearance) and the others: mounted at the top, everything of option 1 stays as is inside its "More".
      function jogPanelAssemble(jp) {
        var row = jp.row;
        var jogAsmFn = jogAjGet().style === 2 ? jog2Assemble : jogAssembler(jogAjGet().style); // designs 2, 3 (pendant), 4 (hive): their own view on top, the usual jog in More
        if (jogAsmFn) {
          jogAsmFn(jogPanelAssemblerCtx(jp));
        } else if (typeof jog2Move === "function") {
          var ctrl1 = jogControls(1);
          jogApplyControls(jp, ctrl1);
          var mv1 = jog2Move({ stopRow: jp.stopRow, steps: jp.step.values, getStepIndex: function () { return jp.step.index; } }, jog2Helpers(), ctrl1);
          if (mv1 && !ctrl1.arrows) jogZButtonsInRow(jp, mv1); // Z only: next to the knob
          else if (mv1) {
            mv1.move.style.width = "100%";
            row.parentNode.insertBefore(mv1.move, row.nextSibling); // debajo de la perilla
          }
          // little keyboard (Settings > Controls to move > X / Y > Keyboard,
          // 2026-10-11): instead of knob / sliders (hidden), before
          // the tabs
          if (jp.kb.card) {
            var kbAncla = mv1 && ctrl1.arrows ? mv1.move : row;
            kbAncla.parentNode.insertBefore(jp.kb.card, kbAncla.nextSibling);
          }
        }
        jogKbPaint(jp.kb);
        // by role (08-role.js): a role that cannot move the machine keeps the position, the maximum speeds and STOP
        jogRoleApplyBuild(jogRoleNow(), { body: jp.body, keep: [jp.posT.mini, jp.posT.card, jp.axisMaxEl], quick: jp.quick });
      }

      // What a design assembler (12-jog2.js, 12-jog3.js, 12-jog4.js) receives from the panel of option 1.
      function jogPanelAssemblerCtx(jp) {
        var st = jp.step;
        return {
          axisModeRow: jp.axisModeRow,
          knobRow: jp.row,
          applyControls: function (ctrl) { jogApplyControls(jp, ctrl); },
          zButtonsInRow: function (mv) { return jogZButtonsInRow(jp, mv); },
          body: jp.body,
          statusEl: jp.statusEl,
          noticeEl: jogNoticeEl,
          stopRow: jp.stopRow,
          posT: jp.posT,
          speedSlider: jp.speedSlider,
          setStep: function (i) { st.index = i; st.distLabel(); },
          steps: st.values,
          getStepIndex: function () { return st.index; },
          keyboard: jp.kb.card, // tecladito dibujado (null si no va), 2026-10-11
          // design 2 has its own Paso, Velocidad and Home / Home Z in the main view and the fixed bar:
          // "Mas" keeps only what is not there
          // true when "More" would show something (14-advanced.js)
          moreHasSomething: function () { return jogMoreHasSomething(jp.tabBtns.advanced, jp.tabBar, jp.macrosHost); },
          removeRepeated: function (keepSpeed) {
            jp.speedRow.style.display = keepSpeed ? "" : "none"; jp.speedRow.style.width = "100%"; // the hive keeps the speed in More: as wide as More, or the slider collapses
            jp.axisMaxEl.style.display = "none"; // the Advanced > Limits and speeds section shows the same data
            if (jp.tabBtns.step) jp.tabBtns.step.style.display = "none";
            if (jp.tabSections.step) jp.tabSections.step.style.display = "none";
            // the Step tab is not here: if Advanced is shown, it is the tab in use
            if (jp.activeTab === "step" && jp.tabBtns.advanced && jp.tabBtns.advanced.style.display !== "none") jogSelectTab(jp, "advanced");
          },
        };
      }

      function jogPanelMount(jp) {
        var panel = jp.panel;
        document.body.appendChild(panel);
        jogPanelEl = panel;
        // phantom touch (see jogSwallowClickGhost): in capture, before
        // the buttons' stopPropagation
        panel.addEventListener("pointerup", jogNoteTouch, true);
        window.addEventListener("pointerdown", jogForgetTouch, true);
        window.addEventListener("click", jogSwallowClickGhost, true);
        jogPanelTeardownFns.push(function () {
          window.removeEventListener("pointerdown", jogForgetTouch, true);
          window.removeEventListener("click", jogSwallowClickGhost, true);
          jogTouch = null;
        });

        jogPosDraggable(panel, jp.header); // drag by the title bar; the place is a corner + percentage (15-pos.js)

        // See jogReclampPanel -- it reacts to any change in the
        // panel's height, from wherever it comes, without having to remember to call it
        // in every button that adds/opens content.
        if (typeof ResizeObserver !== "undefined") {
          var jogPanelRO = new ResizeObserver(function () {
            jogReclampPanel();
          });
          jogPanelRO.observe(panel);
          jogPanelTeardownFns.push(function () {
            jogPanelRO.disconnect();
          });
        }
        jogWinOn("resize", jogReclampPanel);
        jogWinOn("orientationchange", jogReclampPanel);
        jogWinOn("blur", jogHoldReset); // the window lost the focus: nothing stays enabled (15-hold.js)
        jogPanelTeardownFns.push(jogNoticeInsetClear); // the panel goes: nothing of it is kept free in the notices (15-notice-inset.js)

        jogSetControlsEnabled(jogEnabled);
        jogSetHomeEnabled(jogMachineFree());
        jogUpdateStatusText();

        var savedAxisMode = null;
        try {
          savedAxisMode = localStorage.getItem(JOG_AXIS_MODE_KEY);
        } catch (e) {
          /* default "free" */
        }
        jogApplyAxisMode(jp, savedAxisMode === "straight" ? "straight" : "free");
        // the saved axis mode (knob / tracks) must not bring back a control that Settings turned off
        // (arrows or keyboard for X/Y showed the knob or the two tracks again, plus the Z track)
        jogApplyControls(jp, jogControls(jogAjGet().style));

        if (jogFsBtn) {
          var wantsFs = false;
          try {
            wantsFs = localStorage.getItem(JOG_FS_KEY) === "1";
          } catch (e) {
            /* default false */
          }
          if (wantsFs) jogApplyFullscreen(true);
        }
      }
