      // ---- Designs 3 and 4: the MPG wheel and the rotary switch (split from 12-jog3.js) ----

      // The drawing of the pendant's wheel: a disc with real thickness and a dome in the middle. Returns the top face (its bezel takes the accent ring).
      function jogWheelMetal(w, rim, hub, size, accent) {
        var face = null;
        // A disc with real thickness and a dome in the middle: a soft contact shadow on the panel, the edge of the disc (a darker disc a few px lower), a
        // beveled bezel, the anodized aluminium rim (50 fine teeth, it turns, so the teeth and the dimple show the movement) and a domed hub.
        // the printed scale around the wheel (it does not turn): 50 marks, a longer one every 5 and an index mark at the top
        var scale = document.createElement("div");
        var ticks = "";
        for (var k = 0; k < JOG_WHEEL_MARKS; k++) ticks += '<line x1="0" y1="-49" x2="0" y2="' + (k % 5 === 0 ? -45 : -47) + '" transform="rotate(' + (k * 360) / JOG_WHEEL_MARKS + ')"/>';
        scale.style.cssText = "position:absolute;inset:-10px;pointer-events:none;";
        scale.innerHTML = '<svg viewBox="-50 -50 100 100" style="width:100%;height:100%;display:block"><g stroke="#7a838a" stroke-width="0.7">' + ticks + '</g><path d="M0 -50 l-2.2 -3.2 h4.4 z" fill="' + accent + '"/></svg>';
        var cast = document.createElement("div");
        cast.style.cssText = "position:absolute;left:4%;right:4%;bottom:-12%;height:22%;border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,0.6),rgba(0,0,0,0) 70%);pointer-events:none;";
        var edge = document.createElement("div");
        edge.style.cssText = "position:absolute;inset:0;border-radius:50%;transform:translateY(8px);background:linear-gradient(180deg,#8d969c 0%,#4f575d 45%,#1d2124 100%);box-shadow:0 2px 4px rgba(0,0,0,0.6);pointer-events:none;";
        face = document.createElement("div");
        face.style.cssText = "position:absolute;inset:0;border-radius:50%;background:linear-gradient(145deg,#4a5258,#1b1f22);box-shadow:inset 0 0 0 3px #1c2023,inset 0 3px 3px rgba(255,255,255,0.28),inset 0 -3px 3px rgba(0,0,0,0.5);pointer-events:none;";
        rim.style.inset = "7%";
        rim.style.background = "repeating-conic-gradient(from 0deg, #b9c1c7 0deg 3.6deg, #8b949b 3.6deg 7.2deg)";
        rim.style.boxShadow = "inset 0 0 0 1px rgba(0,0,0,0.55), inset 0 0 6px rgba(0,0,0,0.45)";
        var dimple = document.createElement("div");
        dimple.style.cssText = "position:absolute;left:50%;top:9%;width:17%;height:17%;margin-left:-8.5%;border-radius:50%;background:radial-gradient(circle at 50% 30%,#050607,#2c3338);box-shadow:inset 0 3px 4px #000,0 1px 0 rgba(255,255,255,0.35);";
        rim.appendChild(dimple);
        // the light does not turn with the wheel: one fixed specular sweep over the rim
        var shine = document.createElement("div");
        shine.style.cssText = "position:absolute;inset:0;border-radius:50%;pointer-events:none;background:conic-gradient(from 215deg, rgba(255,255,255,0.40), rgba(255,255,255,0) 20%, rgba(255,255,255,0) 52%, rgba(255,255,255,0.22) 72%, rgba(255,255,255,0));";
        hub.style.cssText += "inset:30%;background:radial-gradient(circle at 32% 24%,#ffffff 0%,#dfe4e7 16%,#98a1a8 52%,#4c545a 100%);box-shadow:0 6px 8px rgba(0,0,0,0.55),inset 0 -4px 6px rgba(0,0,0,0.35),inset 0 2px 2px rgba(255,255,255,0.8);color:#363d43;text-shadow:0 1px 0 rgba(255,255,255,0.7);font-size:" + Math.round(size * 0.2) + "px;letter-spacing:0;";
        w.appendChild(scale);
        w.appendChild(cast);
        w.appendChild(edge);
        w.appendChild(face);
        w.appendChild(rim);
        w.appendChild(shine);
        w.appendChild(hub);
        return face;
      }

      // ---- the MPG wheel ----
      //
      // 50 marks around it, a detent every 3.6 degrees (100 steps a turn), it turns with a finger around its centre. Each step is onStep(sign) (+1 clockwise);
      // while it is not enabled it is dimmed and a tap shows a short note. look "metal" is the pendant wheel: an anodized aluminium rim with fine knurling that
      // turns with the finger, a finger dimple, a brushed hub with the active axis engraved and a ring of the accent color that lights when it can move;
      // "flat" is the flat honeycomb one. Returns { el, setOn(on), setHub(text) }.
      function jogWheelMake(size, look, canMove, onStep, onBlocked) {
        var metal = look === "metal";
        var accent = jogAjGet().accent;
        var w = document.createElement("div");
        w.setAttribute("data-jog-wheel", "");
        w.setAttribute("role", "slider");
        w.setAttribute("aria-label", i18nT("pendant.wheel_title"));
        w.style.cssText = "position:relative;flex:none;width:" + size + "px;height:" + size + "px;border-radius:50%;touch-action:none;-webkit-user-select:none;user-select:none;";
        var rim = document.createElement("div");
        rim.style.cssText = "position:absolute;inset:0;border-radius:50%;will-change:transform;";
        var hub = document.createElement("div");
        hub.style.cssText = "position:absolute;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;pointer-events:none;";
        var face = null; // the top of the disc (its bezel takes the accent ring)
        if (metal) {
          face = jogWheelMetal(w, rim, hub, size, accent);
        } else {
          var marks = "";
          for (var i = 0; i < JOG_WHEEL_MARKS; i++) {
            marks += '<line x1="0" y1="-46" x2="0" y2="' + (i % 5 === 0 ? -38 : -41) + '" transform="rotate(' + (i * 360) / JOG_WHEEL_MARKS + ')"/>';
          }
          rim.innerHTML = '<svg viewBox="-50 -50 100 100" style="width:100%;height:100%;display:block;pointer-events:none"><g stroke="currentColor" stroke-width="1.2" opacity="0.7">' + marks + "</g></svg>";
          rim.style.border = "1px solid currentColor";
          hub.style.cssText += "inset:30%;font-size:" + Math.round(size * 0.2) + "px;opacity:0.85;";
          w.appendChild(rim);
          w.appendChild(hub);
        }
        var rot = 0, acc = 0, last = null, pid = null;
        function ang(ev) {
          var r = w.getBoundingClientRect();
          return jogWheelAngle(r.left + r.width / 2, r.top + r.height / 2, ev.clientX, ev.clientY);
        }
        w.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!canMove()) return onBlocked();
          pid = ev.pointerId;
          last = ang(ev);
          acc = 0;
          try {
            w.setPointerCapture(pid);
          } catch (e) {
            /* the events below still end it */
          }
        });
        w.addEventListener("pointermove", function (ev) {
          if (pid === null || ev.pointerId !== pid || !canMove()) return;
          var now = ang(ev);
          var turn = jogWheelTurn(last, now);
          last = now;
          rot += turn;
          rim.style.transform = "rotate(" + rot.toFixed(1) + "deg)";
          var r = jogWheelAdd(acc, turn);
          acc = r.acc;
          var sign = r.steps < 0 ? -1 : 1;
          for (var i = 0; i < Math.abs(r.steps); i++) {
            if (!jogWheelAccept(jogStepPending())) break; // the rest is dropped: no queue that keeps moving after the finger left
            try {
              if (navigator.vibrate) navigator.vibrate(6);
            } catch (e) {
              /* not every device vibrates */
            }
            onStep(sign);
          }
        });
        function end(ev) {
          if (pid === null || ev.pointerId !== pid) return;
          pid = null;
          acc = 0;
        }
        w.addEventListener("pointerup", end);
        w.addEventListener("pointercancel", end);
        return {
          el: w,
          setOn: function (on) {
            w.style.opacity = on ? "1" : "0.45";
            w.style.filter = on ? "" : "grayscale(1)"; // clearly off: grey and dim (a tap says why)
            w.setAttribute("data-on", on ? "1" : "0");
            if (face) face.style.boxShadow = (on ? "inset 0 0 0 3px " + accent + ",0 0 12px " + accent + "88," : "inset 0 0 0 3px #1c2023,") + "inset 0 3px 3px rgba(255,255,255,0.28),inset 0 -3px 3px rgba(0,0,0,0.5)";
          },
          setHub: function (text) {
            if (hub.textContent !== text) hub.textContent = text;
          },
        };
      }

      // ---- the rotary selector (a pendant's axis and step switches) ----
      //
      // A metal cap with a pointer, a ring of dots around it (one per position, the chosen one lit with the accent color) and the chosen value written
      // under it. Turn it with a finger or tap it: the right half goes to the next position, the left half to the previous one; it stops at both ends. Returns
      // { el, paint() }: the caller gives the name of the switch and the text of each position; getIndex / setIndex read and write the choice.
      function jogRotaryMake(size, labels, getIndex, setIndex, title, name) {
        var accent = jogAjGet().accent;
        var wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:3px;";
        var box = document.createElement("button");
        box.type = "button";
        box.title = title;
        box.setAttribute("aria-label", title);
        box.style.cssText = "position:relative;flex:none;width:" + size + "px;height:" + size + "px;padding:0;border:none;border-radius:50%;background:radial-gradient(circle at 50% 38%,#20252a,#0f1214);box-shadow:inset 0 3px 6px rgba(0,0,0,0.8),inset 0 -1px 0 rgba(255,255,255,0.10),0 1px 0 rgba(255,255,255,0.12);cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none;";
        var angles = jogSelectorAngles(labels.length, 250);
        var r = size * 0.43;
        var dots = angles.map(function (a) {
          var d = document.createElement("span");
          d.style.cssText = "position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#59626a;pointer-events:none;transition:background 120ms,box-shadow 120ms;transform:rotate(" + a + "deg) translateY(-" + r + "px);";
          box.appendChild(d);
          return d;
        });
        var grip = document.createElement("div"); // the knurled edge of the switch
        grip.style.cssText = "position:absolute;inset:20%;border-radius:50%;background:repeating-conic-gradient(from 0deg,#aab2b8 0deg 6deg,#6f787f 6deg 12deg);box-shadow:0 5px 0 #3d444a,0 8px 7px rgba(0,0,0,0.6);pointer-events:none;margin-top:-3px;transition:transform 120ms ease-out;";
        box.appendChild(grip);
        var knob = document.createElement("div");
        knob.style.cssText = "position:absolute;inset:27%;border-radius:50%;background:radial-gradient(circle at 34% 26%,rgba(255,255,255,0.85),rgba(255,255,255,0) 40%),conic-gradient(from 20deg,#e8ecee,#9aa3a9,#e1e6e8,#868f95,#e8ecee);box-shadow:0 5px 0 #4b535a,0 8px 7px rgba(0,0,0,0.6),inset 0 -2px 3px rgba(0,0,0,0.35);pointer-events:none;transition:transform 120ms ease-out;margin-top:-3px;";
        var pointer = document.createElement("div");
        pointer.style.cssText = "position:absolute;left:50%;top:7%;width:3px;height:30%;margin-left:-1.5px;border-radius:2px;background:" + accent + ";";
        knob.appendChild(pointer);
        box.appendChild(knob);
        var cap = document.createElement("div");
        cap.style.cssText = "font-size:10px;font-weight:700;letter-spacing:0.8px;color:#9aa3aa;text-transform:uppercase;white-space:nowrap;";
        wrap.appendChild(box);
        wrap.appendChild(cap);
        // Like a real rotary switch: it has two ends (it does not wrap round: before, going past the last step swung the knob back through the whole arc), it
        // clicks into a position, and it can be turned with a finger (drag around the cap) or tapped (right half = next, left half = previous).
        var pid = null, moved = false, startX = 0, startY = 0, lastTap = 0;
        function nearest(ev) {
          var r = box.getBoundingClientRect();
          var a = jogWheelAngle(r.left + r.width / 2, r.top + r.height / 2, ev.clientX, ev.clientY);
          var best = 0;
          angles.forEach(function (v, k) {
            if (Math.abs(v - a) < Math.abs(angles[best] - a)) best = k;
          });
          return best;
        }
        box.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          pid = ev.pointerId;
          moved = false;
          startX = ev.clientX;
          startY = ev.clientY;
          try {
            box.setPointerCapture(pid);
          } catch (e) {
            /* the events below still end it */
          }
        });
        box.addEventListener("pointermove", function (ev) {
          if (pid === null || ev.pointerId !== pid) return;
          if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return; // a tap that wobbles is still a tap
          moved = true;
          var i = nearest(ev);
          if (i !== getIndex()) {
            setIndex(i);
            jogPendantPaint(null);
          }
        });
        function end(ev) {
          if (pid === null || ev.pointerId !== pid) return;
          pid = null;
          if (moved) lastTap = Date.now(); // the click that follows a turn is not a tap
        }
        box.addEventListener("pointerup", end);
        box.addEventListener("pointercancel", end);
        box.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (Date.now() - lastTap < 400) return;
          var rect = box.getBoundingClientRect();
          var right = ev.clientX >= rect.left + rect.width / 2;
          var i = Math.max(0, Math.min(labels.length - 1, getIndex() + (right ? 1 : -1)));
          if (i === getIndex()) return;
          setIndex(i);
          jogPendantPaint(null);
        });
        return {
          el: wrap,
          paint: function () {
            var i = Math.max(0, Math.min(labels.length - 1, getIndex()));
            knob.style.transform = "rotate(" + angles[i] + "deg)";
            grip.style.transform = "rotate(" + angles[i] + "deg)";
            dots.forEach(function (d, k) {
              d.style.background = k === i ? accent : "#59626a";
              d.style.boxShadow = k === i ? "0 0 6px " + accent : "none";
            });
            var t = name + " " + labels[i];
            if (cap.textContent !== t) cap.textContent = t;
          },
        };
      }
