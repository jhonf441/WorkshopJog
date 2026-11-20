      // ---- Design 4: "Hive" (honeycomb around a wheel), 2026-11-10 ----
      //
      // A flat, compact design for small touch screens: a band with the active axis, the step and the HIVE button that opens the honeycomb; open, a wheel
      // in the middle (12-jog3.js: jogWheelMake) and hexagons around it, clockwise from the bottom left: A, X, Y, Z (tap = active axis, each shows its own
      // position, only the axes the machine has), Step (cycles the step list of Settings) and Zero (hold 0.7 s). STOP, E-STOP and "Hold to enable" are the
      // dock's (always in view, never inside this design); Home and everything else of the usual jog is inside "More".
      // Colors: the accent of Settings > Appearance, white on the panel, red for the zero fill. No gradients, no shadows.

      var JOG_HIVE_OPEN_KEY = "workshopJogHiveOpen";
      var JOG_HIVE_PAD_KEY = "workshopJogHivePad"; // the open hive shows the pad (X and Y together) instead of the wheel
      var JOG_HIVE_AXES = ["A", "X", "Y", "Z"]; // the hexagons of axes, in this order (the other axes are reached with the Axis button of the band)
      var JOG_HIVE_GAP = 12; // px between hexagons and between the wheel and the ring
      var JOG_HIVE_TOUCH = 44; // px: width of a hexagon (a finger)

      // The ring of the honeycomb, clockwise from the bottom left, in units of the distance to the ring.
      function jogHiveSlots() {
        var r = 0.866; // sqrt(3) / 2
        return [
          { x: -0.5, y: r },
          { x: -1, y: 0 },
          { x: -0.5, y: -r },
          { x: 0.5, y: -r },
          { x: 1, y: 0 },
          { x: 0.5, y: r },
        ];
      }

      // The cells of the ring for the axes the machine has: the axes (A X Y Z that exist), then Step and Zero.
      function jogHiveCells(have) {
        var cells = JOG_HIVE_AXES.filter(function (L) {
          return have.indexOf(L) >= 0;
        }).map(function (L) {
          return { id: "axis", axis: L };
        });
        cells.push({ id: "step" }, { id: "zero" });
        return cells;
      }

      function jogHiveSvg() {
        return '<svg viewBox="0 0 100 115.47" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none"><polygon points="50,2 98,29.7 98,85.8 50,113.5 2,85.8 2,29.7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.55" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
      }

      // The hive's bottom bar: the same honeycomb. Two rows of hexagons, the second one offset by half a cell: Home, X, Y, Z above; STOP, the enable button
      // (touch screens) and E-STOP below. 12 px between hexagons, none under 44 px wide. The actions are the common ones (jogDock*, 12-jog3.js).
      function jog4Dock(H) {
        var el = H.el;
        var touch = jogIsTouch();
        var accent = jogAjGet().accent;
        var c = JOG_HIVE_TOUCH;
        var step = c + JOG_HIVE_GAP; // between centres: 12 px between neighbours
        var h = Math.round(c * 1.1547);
        var rowDy = Math.round(step * 0.866);
        var W = 3 * step + c;
        var box = el("div", "width:100%;box-sizing:border-box;padding:10px 0 12px;display:flex;justify-content:center;color:#eceff1;");
        var area = el("div", "position:relative;width:" + W + "px;height:" + (h + rowDy) + "px;");
        box.appendChild(area);
        var cells = [];
        function hexAt(btn, col, row, text, fill) {
          btn.style.cssText = "position:absolute;padding:0;min-width:0;min-height:0;border:none;background:transparent;color:inherit;font:inherit;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1.1;cursor:pointer;touch-action:none;overflow:visible;width:" + c + "px;height:" + h + "px;left:" + (col * step + (row ? step / 2 : 0)) + "px;top:" + row * rowDy + "px;";
          btn.innerHTML = jogHiveSvg();
          var t = el("span", "position:relative;pointer-events:none;text-align:center;");
          t.className = "jp-t";
          t.textContent = text;
          btn.appendChild(t);
          var poly = btn.querySelector("polygon");
          if (fill) {
            poly.setAttribute("fill", fill);
            poly.setAttribute("fill-opacity", "1");
            poly.setAttribute("stroke", fill);
            btn.style.color = "#fff";
          }
          area.appendChild(btn);
          cells.push({ btn: btn, poly: poly });
          return btn;
        }
        var homes = [];
        jogDockHomes().forEach(function (hm, i) {
          var b = el("button");
          b.type = "button";
          b.title = hm[2] ? i18nT("jog.home_axis", { axis: hm[2] }) : i18nT("jog.home_all_axes_g28");
          hexAt(b, i, 0, hm[0]);
          jogDockHomeTap(b, hm[0], jogDockGoHome(hm[1]));
          homes.push(b);
        });
        var stop = jogStopButton("STOP", i18nT("pendant.stop_title"), "#e53935", "none", jogStopAll);
        hexAt(stop, 0, 1, "STOP", "#e53935");
        var enable = null;
        if (touch) {
          enable = jogHoldButtonMake("");
          enable.className = "";
          hexAt(enable, 1, 1, i18nT("hive.enable_short"));
        }
        var estop = jogStopButton("E-STOP", i18nT("jog.real_emergency_m112_one_tap"), "#b71c1c", "none", jogDockEmergency);
        hexAt(estop, 2, 1, "E-STOP", "#8e0000");
        estop.querySelector("polygon").setAttribute("stroke", "#fff");
        estop.querySelector("polygon").setAttribute("stroke-opacity", "1");
        var hexes = homes.concat(enable ? [enable] : []);
        if (!jogRoleNow().move) homes.forEach(jogRoleLockEl); // a role that cannot move the machine: Home is locked, like the usual row
        return {
          el: box,
          h: 150,
          paint: function () {
            var free = jogMachineFree() && jogRoleNow().move;
            homes.forEach(function (b) {
              jogDockSetEnabled(b, free); // Home needs the machine free
            });
            if (enable) {
              jogDockSetEnabled(enable, jogEnabled); // the enable hexagon is off while the machine cannot move
              var on = jogHoldOk() && jogEnabled;
              var poly = enable.querySelector("polygon");
              poly.setAttribute("fill", on ? "#43a047" : "currentColor");
              poly.setAttribute("fill-opacity", on ? "1" : "0.06");
              poly.setAttribute("stroke", on ? "#43a047" : "currentColor");
              enable.style.color = on ? "#fff" : "#eceff1";
            }
            void hexes;
            void accent;
          },
        };
      }

      function jog4Assemble(o) {
        jogAsmFrame(o, jog4Build.bind(null, o));
      }

      function jog4Build(o, root, H) {
        var el = H.el;
        var api = jogStepApi;
        var accent = jogAjGet().accent;
        var open = false, pad = false;
        try {
          open = localStorage.getItem(JOG_HIVE_OPEN_KEY) === "1";
          pad = localStorage.getItem(JOG_HIVE_PAD_KEY) === "1";
        } catch (e) {
          /* closed, wheel */
        }
        var card = el("div", "width:100%;max-width:100%;min-width:0;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:8px;border:1px solid rgba(255,255,255,0.18);border-radius:10px;color:#eceff1;overflow:hidden;");
        root.appendChild(card);
        var note = el("div", "min-height:14px;font-size:11px;text-align:center;color:var(--wf-n-down-text,#ffb74d);");
        var noteTimer = null;
        function say(t) {
          note.textContent = t;
          clearTimeout(noteTimer);
          noteTimer = setTimeout(function () {
            note.textContent = "";
          }, 2000);
        }
        function save(k, v) {
          try {
            localStorage.setItem(k, v ? "1" : "0");
          } catch (e) {
            /* not critical */
          }
        }
        var band = jog4Band(el, api, accent, function () {
          open = !open;
          save(JOG_HIVE_OPEN_KEY, open);
          layout();
          jogReclampPanel();
        }, function () {
          pad = !pad;
          save(JOG_HIVE_PAD_KEY, pad);
          layout();
          jogReclampPanel();
        });
        card.appendChild(band.el);
        var speedLine = el("div", "font-size:11px;font-variant-numeric:tabular-nums;color:#b0bec5;text-align:center;"); // the speed of the move, always in view
        card.appendChild(speedLine);
        var reach = el("div", "min-height:14px;font-size:11px;text-align:center;color:var(--wf-n-down-text,#ffb74d);font-variant-numeric:tabular-nums;"); // how to turn the wheel, then how far it will still move
        var honey = jog4Honey(el, api, accent, say, function () {
          reach.textContent = jogWheelReachText(api);
        });
        card.appendChild(honey.el);
        card.appendChild(reach);
        var zk = jogWheelZKeys(H, api, say); // Z+ / Z- under the honeycomb: Z is always at hand, whichever axis the wheel has
        var zRow = el("div", "display:none;align-self:center;gap:12px;");
        zRow.appendChild(zk.el);
        zk.el.style.flexDirection = "row";
        card.appendChild(zRow);
        // the pad: the knob of the usual jog (X and Y at the same time, with the curve and the soft start of Settings > Speed) and the Z slider
        var padBox = el("div", "display:none;align-self:center;justify-content:center;width:100%;");
        // the pad is made of the same direction keys as the pendant (8 directions + Z), cut as hexagons: it stays part of the honeycomb (no round knob)
        var mv = jog2Move(o, H, { knob: false, sliders: false, arrows: true, keyboard: false, zSlide: false, zBot: true });
        if (mv) {
          padBox.className = "jh4-pad";
          padBox.appendChild(mv.move);
          Array.prototype.forEach.call(mv.move.querySelectorAll("button"), function (b) {
            b.style.cssText += ";clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%);border:none!important;border-radius:0!important;background:" + accent + "!important;color:#fff!important;min-width:44px;min-height:48px;";
          });
        }
        card.appendChild(padBox);
        card.appendChild(note);
        var feed = jog3Feed(o, el); // the feed lives in the hive itself: there is no More
        card.appendChild(feed.el);
        function layout() {
          honey.el.style.display = open && !pad ? "block" : "none";
          reach.style.display = zRow.style.display = open && !pad ? "" : "none";
          if (open && !pad) zRow.style.display = "flex";
          padBox.style.display = open && pad && mv ? "flex" : "none";
          note.style.display = open ? "" : "none";
          paint(null);
        }
        function paint(status) {
          var pos = jogWheelPositions(status);
          band.paint(pos, open, pad, !!mv);
          if (open && !pad) honey.paint(pos);
          if (open && pad && mv) padBox.style.opacity = jogCanMove() ? "1" : "0.4";
          speedLine.textContent = jogWheelSpeedText(status);
          reach.textContent = jogWheelReachText(api);
          zk.paint();
          feed.paint();
        }
        layout();
        var dock = jog4Dock(H);
        function paintAll(status) {
          paint(status);
          dock.paint();
        }
        return { essential: card, paint: paintAll, hidesRepeated: true, noMore: true, dock: dock.el, dockH: dock.h };
      }

      // The band. Closed it is the whole design: the active axis with its position, the step, and HIVE. Open, the hexagons already show the axis, its position and
      // the step, so the band keeps only what they do not: HIVE (close) and the mode (wheel or pad). Nothing is shown twice.
      function jog4Band(el, api, accent, onToggle, onPad) {
        var box = el("div", "display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(72px,1.25fr);gap:12px;");
        function button(onTap) {
          var b = el("button", "min-width:44px;min-height:44px;padding:0 4px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer;touch-action:manipulation;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;");
          b.type = "button";
          b.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
          });
          b.addEventListener("click", function (ev) {
            ev.stopPropagation();
            onTap();
          });
          box.appendChild(b);
          return b;
        }
        var bAxis = button(function () {
          var list = jogWheelHave();
          if (list.length) api.setAxis(list[(Math.max(0, list.indexOf(api.getAxis())) + 1) % list.length]);
          jogPendantPaint(null);
        });
        var bStep = button(function () {
          api.setIndex((api.getIndex() + 1) % api.values.length);
          jogPendantPaint(null);
        });
        var bHive = button(onToggle);
        var bPad = button(onPad);
        bAxis.title = i18nT("hive.axis_title");
        bStep.title = i18nT("hive.step_title");
        function two(b, cap, val) {
          b.textContent = "";
          b.appendChild(el("span", "display:block;font-size:10px;font-weight:600;opacity:0.8;", cap));
          b.appendChild(el("span", "display:block;font-size:" + (val.length > 5 ? 12 : 14) + "px;font-weight:700;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;", val));
        }
        return {
          el: box,
          paint: function (pos, open, pad, hasPad) {
            var cur = api.getAxis();
            box.style.gridTemplateColumns = open ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr) minmax(72px,1.25fr)";
            bAxis.style.display = bStep.style.display = open ? "none" : "";
            bPad.style.display = open && hasPad ? "" : "none";
            var h = open ? 44 : 64; // closed, the band is the whole design: a little taller
            [bAxis, bStep, bHive, bPad].forEach(function (b) {
              b.style.minHeight = h + "px";
            });
            two(bAxis, i18nT("pendant.axis") + " " + cur, jogWheelPosText(pos[cur]));
            two(bStep, i18nT("pendant.step"), jogWheelStepText(api.values[api.getIndex()]));
            bHive.textContent = "";
            bHive.appendChild(el("span", "display:block;font-size:12px;font-weight:700;letter-spacing:0.5px;overflow:hidden;text-overflow:ellipsis;", i18nT("hive.name")));
            bHive.title = open ? i18nT("hive.close") : i18nT("hive.open");
            bHive.setAttribute("aria-label", bHive.title);
            bHive.setAttribute("aria-expanded", open ? "true" : "false");
            bHive.style.background = open ? accent : "transparent";
            bHive.style.borderColor = open ? accent : "rgba(255,255,255,0.4)";
            bHive.style.color = open ? "#fff" : "inherit";
            bPad.textContent = i18nT(pad ? "hive.mode_wheel" : "hive.mode_pad");
            bPad.title = i18nT("hive.mode_title");
            bPad.setAttribute("aria-pressed", pad ? "true" : "false");
          },
        };
      }

      // One hexagon of the ring: a button with the polygon behind its text. wire(b) hangs its gesture.
      function jog4Hex(el, c, h, left, top, title, wire) {
        var b = el("button", "position:absolute;padding:0;min-width:0;min-height:0;border:none;background:transparent;color:inherit;font:inherit;display:flex;align-items:center;justify-content:center;line-height:1.1;cursor:pointer;touch-action:manipulation;overflow:visible;");
        b.type = "button";
        b.innerHTML = jogHiveSvg();
        var t = el("span", "position:relative;pointer-events:none;text-align:center;");
        b.appendChild(t);
        b.style.cssText += ";width:" + c + "px;height:" + h + "px;left:" + left + "px;top:" + top + "px;";
        b.title = title;
        b.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
        });
        wire(b, t);
        return { el: b, t: t };
      }

      // The honeycomb: the wheel in the middle (12-jog3.js) and the ring of hexagons. The cells follow the axes the machine has.
      function jog4Honey(el, api, accent, say, onWheelMoved) {
        var c = JOG_HIVE_TOUCH;
        var D = c + JOG_HIVE_GAP; // distance to the ring: 12 px between neighbours
        var h = Math.round(c * 1.1547);
        var W = 2 * D + c;
        var Hh = Math.round(2 * D * 0.866 + h);
        var box = el("div", "position:relative;align-self:center;max-width:100%;width:" + W + "px;height:" + Hh + "px;");
        var wr = D - c / 2 - JOG_HIVE_GAP; // 12 px between the wheel and the ring
        var wheel = jogWheelMake(2 * wr, "flat", jogCanMove, function (sign) {
          api.move(api.getAxis(), sign);
          if (onWheelMoved) onWheelMoved();
        }, function () {
          say(i18nT(jogEnabled ? "pendant.hold_to_enable_note" : "pendant.not_ready"));
        }, function () {
          api.cancel();
          if (onWheelMoved) onWheelMoved();
        });
        wheel.el.style.cssText += ";position:absolute;left:" + (W / 2 - wr) + "px;top:" + (Hh / 2 - wr) + "px;";
        box.appendChild(wheel.el);
        var hex = {};
        var key = "";
        function build() {
          Object.keys(hex).forEach(function (k) {
            hex[k].el.remove();
          });
          hex = {};
          key = jogWheelHave().join("");
          var slots = jogHiveSlots();
          jogHiveCells(jogWheelHave()).forEach(function (cell, i) {
            var left = Math.round(W / 2 + slots[i].x * D - c / 2);
            var top = Math.round(Hh / 2 + slots[i].y * D - h / 2);
            var k = cell.id === "axis" ? "axis-" + cell.axis : cell.id;
            var title = cell.id === "axis" ? i18nT("pendant.axis_title", { ax: cell.axis }) : i18nT(cell.id === "step" ? "hive.step_title" : "hive.zero_title");
            var made = jog4Hex(el, c, h, left, top, title, function (b, t) {
              if (cell.id === "zero") {
                var fill = el("span", "position:absolute;left:10%;bottom:4%;width:80%;height:0;background:#e53935;opacity:0.5;pointer-events:none;");
                b.insertBefore(fill, t);
                jogZeroWire(b, api, say, function (on, ms) {
                  fill.style.transition = on ? "height " + ms + "ms linear" : "none";
                  fill.style.height = on ? "70%" : "0";
                });
                return;
              }
              b.addEventListener("click", function (ev) {
                ev.stopPropagation();
                if (cell.id === "axis") api.setAxis(cell.axis);
                else api.setIndex((api.getIndex() + 1) % api.values.length);
                jogPendantPaint(null);
              });
            });
            made.axis = cell.axis;
            hex[k] = made;
            box.appendChild(made.el);
          });
        }
        build();
        function text(b, cap, val) {
          b.t.textContent = "";
          b.t.appendChild(el("span", "display:block;font-size:10px;font-weight:600;opacity:0.8;", cap));
          if (val !== undefined) b.t.appendChild(el("span", "display:block;font-size:" + (val.length > 6 ? 9 : 11) + "px;font-weight:700;font-variant-numeric:tabular-nums;max-width:" + (JOG_HIVE_TOUCH - 8) + "px;overflow:hidden;", val));
        }
        return {
          el: box,
          paint: function (pos) {
            if (jogWheelHave().join("") !== key) build();
            var cur = api.getAxis();
            Object.keys(hex).forEach(function (k) {
              var b = hex[k];
              var on = false;
              if (k.indexOf("axis-") === 0) {
                text(b, b.axis, jogWheelPosText(pos[b.axis]));
                on = b.axis === cur;
                b.el.setAttribute("aria-pressed", on ? "true" : "false");
              } else if (k === "step") {
                text(b, i18nT("pendant.step"), jogWheelStepText(api.values[api.getIndex()]));
              } else {
                text(b, i18nT("hive.zero"), cur);
              }
              var poly = b.el.querySelector("polygon");
              poly.setAttribute("fill", on ? accent : "currentColor");
              poly.setAttribute("fill-opacity", on ? "1" : "0.06");
              poly.setAttribute("stroke", on ? accent : "currentColor");
              b.el.style.color = on ? "#fff" : "#eceff1"; // never "": a button without a color is black (and its outline with it)
            });
            wheel.setOn(jogCanMove());
            wheel.setHub(cur);
            if (hex.zero) jogDockSetEnabled(hex.zero.el, jogEnabled); // Zero changes a coordinate: the machine has to be ready
          },
        };
      }
