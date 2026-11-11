      // ---- Designs 3 ("Pendant") and 4 ("Hive") of the Jog: the shared frame, the MPG wheel and the rotary selector (2026-11-10) ----
      //
      // The settings sheet (the gear) picks the design of the panel: 1 = knob and tabs, 2 = by tasks (12-jog2.js), 3 = Pendant (this file: a realistic
      // handheld pendant with a handwheel, rotary selectors, an LCD readout and a keypad), 4 = Hive (12-jog4.js: honeycomb around a wheel).
      // Like design 2 they put their own view on top and keep the rest of the usual jog inside "More" (Advanced, macros, no limits...), so nothing is lost
      // and the settings that build those parts (tabs, sections, extra axes, macros) still work. "More" never repeats a control the design already has:
      // the pendant hides the knob, the sliders, Z, the Step tab and the speed row (it has them); the hive hides the same except the speed row (it has no feed control).
      // What these designs do NOT use is greyed in the sheet with the reason (18-settings.js: jogAjDesignOwnControls).
      //
      // A step of the wheel is the Step tab's own move (jogStepApi.move -> jogPasoEje: the same G91 / G1 / G90 block, the same feed rate, the same
      // gates) and it is behind jogCanMove(): the machine is ready AND, on a touch screen, "Hold to enable" is held (15-hold.js).

      var jogStylePaint = null; // the live part of the design in use: (status) -> repaints positions, active axis, step, enabled look

      function jogPendantPaint(status) {
        if (jogStylePaint) jogStylePaint(status);
      }

      // The assembler of a design number (null = the usual designs, built in 10-jog.js / 12-jog2.js).
      function jogAssembler(style) {
        if (style === 3) return jog3Assemble;
        if (style === 4 && typeof jog4Assemble === "function") return jog4Assemble;
        return null;
      }

      // ---- the Step tab's cells and what the designs read from the tab (the tab's own state stays in createJogPanel) ----

      // One cell per step value, the active one marked and with its number in view. It changes only with a tap on a cell (a click, never a graze or
      // a drag); cells are 44 px with 12 px between them on a touch screen: before it was a 20 px slider that a brush could move.
      // Returns the function that repaints the marks. getIndex / setIndex read and write the tab's index.
      function jogStepCellsMount(row, values, getIndex, setIndex) {
        row.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:" + (jogIsTouch() ? 12 : 4) + "px;width:100%;";
        var cells = [];
        function paint() {
          cells.forEach(function (b, i) {
            var on = i === getIndex();
            b.style.background = on ? "#1976d2" : "";
            b.style.color = on ? "#fff" : "";
            b.setAttribute("aria-pressed", on ? "true" : "false");
          });
        }
        values.forEach(function (v, i) {
          var cell = jogMakeSmallButton(String(v).replace(/^0\./, "."), i18nT("jog.step_distance") + ": " + v + " mm");
          cell.style.flex = "1 1 " + (jogIsTouch() ? 44 : 40) + "px";
          cell.style.minWidth = (jogIsTouch() ? 44 : 40) + "px";
          cell.style.touchAction = "manipulation";
          cell.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
          });
          cell.addEventListener("click", function (ev) {
            ev.stopPropagation();
            setIndex(i);
            paint();
            jogPendantPaint(null);
          });
          cells.push(cell);
          row.appendChild(cell);
        });
        paint();
        return paint;
      }

      // The Step tab's axis, distance and move, as design 3 and 4 need them. impl = { getIndex, setIndex, getAxis, setAxis, move }.
      function jogStepApiMake(values, impl) {
        return { values: values, getIndex: impl.getIndex, setIndex: impl.setIndex, getAxis: impl.getAxis, setAxis: impl.setAxis, move: impl.move };
      }

      // The axes the machine has (base + the extra ones that Settings did not hide), in the order of a pendant.
      function jogWheelHave() {
        var hidden = jogAjGet().axesHidden || [];
        return jogWheelAxes(
          jogBaseAxes.concat(
            jogAxesExtra.filter(function (L) {
              return hidden.indexOf(L) < 0;
            })
          )
        );
      }

      // The live positions {X: 10.5, ...} of a status (the object model) or of the last one read.
      function jogWheelPositions(status) {
        var st = status || (jogStatusCache && jogStatusCache.status) || null;
        var axes = (st && st.move && st.move.axes) || [];
        var pos = {};
        axes.forEach(function (a) {
          if (a && a.letter) pos[a.letter] = typeof a.userPosition === "number" ? a.userPosition : null;
        });
        return pos;
      }

      // The distance of the active step as short text: ".01", "1", "10".
      function jogWheelStepText(v) {
        return String(v).replace(/^0\./, ".");
      }


      // ---- the bottom bar of the designs 3 and 4 (the "dock") ----
      //
      // Every design may change everything, the bottom bar too: designs 1 and 2 keep the usual one (Home X Y Z, Z here, STOP / E-STOP), the pendant and the hive
      // draw their own, with the SAME actions behind it: STOP is jogStopAll, E-STOP is the M112 of jogEmergencyStop (one tap, no confirmation), Home is G28
      // behind a second tap and behind the machine being free, the enable button is the hold-to-enable of 15-hold.js. STOP and E-STOP are never behind a gate.
      // The old buttons stay in the page, hidden (their roles and gates keep working behind them).
      function jogDockHomes() {
        return [
          ["Home", "G28", null],
          ["X", "G28 X", "X"],
          ["Y", "G28 Y", "Y"],
          ["Z", "G28 Z", "Z"],
        ];
      }

      // A button that cannot act now LOOKS off and IS off: dim, pressed in (a keycap) or dashed (a hexagon), and it does not answer touches. Before, the
      // docks only dimmed Home while the machine was busy and the button still worked, so "dim" meant nothing. STOP and E-STOP are never put off.
      function jogDockSetEnabled(btn, on) {
        btn.setAttribute("data-disabled", on ? "0" : "1");
        btn.setAttribute("aria-disabled", on ? "false" : "true");
        btn.style.opacity = on ? "" : "0.38";
        btn.style.pointerEvents = on ? "" : "none";
        var poly = btn.querySelector("polygon");
        if (poly) poly.setAttribute("stroke-dasharray", on ? "" : "4 3");
      }

      // The M112 of E-STOP goes through the one function that sends it; its flash needs an element, a design that paints its own button gives it a dummy.
      function jogDockEmergency() {
        jogEmergencyStop({ style: {} });
      }

      // Home with a second tap: first tap writes "?" for 4 s, the second goes. btn = the button, text = its label, go() = what it does.
      function jogDockHomeTap(btn, text, go) {
        var armed = null;
        function reset() {
          clearTimeout(armed);
          armed = null;
          btn.setAttribute("data-armed", "0");
          jogDockLabel(btn, text);
        }
        btn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        btn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (!armed) {
            btn.setAttribute("data-armed", "1");
            jogDockLabel(btn, text + "?");
            armed = setTimeout(reset, 4000);
            return;
          }
          reset();
          go();
        });
      }

      // Writes the label of a dock button (a hexagon keeps its polygon: the text goes in its span).
      function jogDockLabel(btn, text) {
        var t = btn.querySelector(".jp-t");
        (t || btn).textContent = text;
      }

      // The Home actions as a function of the code.
      function jogDockGoHome(code) {
        return function () {
          if (jogBlockedExplain()) return;
          postCode(code).catch(function (e) {
            console.error("[WorkshopJog] home:", e);
          });
        };
      }

      // Places the design's own dock in the pinned dock of the panel and hides the usual buttons. dockH = the height it is drawn for (the size of the panel
      // is calculated with it).
      function jogDockReplace(dock, dockH) {
        if (!dock || typeof jogStopDockEl === "undefined" || !jogStopDockEl) return;
        Array.prototype.slice.call(jogStopDockEl.children).forEach(function (c) {
          c.style.display = "none";
        });
        jogStopDockEl.appendChild(dock);
        if (dockH) JOG_STOP_DOCK_H = dockH;
      }


      // The speed of the move in course (mm/s): { top, requested } or null. The position card reads the same field.
      function jogWheelSpeed(status) {
        var st = status || (jogStatusCache && jogStatusCache.status) || null;
        var cm = st && st.move && st.move.currentMove;
        return cm && typeof cm.topSpeed === "number" ? { top: cm.topSpeed, requested: cm.requestedSpeed || 0 } : null;
      }

      function jogWheelSpeedText(status) {
        var v = jogWheelSpeed(status);
        return i18nT("pendant.speed") + " " + (v ? v.top.toFixed(1) + " / " + v.requested.toFixed(1) : "-- / --") + " mm/s";
      }

      // ---- the shared frame: the design's own view on top, the usual jog inside "More" ----
      //
      // o is what 10-jog.js passes to jog2Assemble. build(root, H) draws the design inside `root` and returns { essential, paint(status), moreHidesSpeed }.
      function jogAsmFrame(o, build) {
        var body = o.body;
        var H = jog2Helpers();
        var C = H.C, el = H.el, boton = H.button;
        var root = el("div", "width:100%;display:flex;flex-direction:column;gap:8px;");
        var more = el("div", "width:100%;display:none;flex-direction:column;align-items:center;gap:8px;border-top:1px solid " + C.edge + ";padding-top:8px;");
        Array.prototype.slice.call(body.children).forEach(function (h) {
          if (h !== o.statusEl && h !== o.noticeEl && h !== o.stopRow && h !== o.posT.card && h !== o.posT.mini) more.appendChild(h);
        });
        body.insertBefore(root, body.firstChild);
        body.insertBefore(o.posT.mini, root); // the compact position / speed bar pinned under the status bar (13-position.js)
        var ui = build(root, H);
        jogDockReplace(ui.dock, ui.dockH); // the pendant and the hive have their own bottom bar
        if (ui.noMore) more.style.display = "none"; // what the design does not show stays out of the page (its parts still work behind it)
        root.appendChild(o.posT.card); // the full position card (limits, speeds, go to zero): Settings > What is shown > Position decides whether it is seen
        if (ui.essential && ui.essential.setAttribute) ui.essential.setAttribute("data-jog-essential", "");
        var bMore = boton(i18nT("jog2.more"), "min-height:" + (jogIsTouch() ? 44 : 36) + "px;", function () {
          var open = more.style.display === "none";
          more.style.display = open ? "flex" : "none";
          bMore.textContent = open ? i18nT("free.less") : i18nT("jog2.more");
        });
        bMore.title = i18nT("jog2.knob_z_home_step_advanced_tabs");
        if (!ui.noMore) root.appendChild(bMore); // the pendant and the hive keep it simple: no More, no Advanced, no macro buttons
        function paintMore() {
          var has = !ui.noMore && (typeof o.moreHasSomething !== "function" || o.moreHasSomething());
          bMore.style.display = has ? "" : "none";
          if (!has && more.style.display !== "none") {
            more.style.display = "none";
            bMore.textContent = i18nT("jog2.more");
          }
        }
        paintMore();
        if (typeof jogFreeBox !== "undefined" && jogFreeBox) root.appendChild(jogFreeBox);
        if (ui.hidesRepeated && o.removeRepeated) o.removeRepeated(ui.keepSpeed); // the Step tab, the limits line and (unless the design has no feed control) the speed row are in the design's own view
        body.appendChild(more);
        jogStylePaint = ui.paint;
        var reader = setInterval(function () {
          if (!document.body.contains(body)) {
            jogStylePaint = null;
            return clearInterval(reader);
          }
          if (body.offsetParent === null) return; // minimized or closed panel: nothing
          paintMore();
          jogFetchStatus(400).then(function (s) {
            o.posT.update(s);
            ui.paint(s);
          }).catch(function () { /* the jog already warns if there is no connection */ });
        }, 500);
        ui.paint(null);
        return ui;
      }
