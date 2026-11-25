/* ==========================================================================
   SmartSpend · Settings controller (Phase 7)
   Preferences, appearance, notifications, categories and data/backup tools.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const money = SS.money;
  const dates = SS.dates;
  const data = SS.data;

  ui.ready(async function () {
    const ctx = await SS.shell.mount({
      active: "settings",
      title: "Settings",
      subtitle: "Preferences, categories and backups",
    });
    if (!ctx) return;

    const themeKey = SS.store.KEYS.theme;

    const state = {
      prefs: ctx.settings,
      editingCategory: null,
      categoryType: "expense",
      categoryColor: data.COLOR_CHOICES[0],
      categoryIcon: "tag",
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
      addCategory: document.getElementById("add-category"),
      categoryGroups: document.getElementById("category-groups"),
      categoryDialog: document.getElementById("category-dialog"),
      categoryTitle: document.getElementById("category-dialog-title"),
      categorySubtitle: document.getElementById("category-dialog-subtitle"),
      categoryForm: document.getElementById("category-form"),
      categoryAlert: document.getElementById("category-alert"),
      categoryName: document.getElementById("category-name"),
      categoryNameError: document.getElementById("category-name-error"),
      categoryTypeButtons: Array.from(document.querySelectorAll("[data-category-type]")),
      categoryColors: document.getElementById("category-colors"),
      categoryIcons: document.getElementById("category-icons"),
      categorySave: document.getElementById("category-save"),
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
       Categories
       ---------------------------------------------------------------------- */
    function categoryRow(category, count) {
      const used = count || 0;
      return `
        <div class="category-row" data-category-id="${escapeHtml(category.id)}">
          <span class="category-row__icon" style="color:${category.color};background:${category.color}1f">
            <svg class="icon icon--sm" aria-hidden="true"><use href="#i-${escapeHtml(
              category.icon || "tag"
            )}"></use></svg>
          </span>
          <span class="category-row__name">${escapeHtml(category.name)}</span>
          <span class="category-row__count">${used} entr${used === 1 ? "y" : "ies"}</span>
          <button class="icon-action" type="button" data-category-edit="${escapeHtml(
            category.id
          )}" aria-label="Edit ${escapeHtml(category.name)}" title="Edit category">
            <svg class="icon icon--sm" aria-hidden="true"><use href="#i-edit"></use></svg>
          </button>
          ${
            category.system
              ? `<span class="icon-action" title="This category cannot be deleted" aria-hidden="true">
                   <svg class="icon icon--sm"><use href="#i-lock"></use></svg>
                 </span>`
              : `<button class="icon-action icon-action--danger" type="button" data-category-delete="${escapeHtml(
                  category.id
                )}" aria-label="Delete ${escapeHtml(category.name)}" title="Delete category">
                   <svg class="icon icon--sm" aria-hidden="true"><use href="#i-trash"></use></svg>
                 </button>`
          }
        </div>`;
    }

    async function refreshCategories() {
      const [categories, usage] = await Promise.all([
        SS.finance.categories.list("all"),
        SS.finance.categories.usage(),
      ]);

      const groups = [
        {
          key: "expense",
          label: "Expense categories",
          items: categories.filter((category) => category.type === "expense"),
        },
        {
          key: "income",
          label: "Income categories",
          items: categories.filter((category) => category.type === "income"),
        },
      ];

      elements.categoryGroups.innerHTML = groups
        .map(
          (group) => `
          <div class="category-group">
            <div class="category-group__head">
              <strong>${group.label}</strong>
              <span class="chip">${group.items.length}</span>
            </div>
            <div class="category-list">
              ${
                group.items.length
                  ? group.items.map((category) => categoryRow(category, usage[category.id])).join("")
                  : `<p class="muted" style="font-size:0.74rem">No ${group.key} categories yet.</p>`
              }
            </div>
          </div>`
        )
        .join("");

      elements.categoryGroups.querySelectorAll("[data-category-edit]").forEach((button) => {
        button.addEventListener("click", () => {
          const category = categories.find((item) => item.id === button.getAttribute("data-category-edit"));
          if (category) openCategoryDialog(category);
        });
      });

      elements.categoryGroups.querySelectorAll("[data-category-delete]").forEach((button) => {
        button.addEventListener("click", () => deleteCategory(button.getAttribute("data-category-delete")));
      });
    }

    async function deleteCategory(id) {
      const categories = await SS.finance.categories.list("all");
      const category = categories.find((item) => item.id === id);
      if (!category) return;

      const confirmed = await ui.confirm({
        title: "Delete this category?",
        message: `${category.name} will be removed. Categories used by transactions or budgets cannot be deleted until those entries are moved.`,
        confirmLabel: "Delete category",
        danger: true,
        icon: "trash",
      });
      if (!confirmed) return;

      try {
        await SS.finance.categories.remove(id);
        ui.toast.success("Category deleted", `${category.name} has been removed.`);
        await refreshCategories();
        await refreshUsage();
      } catch (error) {
        ui.toast.error(
          "Could not delete category",
          (error && error.message) || "Please try again."
        );
      }
    }

    function renderCategoryChoices() {
      elements.categoryColors.innerHTML = data.COLOR_CHOICES.map(
        (color) =>
          `<button class="color-swatch" type="button" data-color="${color}" style="background:${color}" aria-label="Colour ${color}"></button>`
      ).join("");

      elements.categoryIcons.innerHTML = data.ICON_CHOICES.map(
        (icon) => `
          <button class="icon-choice__button" type="button" data-icon="${icon}" aria-label="Icon ${icon}">
            <svg class="icon icon--sm" aria-hidden="true"><use href="#i-${icon}"></use></svg>
          </button>`
      ).join("");

      elements.categoryColors.querySelectorAll("[data-color]").forEach((button) => {
        button.addEventListener("click", () => {
          state.categoryColor = button.getAttribute("data-color");
          updateCategoryChoices();
        });
      });

      elements.categoryIcons.querySelectorAll("[data-icon]").forEach((button) => {
        button.addEventListener("click", () => {
          state.categoryIcon = button.getAttribute("data-icon");
          updateCategoryChoices();
        });
      });
    }

    function updateCategoryChoices() {
      elements.categoryColors.querySelectorAll("[data-color]").forEach((button) => {
        const selected = button.getAttribute("data-color") === state.categoryColor;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      elements.categoryIcons.querySelectorAll("[data-icon]").forEach((button) => {
        const selected = button.getAttribute("data-icon") === state.categoryIcon;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }

    function renderCategoryType() {
      elements.categoryTypeButtons.forEach((button) => {
        const type = button.getAttribute("data-category-type");
        const active = type === state.categoryType;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.disabled = Boolean(state.editingCategory);
      });
    }

    function clearCategoryErrors() {
      elements.categoryNameError.textContent = "";
      elements.categoryName.closest(".field").classList.remove("is-invalid");
      ui.hideAlert(elements.categoryAlert);
    }

    function openCategoryDialog(category) {
      state.editingCategory = category || null;
      state.categoryType = category ? category.type : "expense";
      state.categoryColor = category ? category.color : data.COLOR_CHOICES[0];
      state.categoryIcon = category ? category.icon : "tag";

      elements.categoryTitle.textContent = category ? "Edit category" : "Add category";
      elements.categorySubtitle.textContent = category
        ? `${category.type === "income" ? "Income" : "Expense"} category · categories in use cannot be deleted.`
        : "Give it a name, colour and icon.";
      elements.categorySave.querySelector(".btn__label").textContent = category
        ? "Save changes"
        : "Save category";
      elements.categoryName.value = category ? category.name : "";

      clearCategoryErrors();
      renderCategoryType();
      updateCategoryChoices();
      ui.setLoading(elements.categorySave, false);
      ui.openDialog(elements.categoryDialog);
      window.setTimeout(() => elements.categoryName.focus(), 60);
    }

    elements.categoryTypeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (state.editingCategory) return;
        state.categoryType = button.getAttribute("data-category-type");
        renderCategoryType();
      });
    });

    elements.addCategory.addEventListener("click", () => openCategoryDialog(null));

    elements.categoryDialog.addEventListener("close", () => {
      elements.categoryForm.reset();
      state.editingCategory = null;
      clearCategoryErrors();
      ui.setLoading(elements.categorySave, false);
    });

    elements.categoryForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearCategoryErrors();

      const name = elements.categoryName.value.trim();
      if (name.length < 2) {
        ui.showFieldError(elements.categoryName, "Use at least 2 characters for the category name.");
        ui.shake(elements.categoryForm);
        elements.categoryName.focus();
        return;
      }

      ui.setLoading(elements.categorySave, true);
      try {
        const payload = {
          name,
          color: state.categoryColor,
          icon: state.categoryIcon,
        };

        if (state.editingCategory) {
          await SS.finance.categories.update(state.editingCategory.id, payload);
        } else {
          await SS.finance.categories.create(
            Object.assign({}, payload, { type: state.categoryType })
          );
        }

        const editing = Boolean(state.editingCategory);
        ui.closeDialog(elements.categoryDialog);
        ui.toast.success(
          editing ? "Category updated" : "Category created",
          `${name} is ready to use in transactions and budgets.`
        );
        await refreshCategories();
        await refreshUsage();
      } catch (error) {
        if (error && error.field === "name") {
          ui.showFieldError(elements.categoryName, error.message);
        } else {
          ui.showAlert(
            elements.categoryAlert,
            "error",
            (error && error.message) || "Could not save this category. Please try again.",
            "Could not save category"
          );
        }
        ui.shake(elements.categoryForm);
      } finally {
        ui.setLoading(elements.categorySave, false);
      }
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
    renderCategoryChoices();
    renderCategoryType();
    updateCategoryChoices();

    try {
      await Promise.all([refreshCategories(), refreshUsage()]);
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
