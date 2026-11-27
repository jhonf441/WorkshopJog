      // ---- Shared base of the Jog and the Workbench (2026-10-11) ----
      // When splitting WorkshopJog into Jog and Workbench (WorkshopWorkbench), what
      // both use stayed in src/_workbench_base (both include it, see _includes.txt):
      // these file functions, the tips, the cutting area, the saved
      // positions and the SD macros.

      // -- access to SD files via DSF's HTTP API --
      function tzPath(p) {
        return encodeURI(p).replace(/#/g, "%23");
      }
      function tzGetText(p) {
        return fetch("/machine/file/" + tzPath(p), { cache: "no-store" }).then(function (r) {
          if (!r.ok) {
            var e = new Error(p + ": HTTP " + r.status);
            e.status = r.status; // 404 = the file is not there; anything else = it could not be read now
            throw e;
          }
          return r.text();
        });
      }
      // A file that may not exist (a setting nobody saved yet): "not there" is a NORMAL answer. The first 404 is remembered for the session (15 min, kept in
      // sessionStorage so a reload of DWC does not ask again) and the next reads answer null at once: DWC writes "Could not find file ..." in the machine log
      // for every request, and the Jog asked for the same missing file (and its .bak) every time it was opened. Saving the file forgets it (tzForgetMissing).
      // Only a real 404 is remembered: any other failure (no connection, board off) rejects as before and is asked again.
      var TZ_MISSING_MS = 15 * 60 * 1000;
      var tzMissingMem = {};
      function tzMissingAt(p) {
        var t = tzMissingMem[p] || 0;
        if (!t) {
          try {
            t = Number(window.sessionStorage.getItem("workshopMissing:" + p)) || 0;
          } catch (e) {
            t = 0;
          }
        }
        return t;
      }
      function tzKnownMissing(p) {
        return tzMissingAt(p) > Date.now() - TZ_MISSING_MS;
      }
      function tzForgetMissing(p) {
        delete tzMissingMem[p];
        try {
          window.sessionStorage.removeItem("workshopMissing:" + p);
        } catch (e) {
          /* only in memory */
        }
      }
      // -> the text, or null when the file is not there; rejects when it could not be read now
      function tzGetTextOptional(p) {
        if (tzKnownMissing(p)) return Promise.resolve(null);
        return tzGetText(p).catch(function (e) {
          if (!e || e.status !== 404) throw e;
          tzMissingMem[p] = Date.now();
          try {
            window.sessionStorage.setItem("workshopMissing:" + p, String(tzMissingMem[p]));
          } catch (x) {
            /* only in memory */
          }
          return null;
        });
      }
      function tzPutText(p, text) {
        return fetch("/machine/file/" + tzPath(p), {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: text,
        }).then(function (r) {
          if (!r.ok) throw new Error(i18nT('files.could_not_write_http', { p: p, status: r.status }));
          tzForgetMissing(p); // it exists now
        });
      }
      function tzDelete(p) {
        return fetch("/machine/file/" + tzPath(p), { method: "DELETE" }).then(function (r) {
          if (!r.ok && r.status !== 404) throw new Error(i18nT('files.could_not_delete_http', { p: p, status: r.status }));
        });
      }
      // A listing that says whether it could be read: {ok, status, items}. A folder that does not exist (404) is a real empty list (ok);
      // any other failure (no connection, board off, no session, 5xx) is NOT "empty": ok is false and callers keep what they knew.
      function tzListRead(dir) {
        return fetch("/machine/directory/" + tzPath(dir), { cache: "no-store" })
          .then(function (r) {
            if (r.ok) return r.json().then(function (items) { return { ok: Array.isArray(items), status: r.status, items: Array.isArray(items) ? items : [] }; });
            return { ok: r.status === 404, status: r.status, items: [] };
          })
          .catch(function () {
            return { ok: false, status: 0, items: [] };
          });
      }
      function tzList(dir) {
        return tzListRead(dir).then(function (res) {
          return res.items;
        });
      }
      // A JSON file of the SD: {value, ok}. Not there (404) = the empty value, ok. Could not be read or is not JSON = the value we had (previous), ok false,
      // so a failed read never turns a saved list into an empty one (and a later save never writes over the real file with that empty list).
      // norm(parsed) -> the value kept (it returns empty for a shape it does not understand).
      function tzReadJson(p, empty, previous, norm) {
        return tzGetText(p).then(
          function (txt) {
            try {
              return { value: norm(JSON.parse(txt)), ok: true };
            } catch (e) {
              return { value: previous, ok: false };
            }
          },
          function (e) {
            return e && e.status === 404 ? { value: empty, ok: true } : { value: previous, ok: false };
          }
        );
      }
      function tzCode(code) {
        return postCode(code).then(function (r) {
          return r.text();
        });
      }

      // A number typed as a small account: + - * / and parentheses (also x, X, ÷ and the comma as the decimal point).
      // Returns the number or null if it is not a valid account. Used by the fields of the Laser editor, so that
      // "120/3", "(40+25)*2" or "100-12.5" work; those fields are text (a number field blocks the symbols and the
      // numeric keyboard of the touch screen has no / or parentheses).
      function tzEval(text) {
        var t = String(text === undefined || text === null ? "" : text).replace(/\s+/g, "").replace(/[xX×]/g, "*").replace(/÷/g, "/").replace(/,/g, ".");
        if (!t || t.length > 80 || !/^[0-9.+\-*/()]+$/.test(t)) return null;
        var i = 0;
        function numero() {
          var m = /^(?:\d+\.?\d*|\.\d+)/.exec(t.slice(i));
          if (!m) return NaN;
          i += m[0].length;
          return parseFloat(m[0]);
        }
        function atomo() {
          if (t[i] === "-") { i++; return -atomo(); }
          if (t[i] === "+") { i++; return atomo(); }
          if (t[i] === "(") {
            i++;
            var v = suma();
            if (t[i] !== ")") return NaN;
            i++;
            return v;
          }
          return numero();
        }
        function producto() {
          var v = atomo();
          while (t[i] === "*" || t[i] === "/") {
            var op = t[i++];
            var w = atomo();
            v = op === "*" ? v * w : v / w;
          }
          return v;
        }
        function suma() {
          var v = producto();
          while (t[i] === "+" || t[i] === "-") {
            var op = t[i++];
            var w = producto();
            v = op === "+" ? v + w : v - w;
          }
          return v;
        }
        var r = suma();
        if (i !== t.length || !isFinite(r)) return null;
        return Math.round(r * 1e6) / 1e6;
      }

      // Touch screen: Enter (the key of the on-screen keyboard) or Escape leaves the field and so the keyboard goes away
      // (it used to need a tap outside). Only for the fields of the workshop pages (not the code box of DWC).
      if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__workshopEnterHidden) {
        window.__workshopEnterHidden = true;
        document.addEventListener("keydown", function (ev) {
          if (ev.key !== "Enter" && ev.key !== "Escape") return;
          var t = ev.target;
          if (!t || t.tagName !== "INPUT" || t.type === "checkbox" || t.type === "radio" || t.type === "range") return;
          if (!t.closest || !t.closest(".tz-ws, .tz-card")) return;
          t.blur(); // the change event fires on blur: the value is taken as when leaving the field
        }, true);
      }

      function tzNum(v) {
        return Math.round(v * 10000) / 10000; // 4 decimales: no correr un punto guardado al re-guardarlo
      }
      function tzFmt(v) {
        return typeof v === "number" && isFinite(v) ? (Math.round(v * 100) / 100).toString() : "--";
      }
      function tzStamp() {
        var d = new Date();
        function p(n) {
          return (n < 10 ? "0" : "") + n;
        }
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
      }
      // LOCAL readable date/time for the files' comments
      // (toISOString() is UTC and confuses: 22:24 instead of 17:24).
      function tzLocalTime() {
        var s = tzStamp(); // AAAAMMDD-HHMMSS local
        return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) + " " + s.slice(9, 11) + ":" + s.slice(11, 13) + ":" + s.slice(13, 15);
      }
