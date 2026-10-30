      // ---- Who has the control (F1-D, 2026-10-21) ----
      // One line under the status of the jog: "Beto tiene el control desde las 14:32" (or "Tienes el control"), a "Tomar el control"
      // button for a technician or an administrator (double tap) and the notice when somebody takes it from this browser. The data
      // and the texts are in src/_shared/07-control-holder.js; the service decides who may move (motion_owner.py).
      var jogControlEl = null;
      var jogControlSeen = { at: 0 };
      var jogControlKey = "";

      function jogControlEnsure() {
        if (!jogStatusEl || !jogStatusEl.parentNode) return null;
        if (jogControlEl && jogControlEl.parentNode === jogStatusEl.parentNode) return jogControlEl;
        jogControlEl = document.createElement("div");
        jogControlEl.style.cssText = "display:none;align-items:center;gap:6px;font-size:11px;color:#ffcc80;flex-wrap:wrap;";
        jogStatusEl.parentNode.insertBefore(jogControlEl, jogStatusEl.nextSibling);
        jogControlKey = "";
        return jogControlEl;
      }

      function jogControlPaint() {
        var el = jogControlEnsure();
        if (!el) return;
        var c = workshopControl();
        var can = workshopControlCanTake();
        var key = [c.held, c.mine, c.name, c.device, c.since, c.reason, can].join("|");
        if (key === jogControlKey) return;
        jogControlKey = key;
        el.innerHTML = "";
        // only the holder is shown when it is somebody (or something) else: when nobody has it or it is this browser, nothing to say
        if (!c.held || c.mine) {
          el.style.display = "none";
          return;
        }
        el.style.display = "flex";
        var t = document.createElement("span");
        t.textContent = workshopControlText(c);
        t.title = c.reason;
        el.appendChild(t);
        var b = workshopControlTakeButton(function (err) {
          if (err) jogShowNotice(String((err && err.message) || err), 6000);
        });
        if (b) {
          b.title = i18nT("control.take_tip");
          el.appendChild(b);
        }
      }

      function jogControlTick() {
        jogRoleSyncSafe(); // the mode may change what this role can run (17-role.js)
        jogControlPaint();
        var n = workshopControlNotice(jogControlSeen);
        if (n) {
          jogReleaseAllHolds(); // the service already stopped the movement: drop what this page was holding
          jogShowNotice(n.text, 8000);
        }
      }
