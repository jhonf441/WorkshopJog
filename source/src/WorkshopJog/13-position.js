      // ---- Position card: the same in both jog options ----
      // 2026-10-11 ("I really like the design that has position in design 2
      // but it lacks info; let it always be as in design 2 regarding its
      // location, and the configuration decides whether I see it or not"): before, option 1
      // had the foldable section "Position and speed" and option 2 its own
      // card, and in option 2 "More" showed option 1's again.
      // Now there is a single one: at the top, before the controls, with option 2's content
      // (large numbers, Zone / Machine, Pointer / Laser) and what only option 1
      // had (limits and speed reached). Settings > What is shown > Position
      // decides whether it is seen. It is fed by the polls that already exist (jogAdvPoll and option 2's):
      // actualizar(status) with the status from jogFetchStatus.
      var JOG_POS_CODES = ["G54", "G55", "G56", "G57", "G58", "G59", "G59.1", "G59.2", "G59.3"];

      function jogPosCard() {
        var H = jog2Helpers();
        var C = H.C, el = H.el, boton = H.button;
        var frame = jog2Get("workshopJog2Border", "zone");
        var apunta = jog2Get("workshopJog2Points", "pointer");
        var last = null; // {ax: {X,Y,Z} | null, zona: "G54"...}
        var speed = null; // {top, pedida} en mm/s

        var card = el("div", "width:100%;box-sizing:border-box;background:" + C.background + ";border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;");
        var top = el("div", "display:flex;align-items:center;gap:6px;flex-wrap:wrap;");
        card.appendChild(top);
        top.appendChild(el("span", "font-size:11px;color:" + C.sec + ";", i18nT('position.position')));
        var seg = el("span", "margin-left:auto;display:flex;border:1px solid " + C.edge + ";border-radius:6px;overflow:hidden;");
        top.appendChild(seg);
        var bZone = boton(i18nT('position.zone'), "border:none;border-radius:0;min-height:28px;", function () { frame = "zone"; jog2Set("workshopJog2Border", frame); paint(); });
        var bMachine = boton(i18nT('position.machine'), "border:none;border-radius:0;min-height:28px;", function () { frame = "machine"; jog2Set("workshopJog2Border", frame); paint(); });
        seg.appendChild(bZone);
        seg.appendChild(bMachine);
        // three boxes (the panel measures ~260 px: the numbers cannot go on one line)
        var nums = el("div", "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;");
        card.appendChild(nums);
        var numThe = {};
        ["X", "Y", "Z"].forEach(function (L) {
          var c = el("div", "background:#1e272c;border-radius:6px;padding:3px 2px;text-align:center;min-width:0;overflow:hidden;");
          c.appendChild(el("div", "color:" + C.sec + ";font-size:10px;font-weight:600;", L));
          numThe[L] = el("div", "font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:13px;font-weight:600;white-space:nowrap;", "--");
          c.appendChild(numThe[L]);
          // per-axis "go to zero" (like the DRO of the usual jog programs): moves
          // that axis to the zero of the active work area. X / Y ask for a second
          // tap (level 2); Z goes down to the contact, so the central risk dialog
          // confirms it (workzeroaxis.g A2 is a level 3 code).
          var idx = ["X", "Y", "Z"].indexOf(L);
          var ir = function () {
            if (jogBlockedExplain()) return;
            postCode('M98 P"0:/sys/workshop/macros/workzeroaxis.g" A' + idx).catch(function (e) { console.error("[WorkshopJog] ir a cero:", e); });
          };
          var css = "min-height:24px;margin-top:3px;width:100%;box-sizing:border-box;font-size:10px;padding:0 2px;";
          // fixed strings per axis so the translation layer can match them
          var etq = { X: i18nT('position.go_to_x0'), Y: i18nT('position.go_to_y0'), Z: i18nT('position.go_to_z0') }[L];
          var bIr = L === "Z" ? boton(etq, css, ir) : H.buttonDouble(etq, i18nT('jog2.go_2'), css, ir);
          bIr.title = { X: i18nT('position.raises_z_and_takes_x_to'), Y: i18nT('position.raises_z_and_takes_y_to'), Z: i18nT('position.slowly_goes_down_to_z0_of') }[L];
          c.appendChild(bIr);
          nums.appendChild(c);
        });
        var apRow = el("div", "display:flex;align-items:center;gap:6px;font-size:11px;color:" + C.sec + ";");
        card.appendChild(apRow);
        apRow.appendChild(document.createTextNode(i18nT('position.aims')));
        var bPunt = boton(i18nT('position.pointer'), "min-height:28px;border-radius:14px;", function () { apunta = "pointer"; jog2Set("workshopJog2Points", apunta); paint(); });
        var bThe = boton(i18nT('position.laser'), "min-height:28px;border-radius:14px;", function () { apunta = "laser"; jog2Set("workshopJog2Points", apunta); paint(); });
        apRow.appendChild(bPunt);
        apRow.appendChild(bThe);
        var zoneTxt = el("span", "margin-left:auto;font-size:11px;color:" + C.sec + ";");
        var zoneRow = el("div", "display:flex;");
        zoneRow.appendChild(zoneTxt);
        card.appendChild(zoneRow);
        // what belonged to option 1: limits and real speed (move.currentMove)
        function line(title) {
          // if it does not fit on one line, the value drops down whole (with the large jog the panel is narrow)
          var r = el("div", "display:flex;flex-wrap:wrap;column-gap:6px;font-size:10px;line-height:1.35;color:" + C.sec + ";min-width:0;");
          r.appendChild(el("span", "flex:none;", title));
          var v = el("span", "margin-left:auto;font-family:'IBM Plex Mono',ui-monospace,monospace;color:" + C.text + ";", "--");
          r.appendChild(v);
          card.appendChild(r);
          return v;
        }
        var limThe = line(i18nT('position.limits'));
        var speedThe = line(i18nT('position.speed_reached_requested'));

        // Compact copy of the position and the speed, pinned right under the status bar when the row of numbers
        // (X Y Z) of the card scrolls out of view (the content keeps scrolling normally under it). The wrapper has no
        // height, so showing or hiding the bar never moves the content (no flicker with the observer).
        var miniWrap = el("div", "width:100%;height:0;position:sticky;top:-8px;z-index:5;margin-bottom:-8px;flex:none;");
        var mini = el("div", "position:absolute;left:-8px;right:-8px;top:0;display:none;box-sizing:border-box;background:" + C.background + ";border-bottom:2px solid " + C.prim + ";box-shadow:0 2px 8px rgba(0,0,0,0.55);padding:5px 10px;font-family:'IBM Plex Mono',ui-monospace,monospace;color:" + C.text + ";pointer-events:none;display:none;align-items:center;flex-wrap:wrap;gap:3px 12px;");
        miniWrap.appendChild(mini);
        // 2026-10-16: the pinned bar says WHICH position it shows (zone G55 / machine, and what aims in machine) and gives each axis
        // its own cell: a coloured letter and a big number of fixed width (it does not dance while moving). The speed goes to
        // the right and is dimmed when the head is still. One cell per datum: when the panel is narrow they wrap whole.
        var AXIS_COL = { X: "#ef9a9a", Y: "#a5d6a7", Z: "#90caf9" };
        var miniFrame = el("span", "flex:none;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:10px;background:" + C.prim + ";color:#fff;white-space:nowrap;");
        mini.appendChild(miniFrame);
        var miniSp = {};
        var miniNum = {};
        ["X", "Y", "Z"].forEach(function (L) {
          miniSp[L] = el("span", "display:inline-flex;align-items:baseline;gap:4px;white-space:nowrap;");
          miniSp[L].appendChild(el("span", "font-size:11px;font-weight:700;color:" + AXIS_COL[L] + ";", L));
          miniNum[L] = el("span", "display:inline-block;min-width:62px;text-align:right;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;", "--");
          miniSp[L].appendChild(miniNum[L]);
          mini.appendChild(miniSp[L]);
        });
        miniSp.V = el("span", "display:inline-block;margin-left:auto;white-space:nowrap;font-size:11px;font-weight:600;");
        mini.appendChild(miniSp.V);
        if (typeof IntersectionObserver !== "undefined") {
          new IntersectionObserver(function (es) {
            var e = es[es.length - 1];
            mini.style.display = !e.isIntersecting && nums.offsetHeight > 0 ? "flex" : "none";
          }, { threshold: [0, 0.01] }).observe(nums);
        }

        function paint() {
          // the choice can also be made from another place (Advanced > axis control): read it again
          frame = jog2Get("workshopJog2Border", frame);
          apunta = jog2Get("workshopJog2Points", apunta);
          // pointer / laser exists only in Laser mode; in any other (or unknown) mode the pointer is the only aim
          var hayApunta = jogHasPoints(jogMachineMode);
          var apEf = jogPointsEffective(jogMachineMode, apunta);
          [[bZone, frame === "zone"], [bMachine, frame === "machine"], [bPunt, apEf === "pointer"], [bThe, apEf === "laser"]].forEach(function (x) {
            x[0].style.background = x[1] ? C.prim : "transparent";
            x[0].style.color = x[1] ? "#fff" : C.text;
          });
          apRow.style.display = frame === "machine" && hayApunta ? "flex" : "none"; // en la zona manda su propio offset
          var ax = last && last.ax;
          var correction = typeof tjLaserCorrection === "function" ? tjLaserCorrection() : null;
          ["X", "Y", "Z"].forEach(function (L) {
            if (!ax || !ax[L]) { numThe[L].textContent = "--"; return; }
            var v = frame === "machine" ? ax[L].machinePosition : ax[L].userPosition;
            if (frame === "machine" && apEf === "laser" && correction && L !== "Z") v -= L === "X" ? correction.x : correction.y;
            numThe[L].textContent = Number(v).toFixed(2);
          });
          zoneRow.style.display = frame === "zone" && last && last.zone ? "flex" : "none";
          zoneTxt.textContent = last ? last.zone : "";
          limThe.textContent = ax
            ? ["X", "Y", "Z"].filter(function (L) { return ax[L] && typeof ax[L].min === "number" && typeof ax[L].max === "number"; })
                .map(function (L) { return L + " " + ax[L].min.toFixed(0) + ".." + ax[L].max.toFixed(0); }).join("  ") || "--"
            : "--";
          speedThe.textContent = speed ? speed.top.toFixed(1) + " / " + speed.requested.toFixed(1) + " mm/s" : "--";
          ["X", "Y", "Z"].forEach(function (L) { miniNum[L].textContent = ax && numThe[L].textContent !== "--" ? numThe[L].textContent : "--"; });
          miniFrame.textContent = frame === "machine" ? i18nT('position.machine') + (!hayApunta ? "" : apEf === "laser" ? " / " + i18nT('position.laser') : " / " + i18nT('position.pointer')) : i18nT('position.zone') + (last && last.zone ? " " + last.zone : "");
          miniFrame.style.background = frame === "machine" ? "#6d4c41" : C.prim;
          miniSp.V.textContent = speed ? speed.top.toFixed(1) + " mm/s" : "";
          miniSp.V.style.opacity = speed && speed.top > 0.05 ? "1" : "0.45"; // dim when the head is still
        }
        paint();

        return {
          card: card,
          mini: miniWrap,
          update: function (s) {
            var axes = (s && s.move && s.move.axes) || [];
            var ax = {};
            axes.forEach(function (a) { if (a && ["X", "Y", "Z"].indexOf(a.letter) >= 0) ax[a.letter] = a; });
            var wn = s && s.move ? s.move.workplaceNumber : 0;
            last = { ax: ax.X && ax.Y ? ax : null, zone: JOG_POS_CODES[wn] || "" };
            var cm = s && s.move && s.move.currentMove;
            if (cm && typeof cm.topSpeed === "number") speed = { top: cm.topSpeed, requested: cm.requestedSpeed || 0 };
            paint();
          },
          // what option 2's "Go to" needs
          state: function () { return { ax: last && last.ax, border: frame, points: jogPointsEffective(jogMachineMode, apunta), num: function (L) { return numThe[L].textContent; } }; },
        };
      }
