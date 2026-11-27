      // ---- Jog panel: the drawn keyboard (arrows for X/Y, Page Up/Down for Z) (sections listed in 10-jog-panel.js) ----
      //
      // Off by default (the "Activate keyboard" button of the drawn keyboard), because capturing arrows on the WHOLE page without the user
      // asking could break other normal uses of those keys in DWC (scroll, etc). While it is off the listeners do nothing (they check
      // kb.active). It reuses jogSendXY/jogSendZ/jogSendStopXY/jogStopZHold -- the SAME functions already used by the knob and the Z
      // track, so it runs through the same backend/watchdog, with no second parallel movement mechanism.
      // Request 2026-10-11: Settings > What is shown > Controls to move > X / Y > Keyboard (controls.keyboard, of this screen) draws a
      // little keyboard in the main view of BOTH options with its button to activate it. It is the ONLY control for X/Y and Z then; on
      // touch screens without a mouse jogControls returns the factory ones (jogAjHasKeyboard, 18-settings.js), so it is never drawn.
      //
      // kb is the explicit state of the keyboard of one panel:
      //   active      the keyboard mode is on (the arrows move the machine)
      //   held        {"ArrowUp": true | "touch"} -- held now (true) or tapped, waiting to see if it is a step ("touch")
      //   zLastAt     last keydown of the held Z key (OS auto-repeat included), for the Z watchdog
      //   zPend       ev.code of a Z key waiting (tap or hold)
      //   timers      key -> timer of the pending tap ("__z" for Z)
      //   card / keys / toggleBtn / flash   the drawn keyboard (card null = it does not go on this screen), its keys, its button, the flashes of a tap
      // jogHeldZKey stays in the outer scope (10-jog.js): jogHeartbeat needs it.

      var JOG_KB_ID_ARROW = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      var JOG_KEY_VECTORS = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      var JOG_KEY_STEP = { ArrowUp: ["Y", 1], ArrowDown: ["Y", -1], ArrowLeft: ["X", -1], ArrowRight: ["X", 1] };
      // Tap vs hold (2026-10-10, request: "with the keyboard it only moves
      // if I hold; if I press once, wait and repeat, it does not
      // move"). The same as the +/- of the Step tab: releasing before JOG_KEY_HOLD_MS = ONE step
      // of the distance chosen in Step; holding = continuous until release.
      var JOG_KEY_HOLD_MS = 350;

      function jogKbState() {
        return { active: false, held: {}, zLastAt: 0, zPend: null, timers: {}, card: null, keys: {}, toggleBtn: null, flash: {} };
      }

      function jogKbIdZ(code) {
        if (code === "PageUp" || code === "Numpad9") return "zMore";
        if (code === "PageDown" || code === "Numpad3") return "zMinus";
        return null;
      }

      // Reported live 2026-10-08: "I use key 9 PgUp and key 3 PgDn but Z does not move" -- ev.key ONLY equals "PageUp"/"PageDown"
      // with NumLock OFF; with NumLock ON it gives "9"/"3". ev.code is the PHYSICAL key (it does not change with NumLock nor the
      // layout): both the dedicated Page Up/Down keys AND the numeric keypad are accepted.
      function jogKbZDirection(ev) {
        if (ev.code === "PageUp" || ev.code === "Numpad9") return 1;
        if (ev.code === "PageDown" || ev.code === "Numpad3") return -1;
        return 0;
      }

      function jogPanelKeyboard(jp) {
        var kb = jogKbState();
        jp.kb = kb;
        if (jogControls(jogAjGet().style).keyboard && jogAjHasKeyboard()) jogKbCardMake(kb);
        // jogCollapse() calls it when closing the panel: it turns off the keyboard mode
        // WITHOUT sending stops (jogReleaseAllHolds already sends them, in order).
        jogKbRepaint = function () {
          jogKbPaint(kb);
        };
        jogKeyboardOffHook = function () {
          kb.active = false;
          jogKbClear(kb);
          kb.held = {};
          jogKbPaint(kb);
        };
        if (kb.toggleBtn) {
          kb.toggleBtn.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
            ev.preventDefault(); // without focus: the arrows do not move this button's focus
          });
          kb.toggleBtn.addEventListener("pointerup", function (ev) {
            ev.stopPropagation();
            if (!kb.active && !jogEnabled) return; // blocked: it cannot be turned on
            jogKbSetActive(kb, !kb.active);
          });
        }
        jogKbListen(kb);
      }

      function jogKbCardMake(kb) {
        kb.card = document.createElement("div");
        kb.card.style.cssText = "width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;"; // a section of the panel, not a box inside it (tanda 1, 2026-11-23)
        // amber heartbeat of the held key (it moves the machine, DESIGN.md 2)
        var kbCss = document.createElement("style");
        kbCss.textContent = "@keyframes workshopJogKbPulse{0%,100%{box-shadow:0 0 0 0 rgb(255 143 0 / 0.75)}50%{box-shadow:0 0 0 4px rgb(255 143 0 / 0)}}";
        kb.card.appendChild(kbCss);
        // arrows in an inverted T on the left; Page Up / Page Down on the right
        var kbGrid = document.createElement("div");
        kbGrid.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(0,1.3fr);grid-template-rows:34px 34px;gap:4px;";
        kb.card.appendChild(kbGrid);
        [
          ["up", "▲", "Y+", 2, 1],
          ["left", "◀", "X-", 1, 2],
          ["down", "▼", "Y-", 2, 2],
          ["right", "▶", "X+", 3, 2],
          ["zMore", i18nT('jog.pgup'), i18nT('jog.z_up'), 4, 1],
          ["zMinus", i18nT('jog.pgdn'), i18nT('jog.z_down'), 4, 2],
        ].forEach(function (d) {
          var t = document.createElement("div");
          t.style.cssText =
            "grid-column:" + d[3] + ";grid-row:" + d[4] + ";display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;box-sizing:border-box;" +
            "border-radius:6px;border:1px solid rgba(255,255,255,0.23);border-bottom-width:3px;background:#37474f;color:#eceff1;line-height:1.1;" +
            "transition:background 80ms,transform 80ms,border-bottom-width 80ms,opacity 120ms;" + (d[0].charAt(0) === "z" ? "margin-left:6px;" : "");
          var a = document.createElement("span");
          a.style.cssText = "font-size:" + (d[0].charAt(0) === "z" ? "11px" : "12px") + ";font-weight:600;white-space:nowrap;";
          a.textContent = d[1];
          var b = document.createElement("span");
          b.style.cssText = "font-size:12px;color:#b0bec5;white-space:nowrap;";
          b.textContent = d[2];
          t.appendChild(a);
          t.appendChild(b);
          kbGrid.appendChild(t);
          kb.keys[d[0]] = t;
        });
        kb.keys.zMore.title = i18nT('jog.pgup_or_numpad_9_raises_z');
        kb.keys.zMinus.title = i18nT('jog.pgdn_or_numpad_3_lowers_z');

        kb.toggleBtn = document.createElement("button");
        kb.toggleBtn.type = "button";
        kb.toggleBtn.style.cssText = "width:100%;min-height:44px;border-radius:6px;border:1px solid rgba(255,255,255,0.23);background:transparent;color:#eceff1;font:inherit;font-size:12px;cursor:pointer;touch-action:none;padding:0 6px;";
        kb.card.appendChild(kb.toggleBtn);

        var kbHintThe = document.createElement("div");
        kbHintThe.style.cssText = "font-size:12px;color:#b0bec5;text-align:center;width:100%;";
        kbHintThe.textContent = i18nT('jog.tap_a_key_one_step_hold');
        kb.card.appendChild(kbHintThe);
      }

      // Paints each key according to what is happening NOW (it reads kb.held,
      // kb.zPend and jogHeldZKey, the same state that moves the machine,
      // so what is drawn never lies): off = dim gray; active = gray;
      // tapped (waiting to see if it is a step) = blue and sunken; held
      // (continuous) = amber, sunken and pulsing.
      function jogKbPaint(kb) {
        if (!kb.card) return;
        var ahora = Date.now();
        var state = {};
        Object.keys(kb.held).forEach(function (k) {
          if (JOG_KB_ID_ARROW[k]) state[JOG_KB_ID_ARROW[k]] = kb.held[k] === true ? "follows" : "touch";
        });
        if (kb.zPend && jogKbIdZ(kb.zPend)) state[jogKbIdZ(kb.zPend)] = "touch";
        if (jogHeldZKey && jogKbIdZ(jogHeldZKey)) state[jogKbIdZ(jogHeldZKey)] = "follows";
        Object.keys(kb.keys).forEach(function (id) {
          var t = kb.keys[id];
          var st = kb.active ? state[id] || (kb.flash[id] > ahora ? "touch" : "") : "";
          t.style.opacity = kb.active ? "1" : "0.45";
          t.style.background = st === "follows" ? "var(--wf-armed,#ff8f00)" : st === "touch" ? "#1976d2" : kb.active ? "#455a64" : "#37474f";
          t.style.transform = st ? "translateY(2px)" : "";
          t.style.borderBottomWidth = st ? "1px" : "3px";
          t.style.animation = st === "follows" ? "workshopJogKbPulse 0.8s ease-in-out infinite" : "";
          t.lastChild.style.color = st ? "#fff" : "#b0bec5";
        });
        if (kb.toggleBtn) {
          // encendido = verde (DESIGN.md 2: interruptor que prende algo)
          kb.toggleBtn.textContent = kb.active ? i18nT('jog.keyboard_active_tap_to_turn_off') : i18nT('jog.activate_keyboard');
          kb.toggleBtn.style.background = kb.active ? "#2e7d32" : "transparent";
          kb.toggleBtn.style.borderColor = kb.active ? "#2e7d32" : "rgba(255,255,255,0.23)";
          kb.toggleBtn.title = kb.active ? i18nT('jog.release_the_arrows_and_pgup_pgdn') : i18nT('jog.move_with_the_arrows_x_y');
          // blocked: the button is dimmed and does nothing
          kb.toggleBtn.style.opacity = jogEnabled || kb.active ? "1" : "0.4";
          kb.toggleBtn.style.cursor = jogEnabled ? "pointer" : "not-allowed";
        }
      }

      // A tap (one step) is seen pressed for an instant even though the key was already released.
      function jogKbFlash(kb, id) {
        if (!kb.card || !id) return;
        kb.flash[id] = Date.now() + 180;
        jogKbPaint(kb);
        setTimeout(function () {
          jogKbPaint(kb);
        }, 200);
      }

      function jogKbSetActive(kb, on) {
        if (on && !kb.card) return; // without a drawn little keyboard nothing is captured
        kb.active = on;
        if (!on) {
          jogKbClear(kb);
          kb.held = {};
          jogHeldZKey = null;
          jogKeyboardXYHeld = false;
          jogSendStopXY();
          jogStopZHold();
        }
        jogKbPaint(kb);
      }

      function jogKbRecomputeXY(kb) {
        var nx = 0;
        var ny = 0;
        Object.keys(kb.held).forEach(function (k) {
          var v = JOG_KEY_VECTORS[k];
          if (!v || kb.held[k] !== true) return; // "toque": todavia no es sostenido
          nx += v[0];
          ny += v[1];
        });
        var mag = Math.hypot(nx, ny);
        if (mag > 1) {
          nx /= mag;
          ny /= mag;
        }
        jogKbNX = nx;
        jogKbNY = ny;
        if (nx === 0 && ny === 0) {
          jogKeyboardXYHeld = false;
          jogSendXYStateOrStop();
        } else {
          jogKeyboardXYHeld = true;
          jogSendXY(nx, ny, true);
        }
      }

      function jogKbClear(kb) {
        Object.keys(kb.timers || {}).forEach(function (k) {
          clearTimeout(kb.timers[k]);
        });
        kb.timers = {};
        kb.zPend = null;
      }

      // The listeners of the page (keys, focus, visibility) and the Z watchdog, all removed with the panel (jogPanelTeardownFns).
      function jogKbListen(kb) {
        jogWinOn("keydown", function (ev) {
          jogKbKeyDown(kb, ev);
        });
        jogWinOn("keyup", function (ev) {
          jogKbKeyUp(kb, ev);
        });
        // If the window loses focus with a key held (alt-tab, switching apps on the phone, etc) the keyup would never arrive -- cut
        // everything just in case. 2026-10-11: the keyboard mode is turned OFF too (when returning to the window the arrows must not
        // move the machine unless the user activates it again). The same when hiding the browser tab (visibilitychange).
        function jogKbNoFocus() {
          jogKbLostFocus(kb);
        }
        jogWinOn("blur", jogKbNoFocus);
        function jogKbHidden() {
          if (document.hidden) jogKbLostFocus(kb);
        }
        document.addEventListener("visibilitychange", jogKbHidden);
        jogPanelTeardownFns.push(function () {
          document.removeEventListener("visibilitychange", jogKbHidden);
        });
        jogKbWatchdog(kb);
      }

      function jogKbKeyDown(kb, ev) {
        // isJogOpen(): with the panel closed (or closing) the keys
        // never move the machine, even if something left the keyboard mode ON.
        if (!kb.active || !jogEnabled || !isJogOpen()) return;
        // Ctrl/Cmd/Alt + key are browser shortcuts (Ctrl - / Ctrl + = zoom)
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        // Do not steal keys if the focus is on a real text field
        // (of this panel or of any other part of DWC).
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (JOG_KEY_VECTORS[ev.key]) {
          ev.preventDefault();
          if (!kb.held[ev.key]) {
            var k = ev.key;
            kb.held[k] = "touch";
            kb.timers[k] = setTimeout(function () {
              delete kb.timers[k];
              if (kb.held[k] !== "touch") return;
              kb.held[k] = true;
              jogKbRecomputeXY(kb);
              jogKbPaint(kb);
            }, JOG_KEY_HOLD_MS);
          }
          jogKbPaint(kb);
        } else if (jogKbZDirection(ev) !== 0) {
          ev.preventDefault();
          // It updates the "last seen" on EVERY keydown, including the OS auto-repeat (not just the first): it feeds the Z watchdog.
          kb.zLastAt = Date.now();
          // Held: the keyboard always sends full magnitude (-1 or 1);
          // jogSendZ saves the value in jogZHeldSign and the heartbeat
          // resends it while jogHeldZKey !== null.
          if (jogHeldZKey !== ev.code && kb.zPend !== ev.code) {
            var code = ev.code;
            var dirZ = jogKbZDirection(ev);
            kb.zPend = code;
            clearTimeout(kb.timers.__z);
            kb.timers.__z = setTimeout(function () {
              delete kb.timers.__z;
              if (kb.zPend !== code) return;
              kb.zPend = null;
              jogHeldZKey = code;
              kb.zLastAt = Date.now();
              jogSendZ(dirZ, true);
              jogKbPaint(kb);
            }, JOG_KEY_HOLD_MS);
          }
          jogKbPaint(kb);
        }
      }

      function jogKbKeyUp(kb, ev) {
        if (JOG_KEY_VECTORS[ev.key] && kb.held[ev.key] === "touch") {
          clearTimeout(kb.timers[ev.key]);
          delete kb.timers[ev.key];
          delete kb.held[ev.key];
          if (kb.active && jogEnabled && isJogOpen() && jogStepAxisFn) {
            jogStepAxisFn(JOG_KEY_STEP[ev.key][0], JOG_KEY_STEP[ev.key][1]);
            jogKbFlash(kb, JOG_KB_ID_ARROW[ev.key]);
          }
        } else if (JOG_KEY_VECTORS[ev.key] && kb.held[ev.key]) {
          delete kb.held[ev.key];
          if (kb.active) jogKbRecomputeXY(kb);
        } else if (jogKbZDirection(ev) !== 0) {
          if (kb.zPend === ev.code) {
            clearTimeout(kb.timers.__z);
            delete kb.timers.__z;
            kb.zPend = null;
            if (kb.active && jogEnabled && isJogOpen() && jogStepAxisFn) {
              jogStepAxisFn("Z", jogKbZDirection(ev));
              jogKbFlash(kb, jogKbIdZ(ev.code));
            }
          } else if (jogHeldZKey === ev.code) {
            jogHeldZKey = null;
            if (kb.active) jogStopZHold();
          }
        }
        jogKbPaint(kb);
      }

      function jogKbLostFocus(kb) {
        jogKbClear(kb);
        if (kb.active) jogKbSetActive(kb, false);
        else if (Object.keys(kb.held).length || jogHeldZKey) {
          kb.held = {};
          jogHeldZKey = null;
          jogKeyboardXYHeld = false;
        }
        jogKbPaint(kb);
      }

      // Safety net for "Z keeps moving when the key is released" (reported live 2026-10-08, a gaming laptop keyboard: Page Up/Down
      // behind an Fn combination may not generate a clean keyup). Without this, a lost keyup leaves jogZHeldSign held until the HARD
      // watchdog of the backend (Z_HOLD_MAX_S, 5 s). This timer runs every 300 ms (the rhythm of the heartbeat) and cuts if more than
      // 600 ms have passed with NO event at all (not even the OS auto-repeat) for the key we believe is held. When hiding the jog the
      // keyboard mode is turned off and the watchdog stopped.
      function jogKbWatchdog(kb) {
        var jogZKeyWatchdogTimer = setInterval(function () {
          if (jogHeldZKey !== null && Date.now() - kb.zLastAt > 600) {
            jogHeldZKey = null;
            if (kb.active) jogStopZHold();
            jogKbPaint(kb);
          }
        }, 300);
        jogPanelTeardownFns.push(function () {
          clearInterval(jogZKeyWatchdogTimer);
          jogKbClear(kb);
          kb.active = false;
          kb.held = {};
        });
      }
