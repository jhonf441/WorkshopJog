      // ---- Machine mode helpers of the jog (pure functions, tested in tests/jog-mode.test.js) ----
      //
      // The jog does not assume a machine type. The mode comes from state.machineMode ("Laser" | "CNC" | "FFF");
      // anything else (null, undefined, a name this plugin does not know) is "unknown" and behaves as "no mode
      // assumptions": generic movement only, nothing that belongs to one mode (docs-internal/JOG-AUDITORIA-MODES.md).

      var JOG_MODES = ["Laser", "CNC", "FFF"];

      // "Laser" | "CNC" | "FFF" | null
      function jogModeKnown(mode) {
        return JOG_MODES.indexOf(mode) >= 0 ? mode : null;
      }

      // " S0" only in Laser mode: there the S word of G1 is the laser power and a stale M3 could fire the beam. In CNC it
      // is the spindle speed (S0 would stop the spindle) and in FFF it means nothing.
      function jogS0(mode) {
        return jogModeKnown(mode) === "Laser" ? " S0" : "";
      }

      // The pointer / laser choice (and the laser correction of laser.json) exists only in Laser mode.
      function jogHasPoints(mode) {
        return jogModeKnown(mode) === "Laser";
      }
      function jogPointsEffective(mode, apunta) {
        return jogHasPoints(mode) && apunta === "laser" ? "laser" : "pointer";
      }

      // One relative step as ONE block (G91 / G1 / G90 stay together). partes = ["X1.000", "Z-0.500"].
      function jogBlockStep(mode, parts, feed) {
        return "G91\nG1 " + parts.join(" ") + " F" + Number(feed).toFixed(0) + jogS0(mode) + "\nG90";
      }

      // "Go to" sequence in machine coordinates: up in Z first, then X / Y, then down. xy = " X10.000 Y5.000" or "".
      // Z is optional (machines without Z): pass zSeg / zFin as null to skip those moves.
      function jogGoCodes(mode, zSec, xy, zEnd, f, fz) {
        var s = jogS0(mode), out = ["G90"];
        if (zSec !== null && zSec !== undefined) out.push("G53 G1 Z" + zSec.toFixed(3) + " F" + fz.toFixed(0) + s);
        if (xy) out.push("G53 G1" + xy + " F" + f.toFixed(0) + s);
        if (zEnd !== null && zEnd !== undefined) out.push("G53 G1 Z" + zEnd.toFixed(3) + " F" + fz.toFixed(0) + s);
        return out;
      }
