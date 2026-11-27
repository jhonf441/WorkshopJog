      // ---- Jog panel: the tabs, the macro host with its collapsible sections and the position poll (sections listed in 10-jog-panel.js) ----

      var JOG_TAB_KEY = "emergencyFabJogTab";
      var JOG_ADV_POLL_MS = 100; // the position card reads DWC's store (no network): fast, so it follows the movement

      // -- tabs: Home / Step / Advanced -- groups the secondary
      // functions instead of continuing to pile up loose rows in
      // the body as more are added (explicit request of the
      // user, session 2026-10-08: "I want a way to have the
      // buttons organized"). The knob/Z/speed/STOP at the top
      // stay ALWAYS visible -- they are the main control, this
      // only applies to the secondary.
      function jogPanelTabs(jp) {
        var tabBar = document.createElement("div");
        tabBar.className = "wf-tabs"; // the tabs of the design family: text, a thin line, the open one in 600 with a 2 px line
        tabBar.style.cssText = "width:100%;margin-top:4px;";
        jp.body.appendChild(tabBar);

        var tabContent = document.createElement("div");
        tabContent.style.cssText = "width:100%;";
        jp.body.appendChild(tabContent);
        jp.tabBar = tabBar;
        jp.tabContent = tabContent;

        jogMakeTabButton(jp, "step", i18nT('jog.step'));

        jp.stepSection = jogMakeTabSection(jp, "step");
        // 2026-10-16: the Advanced tab is back as a real tab: a registry of collapsible sections (14-advanced.js,
        // docs-internal/JOG-ADVANCED.md). Other files add sections with jogRegisterSectionAdvanced().
        jogMakeTabButton(jp, "advanced", i18nT('jog.advanced'));
        jp.avUI = jogAvAssembleTab(jogMakeTabSection(jp, "advanced"));
        jogPanelTeardownFns.push(jp.avUI.destroy);
      }

      function jogSelectTab(jp, id) {
        jp.activeTab = id;
        jp.tabBar.style.setProperty("--wf-sec", jogAjAccent());
        Object.keys(jp.tabSections).forEach(function (k) {
          jp.tabSections[k].style.display = k === id ? "flex" : "none";
          // like the pages' tabs (DESIGN.md 3): the family marks the open one; the stripe takes the accent the person chose
          jp.tabBtns[k].classList.toggle("on", k === id);
        });
        // Advanced above the role: its content is not shown, ONE cover says why (and which role opens it)
        var lockedAdv = id === "advanced" && jogRoleLocked(jogRoleNow()) && jp.tabSections.advanced;
        if (lockedAdv) jp.tabSections.advanced.style.display = "none";
        if (jp.advCover && jp.advCover.parentNode) jp.advCover.parentNode.removeChild(jp.advCover);
        jp.advCover = null;
        if (lockedAdv) {
          jp.advCover = jogRoleCover("technician", "advanced");
          jp.tabContent.appendChild(jp.advCover);
        }
        try {
          localStorage.setItem(JOG_TAB_KEY, id);
        } catch (e) {
          /* no critico */
        }
        // The position poll runs in every tab (2026-10-08, "I want position and speed in all the tabs"); it is still cut when
        // closing the panel (jogPanelTeardownFns). 2026-10-11: the keyboard no longer lives in Advanced, so changing tab does not turn it off.
        jogAdvPollStart(jp);
        // The tabs have quite different heights (Advanced is the
        // tallest) -- if we are already in full screen, the scaling
        // calculated for the PREVIOUS tab becomes outdated and the
        // content of the new tab may be cut off. It recalculates
        // against the real size of the newly selected tab (there is no
        // need to ask for fullscreen again, we are already inside).
        if (jogIsFullscreen && typeof jogComputeAndApplyBodyScale === "function") {
          jogComputeAndApplyBodyScale();
        }
      }

      function jogMakeTabButton(jp, id, label) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.className = "wf-tab";
        b.style.cssText = "touch-action:none;";
        b.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        b.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          jogSelectTab(jp, id);
        });
        jp.tabBar.appendChild(b);
        jp.tabBtns[id] = b;
        return b;
      }

      function jogMakeTabSection(jp, id) {
        var sec = document.createElement("div");
        sec.style.cssText = "display:none;flex-direction:column;gap:4px;width:100%;";
        jp.tabContent.appendChild(sec);
        jp.tabSections[id] = sec;
        return sec;
      }

      // 2026-10-15: the macro buttons are a collapsible section under the tabs, in every view. Settings (gear) hides / orders the tabs and sections.
      function jogPanelMacroHost(jp) {
        var macrosHost = document.createElement("div");
        macrosHost.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;";
        jp.body.appendChild(macrosHost);
        jp.macrosHost = macrosHost;
        // Work areas (zones, go to zero, measure Z, cut area) and saved
        // positions live only in the Workbench page now (2026-10-13).
        jp.secMacros = jogMakeCollapsibleSection(jp, i18nT('jog.macro_buttons'), jogAjOpen("macros", false));
        jogAjApplyLayout(
          {
            position: jp.posT.card,
            macros: jp.secMacros.parentNode,
          },
          macrosHost,
          jp.tabBtns,
          jp.tabBar
        );
      }

      // Pattern chosen by the user ("they stay hidden and leave a small arrow to show that section", 2026-10-08): collapsible
      // accordion-style sections, each with its own title + arrow; the lists that can grow without limit start collapsed.
      function jogMakeCollapsibleSection(jp, title, defaultOpen, parentThe) {
        var wrap = document.createElement("div");
        wrap.style.cssText = "width:100%;border-top:1px solid rgba(255,255,255,0.12);margin-top:4px;padding-top:4px;";

        var header = document.createElement("button");
        header.type = "button";
        header.style.cssText = [
          "display:flex",
          "align-items:center",
          "justify-content:space-between",
          "width:100%",
          "background:none",
          "border:none",
          "color:#eceff1",
          "font-size:13px", // a group title of the family: 13/600 over a divider, no box (tanda 1, 2026-11-23)
          "font-weight:600",
          "min-height:" + JOG_TOUCH_MIN_PX + "px",
          "padding:0 2px",
          "cursor:pointer",
          "touch-action:none",
          "-webkit-user-select:none",
          "user-select:none",
        ].join(";");
        var titleSpan = document.createElement("span");
        titleSpan.textContent = title;
        header.appendChild(titleSpan);
        // Plain text ("v"/">"), not unicode symbols -- the same reason as
        // always (kiosk font without those glyphs).
        var arrow = document.createElement("span");
        arrow.textContent = defaultOpen ? "v" : ">";
        arrow.style.cssText = "color:rgba(255,255,255,0.4);";
        header.appendChild(arrow);
        wrap.appendChild(header);

        var content = document.createElement("div");
        content.style.cssText =
          "display:" + (defaultOpen ? "flex" : "none") + ";flex-direction:column;gap:4px;width:100%;padding-top:2px;";
        wrap.appendChild(content);

        var isOpen = defaultOpen;
        header.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        header.addEventListener("pointerup", function (ev) {
          ev.stopPropagation();
          isOpen = !isOpen;
          content.style.display = isOpen ? "flex" : "none";
          arrow.textContent = isOpen ? "v" : ">";
        });

        (parentThe || jp.macrosHost).appendChild(wrap);
        return content;
      }

      // -- fast position poll: feeds the position card every poll and the sections of the Advanced tab about once a second.
      // It only runs while the panel is open and is stopped when the panel is torn down.
      function jogAdvPoll(jp) {
        if (!isJogOpen()) return; // panel cerrado: no gastar el poll
        if (pluginStopped) return;
        var slow = Date.now() - jp.advLastAt >= 950; // the sections of the Advanced tab keep their ~1 s rhythm
        if (slow) jp.advLastAt = Date.now();
        jogFetchStatus(300)
          .then(function (status) {
            jp.posT.update(status); // tarjeta de posicion (13-position.js): every poll
            if (slow) jp.avUI.update(status); // sections of the Advanced tab (14-advanced.js): same poll, no timers of their own
          })
          .catch(function () {
            // Tolerate -- it is not worth cutting anything because of a single failure of this secondary poll.
          });
      }

      function jogAdvPollStart(jp) {
        if (jp.advPollTimer) return;
        jogAdvPoll(jp);
        jp.advPollTimer = setInterval(function () {
          jogAdvPoll(jp);
        }, JOG_ADV_POLL_MS);
      }

      function jogAdvPollStop(jp) {
        if (jp.advPollTimer) {
          clearInterval(jp.advPollTimer);
          jp.advPollTimer = null;
        }
      }

      function jogPanelAdvPollMount(jp) {
        jogPanelTeardownFns.push(function () {
          jogAdvPollStop(jp);
        });
      }
