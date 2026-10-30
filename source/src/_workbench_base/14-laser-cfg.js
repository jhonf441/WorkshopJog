      // ---- Laser configuration (read only): shared by the Jog and the Work table ----
      // The "laser" settings store (workshopSettings of src/_shared/02-settings.js, service settings.get) = { watts, correction: {x, y, date}, focus }.
      // It is the ONE source of the laser <-> pointer correction of the machine (written by Machine > Offsets); the Jog position card and the
      // Workbench read it here, the zone files p<N>.g never stand in for it. The saving of the watts lives in _workbench_cut/15-cutarea.js.
      var tjLaserWatts = 20;
      // The whole value of the store (watts + correction + focus): saving one key does not erase the others (15-cutarea.js tjLaserCfgSave).
      var tjLaserCfgAll = {};
      var tjLaserCfgListeners = [];
      function tjLoadLaserCfg() {
        return workshopSettings
          .load("laser")
          .then(function (r) {
            var c = r && r.value;
            if (c && typeof c === "object") tjLaserCfgAll = c;
            if (c && c.watts > 0) tjLaserWatts = Number(c.watts);
            tjLaserCfgListeners.forEach(function (fn) { fn(); });
          })
          .catch(function () {
            /*  without the service: 20 W by default and no correction */
          });
      }
      function tjLaserCorrection() {
        var c = tjLaserCfgAll && tjLaserCfgAll.correction;
        return c && isFinite(c.x) && isFinite(c.y) ? c : null;
      }
      tjLoadLaserCfg();
