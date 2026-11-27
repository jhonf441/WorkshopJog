      // ---- Jog settings sheet: the small widgets of its tabs (element, button, row, hint, section title, check box, number field) ----
      // Plain functions used by jogAjOpenSheet (18-settings.js), which aliases them to the short names its tabs use; nothing here keeps state.
      // Tanda 1 of the redesign (FAMILIA-REDISENO.md 3, 2026-11-23): the settings are ROWS of 48 (the name 14/500 and the control on one line, a thin
      // divider under each), the groups a title 13/600 over a divider, the explanation one line of 12 under its row; no boxes, no uppercase titles.

      function jogAjUiEl(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text !== undefined) e.textContent = text;
        return e;
      }
      // A button of the sheet: 32 (--wf-size-s), the main one 36 (--wf-size-m); both touched over 40 (jogAjUiCss).
      function jogAjUiButton(label, primary, fn) {
        var b = jogAjUiEl("button", "min-height:" + (primary ? JOG_TOUCH_MIN_PX : JOG_HEADER_BTN_PX) + "px;height:" + (primary ? JOG_TOUCH_MIN_PX : JOG_HEADER_BTN_PX) + "px;padding:0 12px;", label);
        b.className = "wf-btn" + (primary ? " wf-main" : "");
        b.type = "button";
        b.addEventListener("click", fn);
        return b;
      }
      // Every choice of the sheet (a radio, a check box, written by the tabs themselves) is touched over 40 px high, whatever its text measures.
      function jogAjUiCss() {
        if (document.getElementById("workshop-jog-settings-css")) return;
        var st = document.createElement("style");
        st.id = "workshop-jog-settings-css";
        var S = "#workshop-jog-settings ";
        st.textContent = [
          S + "label{align-items:center;}",
          S + "label:has(> input[type=checkbox]){min-height:40px;}", // a check box row: 40 + 2 x 4 = a row of 48
          S + "label:has(> input[type=radio]){min-height:36px;position:relative;}", // a row of radios: 36, each one touched over 40
          S + "label:has(> input[type=radio])::before{content:'';position:absolute;inset:-2px 0;}",
          S + ".wf-tab{min-height:32px;height:32px;padding:0 2px;position:relative;}", // tabs of 32 touched over 40
          S + ".wf-tab::before{content:'';position:absolute;inset:-4px 0;}",
          S + ".wf-btn:not(.wf-act)::before{content:'';position:absolute;inset:-4px;}", // buttons of 32 (36 the main one) touched over 40
          S + ".wf-sheet-close::before{content:'';position:absolute;inset:-4px;}",
        ].join(" ");
        document.head.appendChild(st);
      }
      function jogAjUiRow(parent) {
        jogAjUiCss();
        var r = jogAjUiEl("div", "display:flex;align-items:center;gap:8px;min-height:36px;padding:0;box-sizing:border-box;border-bottom:1px solid rgba(255,255,255,0.08);flex-wrap:wrap;font-size:14px;font-weight:500;"); // a row of radios is 36, a check box row 48 (its label)
        parent.appendChild(r);
        return r;
      }
      function jogAjUiHint(parent, text) {
        parent.appendChild(jogAjUiEl("div", "font-size:12px;line-height:1.4;color:#b0bec5;margin:4px 0 8px 0;", text));
      }
      // One single "Reset" lives in the footer (2026-10-13: "I only want a
      // default in a single place"): no per-item default buttons.
      // The common sheet header made to the scale for the Jog's sheet: a header of 48, the close button seen at 32 and touched over 40 (jogAjUiCss).
      function jogAjSheetHead(hd) {
        hd.style.minHeight = "48px";
        hd.style.padding = "4px 8px 4px 12px";
        var x = hd.querySelector(".wf-sheet-close");
        if (x) {
          ["width", "height", "minWidth", "minHeight"].forEach(function (k) { x.style[k] = JOG_HEADER_BTN_PX + "px"; });
          x.style.position = "relative";
        }
        return hd;
      }
      function jogAjUiTitle(parent, text) {
        parent.appendChild(jogAjUiEl("div", "font-size:13px;font-weight:600;color:#eceff1;margin:16px 0 0 0;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.18);", text));
      }
      function jogAjUiCheck(parent, label, val, fn) {
        var l = jogAjUiEl("label", "display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 0;flex:1 1 auto;cursor:pointer;font-size:14px;font-weight:500;"); // the whole row (48) is its touch area
        var c = document.createElement("input");
        c.type = "checkbox";
        c.checked = !!val;
        c.style.cssText = "width:18px;height:18px;";
        c.addEventListener("change", function () { fn(c.checked); });
        l.appendChild(c);
        l.appendChild(jogAjUiEl("span", "", label));
        parent.appendChild(l);
        return c;
      }
      function jogAjUiNumber(parent, val, min, max, step, w, fn) {
        var i = workshopInputEl("input", "width:" + (w || 80) + "px;background:#1e272c;color:#fff;");
        i.type = "number";
        i.min = String(min);
        i.max = String(max);
        i.step = String(step);
        i.value = String(val);
        i.addEventListener("input", function () { fn(parseFloat(i.value)); });
        parent.appendChild(i);
        return i;
      }
