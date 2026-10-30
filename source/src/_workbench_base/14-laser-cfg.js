      // ---- Laser configuration (read only): shared by the Jog and the Work table ----
      // 0:/sys/workshop/config/laser.json = { watts, correccion: {x, y, fecha}, foco }. The Jog position card
      // uses the laser <-> pointer correction; the saving of these values lives in _workbench_cut/15-cutarea.js.
      var TJ_LASER_CFG_FILE = "0:/sys/workshop/config/laser.json";
      var tjLaserWatts = 20;
      // The whole JSON (watts + laser<->pointer correction of the MACHINE, see
      // 37-calibrate.js): saving one does not erase the other.
      var tjLaserCfgAll = {};
      var tjLaserCfgListeners = [];
      function tjLoadLaserCfg() {
        return fetch("/machine/file/" + TJ_LASER_CFG_FILE, { cache: "no-store" })
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (c) {
            if (c && typeof c === "object") tjLaserCfgAll = c;
            if (c && c.watts > 0) tjLaserWatts = Number(c.watts);
            tjLaserCfgListeners.forEach(function (fn) { fn(); });
          })
          .catch(function () {
            /*  without a file: 20 W by default */
          });
      }
      function tjLaserCorrection() {
        var c = tjLaserCfgAll && tjLaserCfgAll.correction;
        return c && isFinite(c.x) && isFinite(c.y) ? c : null;
      }
      tjLoadLaserCfg();
