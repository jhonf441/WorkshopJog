      // ---- Design 3: the pendant itself (split from 12-jog3.js) ----

      // ---- design 3: the pendant ----
      //
      // Modern but real: a matte graphite body with a thin light edge, an OLED readout, an anodized aluminium wheel, switches with a ring of dots, soft rubber
      // keys, a status LED. The color of Settings > Appearance is the one color: the active axis, the pointers, the lit dots, the ring of the wheel.
      var JOG3_STYLE_ID = "workshop-jog-pendant-css";

      // No box around the pendant: its pieces sit straight on the panel and each one has its own volume (a recessed screen, a disc with thickness, switches
      // with a raised cap, keys with height that go down when pressed).
      function jog3Style() {
        if (document.getElementById(JOG3_STYLE_ID)) return;
        var P = "[data-jog-pendant]";
        var st = document.createElement("style");
        st.id = JOG3_STYLE_ID;
        st.textContent = [
          P + "{--jp3:#1976d2;}",
          P + " .jp3-keys button," + P + " .jp3-cap{background:repeating-linear-gradient(45deg,rgba(255,255,255,0.03) 0 2px,rgba(255,255,255,0) 2px 4px),linear-gradient(180deg,#434a50,#2b3035)!important;border:1px solid #11141 6!important;border-top-color:#59626a!important;border-radius:12px!important;color:#eef1f3!important;font-weight:700!important;box-shadow:0 4px 0 #0c0e10,0 7px 8px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.20)!important;transition:transform 60ms,box-shadow 60ms;}",
          P + " .jp3-keys button:active," + P + " .jp3-cap:active{transform:translateY(3px);box-shadow:0 1px 0 #0c0e10,0 2px 3px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.12)!important;}",
          P + " .jp3-keys > div > div:last-child button{background:linear-gradient(180deg,#34536f,#1f364b)!important;border-top-color:#5d8fbd!important;}",
          // Off keeps its relief (a key that cannot act is still a key, 3D like the others): a little dimmer and less saturated, with a legible label.
          // The inline opacity of jogDockSetEnabled loses against !important here.
          P + " .jp3-keys button[disabled]," + P + " .jp3-keys[data-off=\"1\"] button," + P + " .jp3-zkeys[data-off=\"1\"] button," + P + " .jp3-cap[data-disabled=\"1\"]{opacity:0.78!important;filter:saturate(0.5);color:#c4cbd1!important;transform:none!important;box-shadow:0 4px 0 #0c0e10,0 6px 6px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.14)!important;}",
          // Narrow (the usual pendant, drawn for 232 px): the wheel and Z+ / Z- on one row, the two selectors in a row under them. Wide: the selectors stay in a column.
          P + "[data-wide=\"0\"] .jp3-mid{flex-wrap:wrap;justify-content:center;row-gap:4px;}",
          P + "[data-wide=\"0\"] .jp3-dials{flex-direction:row!important;flex-basis:100%;justify-content:center;gap:28px!important;}",
          P + " .jp3-home{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;font-size:14px!important;line-height:1.1;}",
          P + " .jp3-home .jp-t{min-width:0;overflow:hidden;text-overflow:ellipsis;}",
          P + " .jp3-cap[data-armed=\"1\"]{background:linear-gradient(180deg,#d68a16,#8f5a05)!important;border-top-color:#ffcf7a!important;}",
          P + " .jp3-cell{transition:background 120ms;}",
          // every button of the pendant answers the touch at once (a class put by JS: a pointerdown with preventDefault does not always give :active on a touch screen):
          // it sinks 2 px, shrinks a little, goes darker and takes an inner shadow; a short ring says "sent" on STOP / E-STOP. Without motion under prefers-reduced-motion (the color stays).
          P + " button{transition:transform 90ms,filter 90ms,box-shadow 90ms;}",
          P + " button[data-pressed=\"1\"]{transform:translateY(2px) scale(0.96)!important;filter:brightness(0.86);box-shadow:inset 0 3px 6px rgba(0,0,0,0.55)!important;}",
          P + " [data-jog-stop][data-sent=\"1\"]{outline:3px solid rgba(255,255,255,0.9);outline-offset:3px;}",
          "@media (prefers-reduced-motion: reduce){" + P + " button{transition:none!important;}" + P + " button[data-pressed=\"1\"]{transform:none!important;}" + P + " .jp3-armbar{transition:none!important;}}",
          P + " input[type=range]{accent-color:var(--jp3);}",
        ].join("\n").replace("#11141 6", "#111416");
        document.head.appendChild(st);
      }

      // The state LED: a small light in the corner of the readout (green ready, amber waiting for "Hold to enable", gray locked). The word is its tooltip.
      function jog3Led(el) {
        var led = el("span", "position:absolute;top:9px;right:10px;width:8px;height:8px;border-radius:50%;background:#4b535a;box-shadow:inset 0 1px 1px rgba(0,0,0,0.6);transition:background 150ms,box-shadow 150ms;");
        return {
          el: led,
          paint: function () {
            var state = jogCanMove() ? "ready" : jogEnabled ? "hold" : "off";
            var color = { ready: "#43d17a", hold: "var(--wf-n-down-text,#ffb74d)", off: "#5d666d" }[state];
            led.style.background = color;
            led.style.boxShadow = state === "off" ? "inset 0 1px 1px rgba(0,0,0,0.6)" : "0 0 8px " + color + ",inset 0 1px 1px rgba(255,255,255,0.5)";
            var t = i18nT("pendant.led_" + state);
            if (led.title !== t) led.title = t;
          },
        };
      }

      // The feel of a press, the same for every button of the pendant: data-pressed from the first pointerdown (capture phase: the buttons stop the event for themselves)
      // until the finger lifts; STOP and E-STOP also get a ring (data-sent) for 0.45 s that says the order went (the order itself never waits for this).
      function jog3Press(root) {
        root.addEventListener("pointerdown", function (ev) {
          var b = ev.target && ev.target.closest ? ev.target.closest("button") : null;
          if (!b || !root.contains(b) || b.getAttribute("aria-disabled") === "true") return;
          b.setAttribute("data-pressed", "1");
          if (b.hasAttribute("data-jog-stop")) {
            b.setAttribute("data-sent", "1");
            setTimeout(function () {
              b.removeAttribute("data-sent");
            }, 450);
          }
        }, true);
        function release() {
          Array.prototype.forEach.call(root.querySelectorAll('[data-pressed="1"]'), function (b) {
            b.removeAttribute("data-pressed");
          });
        }
        ["pointerup", "pointercancel"].forEach(function (t) {
          window.addEventListener(t, release, true);
          jogPanelTeardownFns.push(function () {
            window.removeEventListener(t, release, true);
          });
        });
      }

      // "Z here" of the pendant: the SAME action as the button of the usual design (jogZHereAct in 10-jog.js: the probe homing of Z where the head is, X and Y must be homed, no movement
      // of X or Y) behind the common second tap (Tap again + the bar of 3 s). cls = the look (the position card or the Home bar). Returns the button.
      function jog3ZHereKey(el, cls) {
        var b = el("button", "min-width:0;font:inherit;cursor:pointer;touch-action:manipulation;");
        jogZHereKeyFill(b); // a cell like the Home keys: the arrow onto the floor over the words "Z here" (ux, 2026-11-23: the icon alone read "Z!")
        var label = i18nT("jog.z_here"); // what an armed key gives back
        b.type = "button";
        b.className = "jp3-cap " + cls;
        b.setAttribute("data-zhere", "");
        b.title = i18nT("jog.z_here_help");
        b.setAttribute("aria-label", i18nT("jog.z_here") + ": " + i18nT("jog.z_here_help"));
        jogDockHomeTap(b, label, function () {
          if (typeof jogZHereAct === "function") jogZHereAct();
        });
        if (!jogRoleNow().move) jogRoleLockEl(b);
        return b;
      }

      function jog3Assemble(o) {
        jogAsmFrame(o, jog3Build.bind(null, o));
      }

      function jog3Build(o, root, H) {
        var el = H.el;
        var api = jogStepApi;
        jog3Style();
        var card = el("div", "width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:2px 0 6px;color:#e9edf0;");
        card.setAttribute("data-jog-pendant", "");
        jog3Press(card);
        card.style.setProperty("--jp3", jogAjGet().accent);
        root.appendChild(card);
        var note = el("div", "min-height:14px;font-size:12px;text-align:center;color:var(--wf-n-down-text,#ffb74d);"); // what the wheel says when it cannot move
        var noteTimer = null;
        function say(t) {
          note.textContent = t;
          clearTimeout(noteTimer);
          noteTimer = setTimeout(function () {
            note.textContent = "";
          }, 2000);
        }
        var led = jog3Led(el);
        var lcd = jog3Lcd(el, api);
        var screen = el("div", "position:relative;");
        screen.appendChild(lcd.el);
        screen.appendChild(led.el);
        var speedLine = el("div", "margin-top:6px;min-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;letter-spacing:0.6px;color:#8e979e;font-family:'IBM Plex Mono',ui-monospace,monospace;text-align:left;padding-left:4px;"); // the speed of the move
        screen.appendChild(speedLine);
        card.appendChild(screen);
        var mid = el("div", "display:flex;align-items:center;justify-content:space-around;gap:8px;min-width:0;max-width:100%;");
        mid.className = "jp3-mid";
        card.setAttribute("data-wide", "0"); // jog3Wide switches it
        card.appendChild(mid);
        var reach = el("div", "margin-top:4px;height:54px;overflow:hidden;line-height:18px;font-size:12px;letter-spacing:0.6px;color:var(--wf-n-down-text,#ffb74d);font-family:'IBM Plex Mono',ui-monospace,monospace;text-align:left;padding-left:4px;"); // how far the wheel will still move
        screen.appendChild(reach);
        var wheel = jogWheelMake(150, "metal", jogCanMove, function (sign) {
          api.move(api.getAxis(), sign);
          reach.textContent = jogWheelReachText(api);
        }, function () {
          say(i18nT(jogEnabled ? "pendant.hold_to_enable_note" : "pendant.not_ready"));
        }, function () {
          api.cancel();
          reach.textContent = jogWheelReachText(api);
        });
        mid.appendChild(el("div", "padding:6px 6px 16px;max-width:100%;")).appendChild(wheel.el);
        var dials = jog3Dials(el, api);
        mid.appendChild(dials.el);
        card.appendChild(note);
        var zero = jog3ZeroButton(H, api, say);
        card.appendChild(zero.el);
        // the keypad: the same buttons as design 2 (a tap is one step, holding is continuous with the soft start of the knob)
        var keys = el("div", "display:flex;flex-direction:column;gap:6px;");
        keys.className = "jp3-keys";
        card.appendChild(keys);
        keys.appendChild(el("div", "font-size:12px;font-weight:700;letter-spacing:1.5px;color:#8e979e;text-transform:uppercase;", i18nT("pendant.keys")));
        var mv = jog2Move(o, H, { knob: false, sliders: false, arrows: true, keyboard: false, zSlide: false, zBot: false }); // Z is moved by the wheel (EJE = Z), never by its own keys
        if (mv) keys.appendChild(mv.move);
        else keys.style.display = "none";
        var feed = jog3Feed(o, el);
        card.appendChild(feed.el);
        jog3Wide(card, [screen, mid, note, zero.el, keys, feed.el]);
        var compact = jog3Compact(el, card, [zero.el, keys, feed.el], mv !== null);
        function paint(status) {
          compact.layout();
          led.paint();
          lcd.paint(status);
          dials.paint();
          wheel.setOn(jogCanMove());
          // the keys are off until the machine is ready (and, on a touch screen, enable is held): the CSS dims them and keeps their relief
          keys.setAttribute("data-off", jogCanMove() ? "0" : "1");
          wheel.setHub(api.getAxis());
          wheel.el.setAttribute("data-tip", i18nT("pendant.wheel_now", { ax: api.getAxis(), d: api.values[api.getIndex()] })); // what a click does NOW
          speedLine.textContent = jogWheelSpeedText(status);
          reach.textContent = jogWheelReachText(api);
          zero.paint(api.getAxis());
          feed.paint();
        }
        var dock = jog3Dock(H);
        function paintAll(status) {
          paint(status);
          dock.paint();
        }
        return { essential: mid, paint: paintAll, hidesRepeated: true, noMore: true, dock: dock.el, dockH: dock.h };
      }

      // The pendant's bottom bar: keycaps for Home, a round STOP push button, the enable pad (touch screens) and a mushroom emergency stop on its yellow ring.
      function jog3Dock(H) {
        var el = H.el;
        var touch = jogIsTouch();
        var box = el("div", "width:100%;box-sizing:border-box;padding:10px 8px 12px;display:flex;flex-direction:column;gap:14px;");
        box.setAttribute("data-jog-pendant", "");
        jog3Press(box);
        // the five Home keys always on ONE line (owner, 2026-11-23): a floating panel keeps its buttons compact, so a cell may be narrower than 44 px
        var homes = el("div", "display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:4px;");
        var homeBtns = [];
        jogDockHomes().forEach(function (h) {
          // five equal cells on one line: Home (the house), X, Y, Z (a small house and the letter) and Z here (its icon); the words are in aria-label and title
          var label = h[2] || "";
          var b = el("button", "min-height:40px;min-width:0;font:inherit;cursor:pointer;touch-action:manipulation;padding:0 2px;gap:2px;");
          var iconOnly = !h[2]; // Home (all): the house alone, the words in aria-label and title
          b.innerHTML = (iconOnly ? jogHomeIconHtml(22) : jogHomeIconHtml(13)) + '<span class="jp-t"></span>';
          b.lastChild.textContent = iconOnly ? "" : label;
          b.type = "button";
          b.className = "jp3-cap jp3-home";
          b.title = h[2] ? i18nT("jog.home_axis", { axis: h[2] }) : i18nT("jog.home_all_axes_g28");
          b.setAttribute("aria-label", b.title);
          jogDockHomeTap(b, iconOnly ? "" : label, jogDockGoHome(h[1]));
          homeBtns.push(b);
          homes.appendChild(b);
        });
        var zh = jog3ZHereKey(el, "jp3-home jp3-zhere-row");
        zh.style.cssText += ";min-height:40px;padding:0 2px;";
        homeBtns.push(zh);
        homes.appendChild(zh);
        if (!jogRoleNow().move) jogRoleLockEl(homes); // a role that cannot move the machine: Home is locked, like the usual row
        box.appendChild(homes);
        var row = el("div", "display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;"); // STOP, the enable pad, E-STOP: three columns that never overflow (note 11)
        row.setAttribute("data-jog-stops", "");
        box.appendChild(row);
        var stop = jogStopButton("STOP", i18nT("pendant.stop_title"), "#e65100", "none", jogStopAll);
        stop.style.cssText = "flex:none;width:" + JOG_TOUCH_STOP_PX + "px;height:" + JOG_TOUCH_STOP_PX + "px;min-width:0;padding:0;white-space:nowrap;border-radius:50%;border:1px solid #6a2200;background:radial-gradient(circle at 36% 28%,#ffb074,#e65100 55%,#9a3400);color:#fff;font-family:inherit;font-weight:700;font-size:12px;line-height:1;letter-spacing:0.3px;overflow:hidden;cursor:pointer;touch-action:none;-webkit-user-select:none;user-select:none;box-shadow:0 5px 0 #5a2000,0 8px 8px rgba(0,0,0,0.55),inset 0 2px 2px rgba(255,255,255,0.5);margin-bottom:5px;";
        row.appendChild(stop);
        var enable = null;
        if (touch) {
          enable = jogHoldButtonMake(i18nT("pendant.hold_to_enable"));
          enable.className = "jp3-cap";
          enable.style.cssText += ";width:auto;min-width:0;height:" + JOG_TOUCH_STOP_PX + "px;font-size:12px;line-height:1.15;padding:0 4px;margin-bottom:5px;white-space:normal;";
          row.appendChild(enable);
        } else {
          row.appendChild(el("div", "flex:1 1 0;"));
        }
        var estop = jogStopButton("E-STOP", i18nT("jog.real_emergency_m112_one_tap"), "#b71c1c", "none", jogDockEmergency);
        estop.style.cssText = "flex:none;width:" + JOG_TOUCH_STOP_PX + "px;height:" + JOG_TOUCH_STOP_PX + "px;min-width:0;padding:0;white-space:nowrap;margin:0 6px 5px 6px;border-radius:50%;border:none;background:radial-gradient(circle at 36% 26%,#ff8a80,#e53935 45%,#a31515 100%);color:#fff;font-family:inherit;font-weight:700;font-size:12px;line-height:1;letter-spacing:-0.2px;overflow:hidden;cursor:pointer;touch-action:none;-webkit-user-select:none;user-select:none;box-shadow:0 0 0 4px #f2c200,0 0 0 6px #17191b,0 8px 9px rgba(0,0,0,0.6),inset 0 3px 3px rgba(255,255,255,0.45);";
        row.appendChild(estop);
        return {
          el: box,
          h: 142, // one row of 40 px keys (Home, X, Y, Z, Z here) + the round STOP / E-STOP (48 px, the compact rule; one line of text)
          paint: function () {
            var free = jogMachineFree() && jogRoleNow().move;
            homeBtns.forEach(function (b) {
              jogDockSetEnabled(b, free); // Home needs the machine free
            });
            if (enable) {
              jogDockSetEnabled(enable, jogEnabled); // the enable pad is off while the machine cannot move
              var on = jogHoldOk() && jogEnabled;
              enable.style.setProperty("background", on ? "linear-gradient(180deg,#3ea86a,#1f6b40)" : "linear-gradient(180deg,#434a50,#2b3035)", "important");
              enable.style.setProperty("border-top-color", on ? "#7fe0a6" : "#59626a", "important");
            }
          },
        };
      }

      // Size S is the compact pendant: the readout, the wheel and the two switches, and one button that opens the zero bar, the keys and the feed. Before, S
      // only made the panel narrower and so taller; now it is also shorter (about half). M and W show everything. The choice of the button is remembered.
      var JOG3_KEYS_KEY = "workshopJogPendantKeys";

      function jog3Compact(el, card, parts, hasKeys) {
        var open = false;
        try {
          open = localStorage.getItem(JOG3_KEYS_KEY) === "1";
        } catch (e) {
          /* closed */
        }
        var btn = el("button", "min-height:44px;font:inherit;font-size:12px;cursor:pointer;touch-action:manipulation;margin-bottom:4px;");
        btn.type = "button";
        btn.className = "jp3-cap";
        btn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
        });
        btn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          open = !open;
          try {
            localStorage.setItem(JOG3_KEYS_KEY, open ? "1" : "0");
          } catch (e) {
            /* not critical */
          }
          layout();
          jogReclampPanel();
        });
        card.appendChild(btn);
        function isS() {
          var w = jogSizeState.size && jogSizeState.size.w ? jogSizeState.size.w : jogSizeDefaultW();
          return jogSizeNameOf(w) === "S";
        }
        function layout() {
          var s = isS();
          parts.forEach(function (p, i) {
            p.style.display = (s && !open) || (i === 1 && !hasKeys) ? "none" : "";
          });
          btn.style.display = s ? "" : "none";
          var t = i18nT(open ? "pendant.less_keys" : "pendant.more_keys");
          if (btn.textContent !== t) btn.textContent = t;
          btn.setAttribute("aria-expanded", open ? "true" : "false");
        }
        return { layout: layout };
      }

      // In a wide place (a wide window) the pendant is laid out in two columns: the wheel and the switches at the left, the
      // readout, zero bar, keys and feed at the right. In a narrow one it is the one tall column. parts = [wheel row, LCD, note, zero bar, keys, feed].
      function jog3Wide(card, parts) {
        // parts = [readout, wheel row, note, zero bar, keys, feed]: the wheel row at the left over all the rows, the rest in the right column
        var cols = [[2, "1"], [1, "1 / span 5"], [2, "2"], [2, "3"], [2, "4"], [2, "5"]];
        function apply() {
          var wide = card.clientWidth >= 420;
          if (card.getAttribute("data-wide") === (wide ? "1" : "0")) return;
          card.setAttribute("data-wide", wide ? "1" : "0");
          card.style.display = wide ? "grid" : "flex";
          card.style.gridTemplateColumns = wide ? "auto minmax(0,1fr)" : "";
          card.style.columnGap = wide ? "14px" : "";
          card.style.alignContent = wide ? "start" : "";
          parts.forEach(function (p, i) {
            p.style.gridColumn = wide ? String(cols[i][0]) : "";
            p.style.gridRow = wide ? cols[i][1] : "";
          });
          if (typeof jogReclampPanel === "function") jogReclampPanel();
        }
        if (typeof ResizeObserver === "function") {
          var ro = new ResizeObserver(apply);
          ro.observe(card);
          jogPanelTeardownFns.push(function () {
            ro.disconnect();
          });
        }
        apply();
      }

      // The readout: an OLED with one cell per axis (a button: it picks the axis); the active one has the accent color and a line under it.
      function jog3Lcd(el, api) {
        var box = el("div", "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:" + (jogIsTouch() ? 12 : 6) + "px;padding:10px 8px 8px;border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0) 38%),repeating-linear-gradient(0deg,rgba(255,255,255,0.03) 0 1px,rgba(255,255,255,0) 1px 3px),#040607;box-shadow:inset 0 0 0 2px #15191c,inset 0 4px 12px #000,0 1px 0 rgba(255,255,255,0.16),0 -1px 0 rgba(0,0,0,0.5);");
        var cells = {};
        var active = el("div", "grid-column:1 / -1;text-align:center;font-size:12px;font-weight:700;letter-spacing:0.4px;");
        var key = "";
        function build() {
          box.textContent = "";
          cells = {};
          key = jogWheelHave().join("");
          jogWheelHave().forEach(function (L) {
            var b = el("button", "position:relative;min-height:52px;min-width:0;padding:4px 6px 6px;border:none;border-radius:8px;background:transparent;color:#aeb7bd;font-family:'IBM Plex Mono',ui-monospace,monospace;cursor:pointer;touch-action:manipulation;text-align:right;line-height:1.1;");
            b.type = "button";
            b.className = "jp3-cell";
            b.title = i18nT("pendant.axis_title", { ax: L });
            b.appendChild(el("span", "display:block;font-size:12px;font-weight:700;letter-spacing:1px;text-align:left;opacity:0.85;", L));
            b.appendChild(el("span", "display:block;font-size:16px;font-weight:600;white-space:nowrap;margin-top:2px;", "--"));
            b.appendChild(el("span", "position:absolute;left:8px;right:8px;bottom:3px;height:3px;border-radius:2px;background:transparent;", ""));
            b.addEventListener("pointerdown", function (ev) {
              ev.stopPropagation();
            });
            b.addEventListener("click", function (ev) {
              ev.stopPropagation();
              api.setAxis(L);
              jogPendantPaint(null);
            });
            // Home and "Z here" live only in the bottom bar (jog3Dock): not repeated here (2026-11-22, requested: "Home only at the bottom")
            box.appendChild(b);
            cells[L] = b;
          });
          box.appendChild(active); // "Active axis: Z" under the three columns
        }
        build();
        return {
          el: box,
          paint: function (status) {
            if (jogWheelHave().join("") !== key) build();
            var pos = jogWheelPositions(status);
            var accent = jogAjGet().accent;
            active.textContent = i18nT("pendant.active_axis", { ax: api.getAxis() });
            active.style.color = accent;
            active.style.filter = "brightness(1.5)";
            Object.keys(cells).forEach(function (L) {
              var b = cells[L];
              var on = L === api.getAxis();
              b.children[1].textContent = jogWheelPosText(pos[L]);
              b.style.background = on ? "rgba(255,255,255,0.05)" : "transparent";
              b.style.color = on ? "#ffffff" : "#aeb7bd";
              b.children[1].style.textShadow = on ? "0 0 8px " + accent + "aa" : "none";
              b.children[0].style.color = on ? accent : "";
              b.children[2].style.background = on ? accent : "transparent";
              b.setAttribute("aria-pressed", on ? "true" : "false");
            });
          },
        };
      }

      // The two rotary switches, one over the other: the axis and the step (the step list of Settings > Steps). Rebuilt when the axes change.
      function jog3Dials(el, api) {
        var col = el("div", "display:flex;flex-direction:column;align-items:center;gap:8px;");
        col.className = "jp3-dials";
        var axisList = [];
        var axisDial = null;
        var stepDial = null;
        function build() {
          col.textContent = "";
          axisList = jogWheelHave();
          axisDial = jogRotaryMake(84, axisList, function () {
            return Math.max(0, axisList.indexOf(api.getAxis()));
          }, function (i) {
            api.setAxis(axisList[i]);
          }, i18nT("pendant.axis_dial"), i18nT("pendant.axis"));
          stepDial = jogRotaryMake(84, api.values.map(jogWheelStepText), api.getIndex, api.setIndex, i18nT("pendant.step_dial"), i18nT("pendant.step"));
          col.appendChild(axisDial.el);
          col.appendChild(stepDial.el);
        }
        build();
        return {
          el: col,
          paint: function () {
            if (jogWheelHave().join("") !== axisList.join("")) build();
            axisDial.paint();
            stepDial.paint();
          },
        };
      }

      // The feed: the same slider and the same saving as the speed row of option 1 (the speed of the keypad and of the wheel steps).
      function jog3Feed(o, el) {
        var row = el("div", "display:flex;align-items:center;gap:8px;flex-wrap:wrap;");
        row.appendChild(el("span", "font-size:12px;font-weight:700;letter-spacing:1.5px;color:#8e979e;text-transform:uppercase;", i18nT("pendant.feed")));
        var speed = el("input", "flex:1 1 90px;min-width:70px;");
        speed.type = "range";
        speed.min = o.speedSlider.min || "5";
        speed.max = o.speedSlider.max || "100";
        speed.step = o.speedSlider.step || "1";
        speed.value = o.speedSlider.value;
        speed.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
        });
        var txt = el("span", "font-size:12px;white-space:nowrap;color:#aeb7bd;width:100%;text-align:right;");
        row.appendChild(speed);
        row.appendChild(txt);
        function paint() {
          txt.textContent = Math.round(jogSpeedPercent) + " % · " + Math.round(jogMaxFeedXY()) + " mm/min";
        }
        speed.addEventListener("input", function () {
          o.speedSlider.value = speed.value;
          o.speedSlider.dispatchEvent(new Event("input")); // same value and saving as option 1
          paint();
        });
        paint();
        return { el: row, paint: paint };
      }

      // Hold-to-zero: holding the button 0.7 s sets the active axis to zero where the head is (G10 L20 P0: the work coordinate of that axis becomes 0).
      // A loose tap does nothing and says so. visual(on, ms) draws the fill that grows while it is held. Needs the machine ready (not "hold to enable":
      // it changes a coordinate, it does not move anything).
      function jogZeroWire(btn, api, note, visual) {
        var timer = null;
        function cancel() {
          clearTimeout(timer);
          timer = null;
          visual(false, 0);
        }
        btn.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!jogEnabled) return note(i18nT("pendant.not_ready"));
          visual(true, JOG_WHEEL_ZERO_MS);
          try {
            btn.setPointerCapture(ev.pointerId);
          } catch (e) {
            /* the release events still end it */
          }
          timer = setTimeout(function () {
            timer = null;
            visual(false, 0);
            if (jogBlockedExplain()) return;
            var ax = api.getAxis();
            postCode("G10 L20 P0 " + ax + "0").catch(function (e) {
              console.error("[WorkshopJog] zero:", e);
            });
            note(i18nT("pendant.zeroed", { ax: ax }));
          }, JOG_WHEEL_ZERO_MS);
        });
        ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (n) {
          btn.addEventListener(n, function () {
            if (timer) note(i18nT("pendant.zero_hold"));
            cancel();
          });
        });
      }

      // The zero bar of the pendant: a soft rubber bar; the accent color fills it while it is held (0.7 s).
      function jog3ZeroButton(H, api, note) {
        var el = H.el;
        var b = el("button", "position:relative;overflow:hidden;min-height:44px;font:inherit;font-size:12px;letter-spacing:0.3px;cursor:pointer;touch-action:none;-webkit-user-select:none;user-select:none;margin-bottom:4px;");
        b.type = "button";
        b.className = "jp3-cap";
        var fill = el("span", "position:absolute;left:0;top:0;bottom:0;width:0;background:" + jogAjGet().accent + ";opacity:0.75;pointer-events:none;");
        var label = el("span", "position:relative;");
        b.appendChild(fill);
        b.appendChild(label);
        jogZeroWire(b, api, note, function (on, ms) {
          fill.style.transition = on ? "width " + ms + "ms linear" : "none";
          fill.style.width = on ? "100%" : "0";
        });
        return {
          el: b,
          paint: function (ax) {
            var t = i18nT("pendant.zero_axis", { ax: ax });
            if (label.textContent !== t) label.textContent = t;
            jogDockSetEnabled(b, jogEnabled); // it changes a coordinate: the machine has to be ready
          },
        };
      }
