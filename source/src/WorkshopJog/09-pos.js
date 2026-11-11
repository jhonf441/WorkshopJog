      // ---- Where the floating Jog sits: a corner (anchor) plus a percentage. Pure part: tests/jog-position.test.js ----
      //
      // The position used to be saved as pixels (left, top). A pixel position saved on a big screen means nothing on a small one: the panel
      // was pushed back in from the edge on every resize and moved by itself. Now it is saved as the nearest CORNER of the window plus how far from
      // that corner it is, as a percentage of the free room (window minus panel minus margins). That is turned into pixels again
      // every time the window, the orientation or the size of the panel changes, and it is ALWAYS bounded to the visible area, so the panel never
      // drifts and never ends up outside. Dragging is the only thing that changes the saved place.

      var JOG_POS_KEY = "workshopJogPos"; // the saved { a, px, py }
      var JOG_POS_ANCHORS = ["tl", "tr", "bl", "br"];
      var JOG_POS_DEFAULT = { a: "bl", px: 0, py: 0 }; // the bottom left corner, like the old default (16 px from the left, 16 px from the bottom)

      // The room the panel can move in: from `margin` to the window minus the panel and the margin, on each axis (never negative).
      function jogPosFree(w, h, vw, vh, margin) {
        return { x: Math.max(0, vw - w - 2 * margin), y: Math.max(0, vh - h - 2 * margin) };
      }

      // A rectangle -> { a, px, py }: the nearest corner and the distance from it, 0..100 % of the free room.
      function jogPosFromRect(left, top, w, h, vw, vh, margin) {
        var free = jogPosFree(w, h, vw, vh, margin);
        var fx = free.x > 0 ? Math.min(1, Math.max(0, (left - margin) / free.x)) : 0;
        var fy = free.y > 0 ? Math.min(1, Math.max(0, (top - margin) / free.y)) : 0;
        var right = fx > 0.5;
        var bottom = fy > 0.5;
        var round = function (v) {
          return Math.round(v * 1000) / 10;
        };
        return { a: (bottom ? "b" : "t") + (right ? "r" : "l"), px: round(right ? 1 - fx : fx), py: round(bottom ? 1 - fy : fy) };
      }

      // { a, px, py } -> { left, top } in px, always inside the window. Anything that is not a position gives the default corner.
      function jogPosToRect(pos, w, h, vw, vh, margin) {
        var p = jogPosRead(pos);
        var free = jogPosFree(w, h, vw, vh, margin);
        var dx = (p.px / 100) * free.x;
        var dy = (p.py / 100) * free.y;
        var left = margin + (p.a.charAt(1) === "r" ? free.x - dx : dx);
        var top = margin + (p.a.charAt(0) === "b" ? free.y - dy : dy);
        return {
          left: Math.round(Math.min(Math.max(left, margin), Math.max(margin, vw - w - margin))),
          top: Math.round(Math.min(Math.max(top, margin), Math.max(margin, vh - h - margin))),
        };
      }

      // The saved text (or an object) -> a clean { a, px, py }. Nothing saved, a typo, an old pixel position: the default corner.
      function jogPosRead(raw) {
        var s = raw;
        if (typeof raw === "string") {
          try {
            s = JSON.parse(raw);
          } catch (e) {
            s = null;
          }
        }
        if (!s || JOG_POS_ANCHORS.indexOf(s.a) < 0 || typeof s.px !== "number" || typeof s.py !== "number" || !isFinite(s.px) || !isFinite(s.py)) {
          return { a: JOG_POS_DEFAULT.a, px: JOG_POS_DEFAULT.px, py: JOG_POS_DEFAULT.py };
        }
        return { a: s.a, px: Math.min(100, Math.max(0, s.px)), py: Math.min(100, Math.max(0, s.py)) };
      }

      // The share of the visible area a panel of this outer size takes (0..1).
      function jogAreaShare(w, h, vw, vh) {
        return vw > 0 && vh > 0 ? (w * h) / (vw * vh) : 0;
      }

      var JOG_AREA_MAX = 0.4; // an open Jog takes at most 40 % of the visible area

      // The tallest an open panel of outer width w may be: the 40 % of the visible area, and not more than the window height minus the margins.
      // The content that does not fit scrolls inside the body (the header and the dock stay in view).
      function jogAreaMaxHeight(w, vw, vh, margin) {
        return Math.max(1, Math.floor(Math.min(vh - 2 * margin, (JOG_AREA_MAX * vw * vh) / Math.max(1, w))));
      }
