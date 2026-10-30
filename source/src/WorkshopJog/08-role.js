      // ---- What each role sees in the Jog (F3-J of the redesign, 2026-10-21; pure, tested in tests/jog-role.test.js) ----
      //
      // The service applies the roles (dsf/permissions.py); the page only hides what the role cannot use. The rule reads the REAL operations
      // of the table through workshopCan(), never a role name:
      //   move      jog.xy / jog.z / jog.axis   operator and above (an operator only in the modes it may run)
      //   advanced  settings.set + motors.disable   technician and above: console, coordinates / G10 / positions, heaters / spindle,
      //             limits (M203 / M201 / M208), per-axis release, the link to the crash sensitivity in Motors
      // A viewer sees the position card and STOP (a stop is never blocked) and nothing that moves the machine.
      // Without identity (no users, an old service, no answer yet) workshopCan() says yes to everything: the full view, as before.

      var JOG_ROLE_MOVE_OPS = ["jog.xy", "jog.z", "jog.axis"];
      var JOG_ROLE_ADVANCED_OPS = ["settings.set", "motors.disable"];
      // The page of Motors (where the crash sensitivity is edited).
      var JOG_MOTORS_PATHS = ["/Plugins/Motors"];
      // The page of Machine (limits, coordinates and probing live there; the Jog only points to it).
      var JOG_MACHINE_PATHS = ["/Plugins/Machine"];

      // can(op, ctx) -> bool (workshopCan); mode = "Laser" | "CNC" | "FFF" | null. Returns {move, advanced, motorsLink, key}.
      function jogRoleView(can, mode) {
        if (typeof can !== "function") can = function () { return true; };
        var ctx = mode ? { mode: String(mode).toLowerCase() } : {};
        var move = JOG_ROLE_MOVE_OPS.some(function (op) { return can(op, ctx); });
        var advanced = move && JOG_ROLE_ADVANCED_OPS.every(function (op) { return can(op, ctx); });
        return { move: move, advanced: advanced, motorsLink: advanced, key: (move ? "m" : "-") + (advanced ? "a" : "-") };
      }

      function jogRoleNow() {
        return jogRoleView(typeof workshopCan === "function" ? workshopCan : null, typeof jogMachineMode === "undefined" ? null : jogMachineMode);
      }

      // A button of the Jog that is a copy of a button of the bar (same kind and same macro / code) while the bar is installed:
      // the bar owns it, so the Jog does not draw it a second time. barButtons = the list read from buttons.json (null = not read yet).
      function jogMacroIsBarDuplicate(macro, barButtons, barLoaded) {
        if (!barLoaded || !macro || !Array.isArray(barButtons)) return false;
        return barButtons.some(function (b) {
          return b && b.kind === macro.kind && b.action === macro.action;
        });
      }

      // First route of JOG_MOTORS_PATHS that exists (exists(path) -> bool); null when the page of Motors is not installed.
      function jogMotorsPath(exists) {
        for (var i = 0; i < JOG_MOTORS_PATHS.length; i++) if (exists(JOG_MOTORS_PATHS[i])) return JOG_MOTORS_PATHS[i];
        return null;
      }

      // First route of JOG_MACHINE_PATHS that exists (exists(path) -> bool); null when the page of Machine is not installed.
      function jogMachinePath(exists) {
        for (var i = 0; i < JOG_MACHINE_PATHS.length; i++) if (exists(JOG_MACHINE_PATHS[i])) return JOG_MACHINE_PATHS[i];
        return null;
      }
