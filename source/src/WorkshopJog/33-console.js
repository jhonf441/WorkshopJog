      // ---- Advanced sections: Console and Full log (API in docs-internal/JOG-ADVANCED.md) ----
      //
      // Console: one line of loose G-code with history. Everything goes through ctx.send (blocks, double tap when it
      // moves). Full log: what the jog sent / noted (jogAvLog), with level filters, copy and clear.
      // The pure parts (split, classify, history, new replies, log filter) are tested in tests/jog-console.test.js.

      var JOG_CONS_HIST_MAX = 50;
      var JOG_CONS_HIST_KEY = "workshopJogConsoleHistory";
      var JOG_CONS_RESP_MAX = 30; // reply lines kept on screen

      // Splits what was typed into single commands: new lines and ";" separate, but a ";" inside "double quotes" does not.
      // In RRF ";" also starts a comment, so a piece that does not start like a command (G/M/T word, N-number, or a meta
      // command such as echo / set / if) is a comment and is dropped. "(...)" comments are removed.
      function jogConsSplit(text) {
        var out = [];
        String(text === undefined || text === null ? "" : text).split(/\r\n|\r|\n/).forEach(function (line) {
          var piece = "";
          var inQuotes = false;
          function cerrar() {
            var p = piece.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
            piece = "";
            if (/^(?:N\d+\s+)?[GMT]\s*\d/i.test(p) || /^(?:echo|set|var|global|if|elif|else|while|break|continue|abort|M\d)\b/i.test(p)) out.push(p);
          }
          for (var i = 0; i < line.length; i++) {
            var c = line.charAt(i);
            if (c === '"') inQuotes = !inQuotes;
            if (c === ";" && !inQuotes) cerrar();
            else piece += c;
          }
          cerrar();
        });
        return out;
      }

      // The G/M words of one command, without quoted text: ["G53", "G1"] -> numbers like "G1", "M98", "G38.2".
      function jogConsWords(cmd) {
        var s = String(cmd).replace(/"[^"]*"/g, '""').replace(/\([^)]*\)/g, " ");
        var out = [];
        var re = /(?:^|[^A-Za-z0-9.])([GM])\s*(\d+)(?:\.(\d+))?/gi;
        var m;
        while ((m = re.exec(s))) out.push(m[1].toUpperCase() + parseInt(m[2], 10) + (m[3] !== undefined ? "." + m[3] : ""));
        return out;
      }

      // Codes that move the machine or change something physical. M98 / M32 run files whose content is unknown, so they
      // count as moving; so do tool changes (T<n> run macros) and motors off.
      var JOG_CONS_MOVES = ["G0", "G1", "G2", "G3", "G28", "G29", "G30", "G32", "G53", "G60", "M98", "M32", "M24", "M3", "M4", "M17", "M18", "M84", "M290", "M401", "M402"];
      var JOG_CONS_REJECTED = ["M112", "M999"];

      function jogConsMoves(cmd) {
        if (/^(?:N\d+\s+)?T\s*-?\d/i.test(cmd)) return true;
        var pal = jogConsWords(cmd);
        for (var i = 0; i < pal.length; i++) {
          var base = pal[i].split(".")[0];
          if (JOG_CONS_MOVES.indexOf(base) >= 0 || base === "G38") return true; // G38.x probing moves
        }
        return false;
      }

      // G91 alone moves nothing; "G91" with a move word in the same command is already covered by the words above.
      // Returns { segmentos: [{cmd, mueve}], mueve: bool, rechazado: "M112" | "M999" | null, vacio: bool }.
      function jogConsClassify(text) {
        var secs = jogConsSplit(text).map(function (c) { return { cmd: c, moves: jogConsMoves(c) }; });
        var rechazado = null;
        secs.forEach(function (s) {
          jogConsWords(s.cmd).forEach(function (p) { if (!rechazado && JOG_CONS_REJECTED.indexOf(p) >= 0) rechazado = p; });
        });
        return { segments: secs, moves: secs.some(function (s) { return s.moves; }), rejected: rechazado, empty: !secs.length };
      }

      // History: oldest first, max 50, no consecutive duplicates, blank lines ignored. Returns a new list.
      function jogConsHistAdd(items, line) {
        var l = Array.isArray(items) ? items.filter(function (x) { return typeof x === "string"; }) : [];
        var t = typeof line === "string" ? line.trim() : "";
        if (t && l[l.length - 1] !== t) l.push(t);
        return l.slice(-JOG_CONS_HIST_MAX);
      }

      // A list read from storage, validated: strings only, no blanks, no consecutive duplicates, max 50.
      function jogConsHistClean(a) {
        var out = [];
        (Array.isArray(a) ? a : []).forEach(function (x) { out = jogConsHistAdd(out, x); });
        return out;
      }

      // Arrow keys. idx = position in the list (lista.length = the text being typed). dir -1 = up (older), +1 = down.
      // draft (borrador) = what was typed before starting to browse. Returns { idx, texto }.
      function jogConsHistNavigate(items, idx, dir, current, borrador) {
        var n = items.length;
        var i = typeof idx === "number" ? idx : n;
        if (i === n) borrador = current;
        var nuevo = Math.max(0, Math.min(n, i + dir));
        return { idx: nuevo, text: nuevo === n ? (borrador === undefined ? "" : borrador) : items[nuevo], draft: borrador };
      }

      function jogConsMsgKey(m) {
        return String(m && m.time) + "|" + String(m && m.content);
      }

      // Messages (reply lines of the board) that were not in `vistos` (list of keys). Returns the new messages.
      function jogConsMessagesNew(seen, messages) {
        var set = {};
        (seen || []).forEach(function (k) { set[k] = true; });
        return (Array.isArray(messages) ? messages : []).filter(function (m) { return m && typeof m.content === "string" && !set[jogConsMsgKey(m)]; });
      }

      // Log lines to show: `niveles` = { info, aviso, error } booleans. Newest first.
      function jogConsFilterLog(log, niveles) {
        return log.filter(function (e) { return niveles[e.level] !== false; }).reverse();
      }

      function jogConsLogText(lines, hourFn) {
        return lines.map(function (e) { return hourFn(e.t) + "  [" + e.level + "]  " + e.text; }).join("\n");
      }

      // ---- UI helpers shared by the two sections ----
      function jogConsButton(text, fn, primario) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.className = "wf-btn" + (primario ? " wf-main" : "");
        b.style.cssText = "padding:4px 10px;font-size:11px;";
        b.addEventListener("click", fn);
        return b;
      }

      function jogConsSaveHist(items) {
        try {
          localStorage.setItem(JOG_CONS_HIST_KEY, JSON.stringify(items));
        } catch (e) {
          /* no storage: the history lives in memory only */
        }
      }

      function jogConsReadHist() {
        try {
          var raw = localStorage.getItem(JOG_CONS_HIST_KEY);
          var a = JSON.parse(raw || "[]");
          return jogConsHistClean(a);
        } catch (e) {
          return [];
        }
      }

      // ---- Advanced section: Console ----
      jogRegisterSectionAdvanced({
        id: "console",
        title: "avConsole.title",
        modes: [],
        order: 30,
        mount: function (ctx) {
          var hist = jogConsReadHist();
          var idx = hist.length;
          var borrador = "";
          var cursor = { text: null, i: 0 }; // pending multi-command line: resumes after a double tap
          var seen = []; // reply keys already known
          var esperando = false;
          var resp = [];

          var row = document.createElement("div");
          row.style.cssText = "display:flex;gap:4px;width:100%;";
          var inp = document.createElement("input");
          inp.type = "text";
          inp.setAttribute("autocomplete", "off");
          inp.setAttribute("autocapitalize", "characters");
          inp.setAttribute("spellcheck", "false");
          inp.placeholder = ctx.i18n("avConsole.placeholder");
          inp.style.cssText =
            "flex:1 1 0;min-width:0;min-height:32px;box-sizing:border-box;padding:4px 6px;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px;background:#263238;color:#eceff1;border:1px solid rgba(255,255,255,0.18);border-radius:6px;";
          ["keydown", "keyup", "keypress", "pointerdown"].forEach(function (ev) {
            inp.addEventListener(ev, function (e) { e.stopPropagation(); }); // arrows and letters are not jog shortcuts here
          });
          var stateThe = document.createElement("div");
          stateThe.style.cssText = "font-size:10px;color:#ffb74d;min-height:12px;word-break:break-word;";
          var output = document.createElement("div");
          output.style.cssText =
            "max-height:140px;overflow-y:auto;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;line-height:1.4;color:#b0bec5;word-break:break-word;";

          function paintResp() {
            output.textContent = "";
            if (!resp.length) {
              output.textContent = ctx.i18n("avConsole.no_reply");
              return;
            }
            resp.forEach(function (r) {
              var l = document.createElement("div");
              l.style.color = r.level === "error" ? "#ef9a9a" : r.level === "notice" ? "#ffb74d" : r.level === "cmd" ? "#90caf9" : "#b0bec5";
              l.textContent = r.text;
              output.appendChild(l);
            });
            output.scrollTop = output.scrollHeight;
          }
          function put(text, level) {
            resp.push({ text: text, level: level });
            while (resp.length > JOG_CONS_RESP_MAX) resp.shift();
            paintResp();
          }
          function keys() {
            var st = ctx.state().status;
            return ((st && st.messages) || []).map(jogConsMsgKey);
          }
          function readResponse(status) {
            if (!esperando || !status) return;
            var nuevos = jogConsMessagesNew(seen, status.messages);
            if (!nuevos.length) return;
            nuevos.forEach(function (m) {
              seen.push(jogConsMsgKey(m));
              put(String(m.content).trim(), m.type === 2 ? "error" : m.type === 1 ? "notice" : "info");
            });
          }

          // Sends the pending commands one by one; stops at the first one that is armed, blocked or fails.
          function send() {
            var text = inp.value;
            var c = jogConsClassify(text);
            stateThe.textContent = "";
            if (c.empty) return;
            if (c.rejected) {
              stateThe.textContent = ctx.i18n("avConsole.rejected", { code: c.rejected });
              ctx.record(ctx.i18n("avConsole.rejected", { code: c.rejected }), "notice");
              return;
            }
            if (cursor.text !== text) {
              cursor.text = text;
              cursor.i = 0;
            }
            seen = keys();
            esperando = true;
            var secs = c.segments;
            function step() {
              if (cursor.i >= secs.length) {
                cursor.text = null;
                hist = jogConsHistAdd(hist, text);
                jogConsSaveHist(hist);
                idx = hist.length;
                borrador = "";
                inp.value = "";
                return Promise.resolve();
              }
              var s = secs[cursor.i];
              return ctx.send(s.cmd, { moves: s.moves, confirm: s.cmd }).then(function (r) {
                if (r && r.state === "armed") {
                  stateThe.textContent = ctx.i18n("avConsole.tap_again", { code: s.cmd });
                  return;
                }
                if (!r || !r.ok) {
                  cursor.text = null;
                  stateThe.textContent = ctx.i18n(r && r.state === "blocked" ? "avConsole.blocked" : "avConsole.failed", { code: s.cmd });
                  return;
                }
                put(s.cmd, "cmd");
                if (typeof r.response === "string" && r.response.trim()) put(r.response.trim(), "info");
                cursor.i++;
                return step();
              });
            }
            step();
          }
          inp.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              var n = jogConsHistNavigate(hist, idx, e.key === "ArrowUp" ? -1 : 1, inp.value, borrador);
              idx = n.idx;
              borrador = n.draft;
              inp.value = n.text;
            }
          });
          row.appendChild(inp);
          row.appendChild(jogConsButton(ctx.i18n("avConsole.send"), send, true));
          ctx.container.appendChild(row);
          ctx.container.appendChild(stateThe);
          ctx.container.appendChild(output);
          var hint = document.createElement("div");
          hint.style.cssText = "font-size:10px;color:rgba(255,255,255,0.45);";
          hint.textContent = ctx.i18n("avConsole.hint");
          ctx.container.appendChild(hint);
          return {
            render: paintResp,
            update: readResponse,
            destroy: function () { esperando = false; },
          };
        },
      });

      // ---- Advanced section: Full log ----
      jogRegisterSectionAdvanced({
        id: "record_full",
        title: "avConsole.log_title",
        modes: [],
        order: 31,
        mount: function (ctx) {
          var niveles = { info: true, notice: true, error: true };
          var signature = "";
          var bar = document.createElement("div");
          bar.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;width:100%;";
          var items = document.createElement("div");
          items.style.cssText =
            "max-height:200px;overflow-y:auto;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;line-height:1.4;word-break:break-word;";
          var noticeThe = document.createElement("div");
          noticeThe.style.cssText = "font-size:10px;color:#a5d6a7;min-height:12px;";
          var chips = {};
          ["info", "notice", "error"].forEach(function (n) {
            var b = jogConsButton(ctx.i18n("avConsole.level_" + n), function () {
              niveles[n] = !niveles[n];
              render();
            });
            chips[n] = b;
            bar.appendChild(b);
          });
          bar.appendChild(
            jogConsButton(ctx.i18n("avConsole.copy"), function () {
              var txt = jogConsLogText(jogConsFilterLog(jogAvLog, niveles), jogAvHour);
              copy(txt).then(function (ok) { noticeThe.textContent = ctx.i18n(ok ? "avConsole.copied" : "avConsole.copy_failed"); });
            })
          );
          bar.appendChild(
            jogConsButton(ctx.i18n("avConsole.clear"), function () {
              jogAvLog.length = 0;
              noticeThe.textContent = ctx.i18n("avConsole.cleared");
              render();
            })
          );
          function copy(txt) {
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(txt).then(function () { return true; }, function () { return old(txt); });
              }
            } catch (e) {
              /* fall through */
            }
            return Promise.resolve(old(txt));
          }
          function old(txt) {
            try {
              var ta = document.createElement("textarea");
              ta.value = txt;
              ta.style.cssText = "position:fixed;left:-1000px;top:0;";
              document.body.appendChild(ta);
              ta.select();
              var ok = document.execCommand("copy");
              document.body.removeChild(ta);
              return !!ok;
            } catch (e) {
              return false;
            }
          }
          function render() {
            ["info", "notice", "error"].forEach(function (n) {
              chips[n].style.opacity = niveles[n] ? "1" : "0.4";
              chips[n].style.background = niveles[n] ? "rgba(25,118,210,0.55)" : "rgba(255,255,255,0.08)";
            });
            var last = jogAvLog[jogAvLog.length - 1];
            signature = jogAvLog.length + "|" + (last ? last.t + last.text : "");
            items.textContent = "";
            var ver = jogConsFilterLog(jogAvLog, niveles);
            if (!ver.length) {
              items.style.color = "#b0bec5";
              items.textContent = ctx.i18n("avConsole.log_empty");
              return;
            }
            ver.forEach(function (e) {
              var l = document.createElement("div");
              l.style.color = e.level === "error" ? "#ef9a9a" : e.level === "notice" ? "#ffb74d" : "#b0bec5";
              l.textContent = jogAvHour(e.t) + "  " + e.text;
              items.appendChild(l);
            });
          }
          ctx.container.appendChild(bar);
          ctx.container.appendChild(noticeThe);
          ctx.container.appendChild(items);
          return {
            render: render,
            update: function () {
              // same poll as the rest: repaint only when the log changed
              var last = jogAvLog[jogAvLog.length - 1];
              if (signature !== jogAvLog.length + "|" + (last ? last.t + last.text : "")) render();
            },
            destroy: function () {},
          };
        },
      });
