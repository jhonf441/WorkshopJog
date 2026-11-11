      // ---- The MPG wheel and the sizes of the Jog panel (pure part: tests/jog-pendant.test.js; the drawing of the wheel is 12-jog3.js) ----
      //
      // Design 3 ("Pendant") has a handwheel like the one of a real pendant: 50 marks around it, a detent every 3.6 degrees (100 steps a turn), and each
      // step moves the active axis the distance of the Step selector. The numbers and the rules here are plain functions.

      var JOG_WHEEL_MARKS = 50; // marks drawn around the wheel
      var JOG_WHEEL_DEG = 3.6; // one step of the wheel
      var JOG_WHEEL_STEPS = [0.01, 0.1, 1, 10]; // the positions of the Step selector
      var JOG_WHEEL_ZERO_MS = 700; // how long the Zero button of an axis is held
      var JOG_WHEEL_QUEUE_MAX = 4; // steps that may wait: a wheel turned fast must not leave a queue that keeps moving after the finger left

      // The outer widths of the S, M, W sizes of the panel, in the order the single size handle cycles them. S is zoom 1 (the drawing and its border).
      var JOG_SIZE_PRESETS = [236, 276, 320]; // zoom 1, 1.2 and 1.4 (W used to be 378: zoom 1.6, too big and soft)

      // The width the panel has when nothing was saved.
      function jogSizeDefaultW() {
        return JOG_SIZE_DEFAULT_W;
      }

      // The index of the size preset nearest to a width.
      function jogSizeNearest(w) {
        var best = 0;
        for (var i = 1; i < JOG_SIZE_PRESETS.length; i++) {
          if (Math.abs(JOG_SIZE_PRESETS[i] - w) < Math.abs(JOG_SIZE_PRESETS[best] - w)) best = i;
        }
        return best;
      }

      // The next size of the cycle: { w, name } with name "S" | "M" | "W".
      function jogSizeCycleNext(w) {
        var next = (jogSizeNearest(w) + 1) % JOG_SIZE_PRESETS.length;
        return { w: JOG_SIZE_PRESETS[next], name: ["S", "M", "W"][next] };
      }

      // The name (S, M, W) of the size nearest to a width: what the handle shows now.
      function jogSizeNameOf(w) {
        return ["S", "M", "W"][jogSizeNearest(w)];
      }

      // The angle of a point seen from the centre of the wheel, in degrees, 0 = up, clockwise (what a finger sweeps).
      function jogWheelAngle(cx, cy, x, y) {
        return (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
      }

      // The shortest signed turn from angle a to angle b, -180..180 (a finger that crosses the top does not jump 360).
      function jogWheelTurn(a, b) {
        var d = (b - a) % 360;
        if (d > 180) d -= 360;
        if (d <= -180) d += 360;
        return d;
      }

      // The wheel: acc = degrees turned and not yet counted. Adds a turn and returns { steps, acc }: steps is a whole number (negative = counter
      // clockwise) and acc is what is left (under one step).
      function jogWheelAdd(acc, turn) {
        var total = acc + turn;
        var steps = total >= 0 ? Math.floor(total / JOG_WHEEL_DEG + 1e-9) : Math.ceil(total / JOG_WHEEL_DEG - 1e-9); // 1e-9: 0.36 added a thousand times is 359.99999..., not a lost step
        return { steps: steps, acc: total - steps * JOG_WHEEL_DEG };
      }

      // Whether another step may wait in the queue.
      function jogWheelAccept(pending) {
        return pending < JOG_WHEEL_QUEUE_MAX;
      }

      // The axes of the selector, in the order of a pendant: X Y Z first, then the extra axes the machine has, without the hidden ones.
      function jogWheelAxes(have) {
        var order = ["X", "Y", "Z", "A", "B", "C", "U", "V", "W"];
        return order.filter(function (L) {
          return have && have.indexOf(L) >= 0;
        });
      }

      // Where the positions of a rotary selector sit: n positions spread over an arc of `span` degrees centred at the top. Returns the angles in degrees.
      function jogSelectorAngles(n, span) {
        if (n <= 1) return [0];
        var out = [];
        for (var i = 0; i < n; i++) out.push(-span / 2 + (span * i) / (n - 1));
        return out;
      }

      // The value of a position cell: two decimals, "--" when it is not known.
      function jogWheelPosText(v) {
        return typeof v === "number" && isFinite(v) ? v.toFixed(2) : "--";
      }
