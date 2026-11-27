      // ---- The floating panel of the jog, built by sections (2026-11-23: the old createJogPanel, 2382 lines in one closure, split) ----
      //
      // jp is the explicit state of the panel being built: the elements and values that more than one section uses. Each section is a
      // plain function that takes jp (docs-internal/ARQUITECTURA.md); what only one section uses stays local to it. The order of the
      // calls below is the order the panel is built in: the DOM trace of tests/trace-modules.test.js freezes it.
      //   10-jog-panel-frame.js    the panel, the title bar, the status bar and the body
      //   10-jog-panel-dock.js     the dock under the body: quick Home / Z here, STOP / E-STOP
      //   10-jog-panel-xy.js       Free / Straight, the two X / Y tracks, the knob
      //   10-jog-panel-z.js        the Z track, the speed slider, the mouse wheel over the knob
      //   10-jog-panel-tabs.js     the tabs, the macro host, the collapsible sections, the position poll
      //   10-jog-panel-keys.js     the drawn keyboard and its keys (own state: kb)
      //   10-jog-panel-macros*.js  the macro buttons: saved list, form, the drawn buttons (own state: jm)
      //   10-jog-panel-step.js     the Step tab (own state: st)
      //   10-jog-panel-mount.js    the first tab, the design assembler, the role, the mount on the page

      function jogPanelState() {
        return {
          panel: null, header: null, statusBar: null, body: null, statusEl: null, posT: null, axisMaxEl: null, dock: null, quick: null,
          stopRow: null, axisModeRow: null, axisModeFreeBtn: null, axisModeStraightBtn: null, row: null, ring: null, knob: null,
          zTrack: null, zThumb: null, speedRow: null, speedSlider: null, tabBar: null, tabContent: null, tabSections: {}, tabBtns: {},
          activeTab: "step", advCover: null, stepSection: null, avUI: null, macrosHost: null, secMacros: null, advPollTimer: null,
          advLastAt: 0, kb: null, macros: null, step: null,
        };
      }

      function createJogPanel() {
        if (document.getElementById(JOG_PANEL_ID)) return;
        jogHomeButtons = []; // if the panel is recreated, do not drag buttons of the old one
        var jp = jogPanelState();
        jogPanelFrame(jp);
        jogPanelHeader(jp);
        jogPanelStatus(jp);
        jogPanelDock(jp);
        jogPanelQuick(jp);
        jogPanelStops(jp);
        jogPanelAxisMode(jp);
        jogPanelStraight(jp);
        jogPanelRing(jp);
        jogPanelZ(jp);
        jogPanelSpeed(jp);
        jogPanelTabs(jp);
        jogPanelMacroHost(jp);
        jogPanelAdvPollMount(jp);
        jogPanelKeyboard(jp);
        jogPanelWheel(jp);
        jogPanelMacros(jp);
        jogPanelStep(jp);
        jogPanelFirstTab(jp);
        jogPanelAssemble(jp);
        jogPanelMount(jp);
      }
