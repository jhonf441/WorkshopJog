      // ---- Block with reason in the Jog (step 8 of the access control, document PASO8-PLUGINS: "Despues: los que ya comprueban por nivel") ----
      // The Jog already says why it does not move (17-role-reason.js: ONE persistent reason under the status line) and covers the locked tabs (08-role.js,
      // jogRoleCover). This EXTENDS those two sentences: their source becomes the answer of the service (the shared 09-access-reason.js, ONE batched auth.can
      // per panel), so a profile, a ceiling or a condition is explained too; the sentence of the role stays as the fallback until the service has answered.
      //   move      jog.xy, jog.z, jog.axis, jog.free          the reason under the status line
      //   advanced  settings.set, motors.disable               the cover of the Advanced tab and of the speed and macros pages
      // NEVER here: jog.stop_xy, jog.stop_z and jog.stop_axis are stops. They are not in a group, they are never asked (workshopAccessWant leaves a stop out
      // anyway), and the code that sends them (postJogCommand callers, 10-jog.js) calls nothing of this file. Nothing here changes what a button does, its size
      // or its confirmation: it only changes the words of a reason that was already drawn.
      var JOG_ACCESS_OPS = {
        move: ["jog.xy", "jog.z", "jog.axis", "jog.free"],
        advanced: ["settings.set", "motors.disable"],
      };
      var JOG_ACCESS_NEED = { move: "operator", advanced: "technician" };

      // The note of a group from the service, { kind, text, cause }, or null while it has not answered (or nothing blocks): the caller keeps its own sentence
      function jogAccessNote(group) {
        if (typeof workshopAccessNote !== "function") return null;
        return workshopAccessNote(JOG_ACCESS_OPS[group] || [], { need: JOG_ACCESS_NEED[group], service: false });
      }

      // Asks the service about both groups in the batch of the page, then lets the panel follow the answers (workshopCan follows them: a view that changes is
      // rebuilt by jogRoleSync and the reason is painted again). It never asks a stop. Cheap to repeat: the store keeps the answers for 30 s.
      function jogAccessAsk() {
        if (typeof workshopAccessWant !== "function" || pluginStopped || jogRoleKey === null) return; // no panel, no ask
        var items = JOG_ACCESS_OPS.move.concat(JOG_ACCESS_OPS.advanced);
        workshopAccessWant(items).then(function () {
          if (pluginStopped) return;
          jogRoleSyncSafe();
          jogReasonPaint();
        });
      }
