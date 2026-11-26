/* ==========================================================================
   SmartSpend · Settings controller (Phase 7)
   Preferences, appearance, notifications and data/backup tools.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const money = SS.money;
  const dates = SS.dates;

  ui.ready(async function () {
    const ctx = await SS.shell.mount({
      active: "settings",
      title: "Settings",
      subtitle: "Preferences, notifications and backups",
    });
    if (!ctx) return;

    const themeKey = SS.store.KEYS.theme;

    const state = {
      prefs: ctx.settings,
      usage: null,
    };

    const elements = {
      prefsForm: document.getElementById("prefs-form"),
      currency: document.getElementById("pref-currency"),
      dateFormat: document.getElementById("pref-date-format"),
      incomeTarget: document.getElementById("pref-income-target"),
      note: document.getElementById("pref-note"),
      currencySymbol: document.getElementById("pref-currency-symbol"),
      prefsSave: document.getElementById("prefs-save"),
      themeButtons: Array.from(document.querySelectorAll("[data-theme-choice]")),
      notificationInputs: Array.from(document.querySelectorAll("[data-notification]")),
      exportJson: document.getElementById("export-json"),
      exportCsv: document.getElementById("export-csv"),
      importJson: document.getElementById("import-json"),
      importFile: document.getElementById("import-file"),
      usageList: document.getElementById("usage-list"),
      accountName: document.getElementById("account-name"),
      accountEmail: document.getElementById("account-email"),
      signOut: document.getElementById("settings-signout"),
    };

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function formatBytes(bytes) {
      const value = Number(bytes) || 0;
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }

    /* ----------------------------------------------------------------------
       Preferences
       ---------------------------------------------------------------------- */
    function populateOptions() {
      elements.currency.innerHTML = Object.keys(money.CURRENCIES)
        .map((code) => {
          const item = money.CURRENCIES[code];
          return `<option value="${escapeHtml(code)}">${escapeHtml(item.label)}</option>`;
        })
        .join("");

      elements.dateFormat.innerHTML = money.DATE_FORMATS.map(
        (item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`
      ).join("");
    }

    function fillPrefs(prefs) {
      state.prefs = prefs;
      elements.currency.value = prefs.currency || "INR";
      elements.dateFormat.value = prefs.dateFormat || "DD MMM YYYY";
      elements.incomeTarget.value = prefs.monthlyIncomeTarget > 0 ? prefs.monthlyIncomeTarget : "";
      elements.note.value = prefs.profileNote || "";
      elements.currencySymbol.textContent = money.symbol();

      elements.notificationInputs.forEach((input) => {
        const key = input.getAttribute("data-notification");
        input.checked = Boolean(prefs.notifications && prefs.notifications[key]);
      });
    }

    function currentThemeChoice() {
      const saved = SS.store.getTheme();
      return saved === "dark" || saved === "light" ? saved : "system";
    }

    function renderThemeChoice() {
      const active = currentThemeChoice();
      elements.themeButtons.forEach((button) => {
        const choice = button.getAttribute("data-theme-choice");
        const isActive = choice === active;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function applyThemeChoice(choice) {
      if (choice === "system") {
        try {
          window.localStorage.removeItem(themeKey);
        } catch (error) {
          /* ignore */
        }
        const prefersDark =
          window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        ui.applyTheme(prefersDark ? "dark" : "light", false);
      } else {
        ui.applyTheme(choice === "dark" ? "dark" : "light", true);
      }
      renderThemeChoice();
    }

    elements.themeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const choice = button.getAttribute("data-theme-choice");
        applyThemeChoice(choice);
        ui.toast.info(
          "Theme updated",
          choice === "system"
            ? "SmartSpend now follows your operating system theme."
            : `The ${choice} theme is now active on every page.`
        );
      });
    });

    elements.prefsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      ui.clearFieldError(elements.incomeTarget);

      const target = Number(elements.incomeTarget.value || 0);
      if (!Number.isFinite(target) || target < 0) {
        ui.showFieldError(elements.incomeTarget, "Enter a monthly income target of zero or more.");
        elements.incomeTarget.focus();
        return;
      }

      ui.setLoading(elements.prefsSave, true);
      try {
        const next = await SS.finance.settings.update({
          currency: elements.currency.value,
          dateFormat: elements.dateFormat.value,
          monthlyIncomeTarget: Math.round(target),
          profileNote: elements.note.value.trim(),
        });
        ctx.settings = next;
        fillPrefs(next);
        await SS.shell.refreshSummary();
        ui.toast.success(
          "Preferences saved",
          `${money.CURRENCIES[next.currency].label} and ${next.dateFormat} now apply across SmartSpend.`
        );
      } catch (error) {
        ui.showFieldError(
          elements.incomeTarget,
          (error && error.message) || "Could not save these preferences."
        );
      } finally {
        ui.setLoading(elements.prefsSave, false);
      }
    });

    /* ----------------------------------------------------------------------
       Notifications
       ---------------------------------------------------------------------- */
    elements.notificationInputs.forEach((input) => {
      input.addEventListener("change", async () => {
        const key = input.getAttribute("data-notification");
        try {
          const next = await SS.finance.settings.update({
            notifications: { [key]: input.checked },
          });
          ctx.settings = next;
          state.prefs = next;
          ui.toast[
            input.checked ? "success" : "info"
          ](
            input.checked ? "Notifications enabled" : "Notifications muted",
            `${
              input.closest(".setting-row").querySelector("strong").textContent
            } has been ${input.checked ? "turned on" : "turned off"}.`
          );
        } catch (error) {
          input.checked = !input.checked;
          ui.toast.error(
            "Could not update notification",
            (error && error.message) || "Please try again."
          );
        }
      });
    });

    /* ----------------------------------------------------------------------
       Data & backup
       ---------------------------------------------------------------------- */
    async function refreshUsage() {
      try {
        const usage = await SS.finance.backup.usage();
        state.usage = usage;
        const items = [
          { value: String(usage.transactions), label: "Transactions" },
          { value: String(usage.categories), label: "Categories" },
          { value: String(usage.budgets), label: "Budget limits" },
          { value: String(usage.goals), label: "Savings goals" },
          { value: formatBytes(usage.bytes), label: "Browser storage" },
          { value: SS.config.version, label: "App version" },
        ];
        elements.usageList.innerHTML = items
          .map(
            (item) => `
            <div class="usage-item">
              <strong>${escapeHtml(item.value)}</strong>
              <span>${escapeHtml(item.label)}</span>
            </div>`
          )
          .join("");
      } catch (error) {
        elements.usageList.innerHTML = "";
      }
    }

    elements.exportJson.addEventListener("click", async () => {
      ui.setLoading(elements.exportJson, true);
      try {
        const payload = await SS.finance.backup.backupJson();
        const filename = `smartspend-backup-${dates.todayISO()}.json`;
        if (ui.download(filename, JSON.stringify(payload, null, 2), "application/json")) {
          ui.toast.success("Backup exported", `${filename} has been downloaded.`);
        } else {
          ui.toast.error("Could not export backup", "Your browser blocked the download.");
        }
      } catch (error) {
        ui.toast.error("Could not export backup", (error && error.message) || "Please try again.");
      } finally {
        ui.setLoading(elements.exportJson, false);
      }
    });

    elements.exportCsv.addEventListener("click", async () => {
      ui.setLoading(elements.exportCsv, true);
      try {
        const csv = await SS.finance.backup.transactionsCsv();
        const filename = `smartspend-transactions-${dates.todayISO()}.csv`;
        if (ui.download(filename, `\ufeff${csv}`, "text/csv;charset=utf-8")) {
          ui.toast.success("CSV exported", `${filename} has been downloaded.`);
        } else {
          ui.toast.error("Could not export CSV", "Your browser blocked the download.");
        }
      } catch (error) {
        ui.toast.error("Could not export CSV", (error && error.message) || "Please try again.");
      } finally {
        ui.setLoading(elements.exportCsv, false);
      }
    });

    elements.importJson.addEventListener("click", () => {
      elements.importFile.value = "";
      elements.importFile.click();
    });

    elements.importFile.addEventListener("change", async () => {
      const file = elements.importFile.files && elements.importFile.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const confirmed = await ui.confirm({
          title: "Replace current workspace?",
          message: `Importing ${file.name} replaces every transaction, budget, goal and category in this browser. Export a backup first if you are unsure.`,
          confirmLabel: "Import backup",
          icon: "upload",
        });
        if (!confirmed) return;

        const result = await SS.finance.backup.importJson(payload);
        ui.toast.success(
          "Backup imported",
          `${result.transactions} transactions and ${result.categories} categories restored. Reloading…`
        );
        window.setTimeout(() => window.location.reload(), 1100);
      } catch (error) {
        const message =
          error instanceof SyntaxError
            ? "That file is not valid JSON. Choose a SmartSpend backup file."
            : (error && error.message) || "Please try again.";
        ui.toast.error("Could not import backup", message);
      } finally {
        elements.importFile.value = "";
      }
    });

    /* ----------------------------------------------------------------------
       Account + section navigation
       ---------------------------------------------------------------------- */
    elements.accountName.textContent = ctx.user.fullName || "SmartSpend user";
    elements.accountEmail.textContent = ctx.user.email || ctx.user.username || "";

    elements.signOut.addEventListener("click", async () => {
      if (elements.signOut.dataset.busy === "true") return;
      elements.signOut.dataset.busy = "true";
      elements.signOut.disabled = true;
      SS.finance.resetCache();
      await SS.auth.logout();
    });

    const sectionLinks = Array.from(document.querySelectorAll("[data-settings-link]"));
    const sections = sectionLinks
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);

    function highlightSection(id) {
      sectionLinks.forEach((link) => {
        const active = link.getAttribute("href") === `#${id}`;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    }

    sectionLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const target = document.querySelector(link.getAttribute("href"));
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        highlightSection(target.id);
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", `#${target.id}`);
        }
      });
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (visible) highlightSection(visible.target.id);
        },
        { rootMargin: "-30% 0px -55% 0px", threshold: [0.1, 0.4, 0.75] }
      );
      sections.forEach((section) => observer.observe(section));
    }

    if (window.location.hash) {
      const hash = window.location.hash.slice(1);
      if (sections.some((section) => section.id === hash)) highlightSection(hash);
    } else if (sections.length) {
      highlightSection(sections[0].id);
    }

    /* ----------------------------------------------------------------------
       Boot
       ---------------------------------------------------------------------- */
    populateOptions();
    fillPrefs(ctx.settings);
    renderThemeChoice();

    try {
      await refreshUsage();
    } catch (error) {
      ui.toast.error(
        "Could not load settings",
        (error && error.message) || "Reload the page and try again."
      );
    }

    document.addEventListener("ss:data-changed", () => {
      refreshUsage().catch(() => {});
    });
  });
})(window);
