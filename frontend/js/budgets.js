/* ==========================================================================
   SmartSpend · Monthly budgets controller (Phase 4)
   Overall limit, per-category limits, inline edits and copy-forward.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const money = SS.money;
  const dates = SS.dates;

  ui.ready(async function () {
    const ctx = await SS.shell.mount({
      active: "budgets",
      title: "Budgets",
      subtitle: "Limits, warnings and monthly planning",
    });
    if (!ctx) return;

    const params = new URLSearchParams(window.location.search);
    const requestedMonth = dates.monthKey(params.get("month") || "");
    const currentMonth = dates.currentMonth();

    const state = {
      month: requestedMonth && requestedMonth <= currentMonth ? requestedMonth : currentMonth,
      data: null,
      categories: [],
      token: 0,
    };

    const elements = {
      summary: document.getElementById("budget-summary"),
      overallPanel: document.getElementById("overall-panel"),
      overallStatus: document.getElementById("overall-status"),
      chart: document.getElementById("budget-chart"),
      list: document.getElementById("budget-list"),
      unbudgeted: document.getElementById("unbudgeted-list"),
      monthLabel: document.getElementById("month-label"),
      prev: document.getElementById("month-prev"),
      next: document.getElementById("month-next"),
      copy: document.getElementById("copy-previous"),
      add: document.getElementById("add-budget"),
      addInline: document.getElementById("add-budget-inline"),
      dialog: document.getElementById("budget-dialog"),
      form: document.getElementById("budget-form"),
      category: document.getElementById("budget-category"),
      categoryError: document.getElementById("budget-category-error"),
      amount: document.getElementById("budget-amount"),
      amountError: document.getElementById("budget-amount-error"),
      currency: document.getElementById("budget-currency"),
      alert: document.getElementById("budget-alert"),
      save: document.getElementById("budget-save"),
    };

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function statusMeta(status) {
      if (status === "over") return { label: "Over budget", className: "chip--danger" };
      if (status === "warning") return { label: "Close to limit", className: "chip--warning" };
      if (status === "ok") return { label: "On track", className: "chip--success" };
      return { label: "Not set", className: "" };
    }

    function progressClass(status) {
      if (status === "over") return "danger";
      if (status === "warning") return "warning";
      if (status === "ok") return "success";
      return "muted";
    }

    function summaryCard(tone, icon, label, value, hint) {
      return `
        <article class="summary-card">
          <span class="summary-card__icon summary-card__icon--${tone}">
            <svg class="icon" aria-hidden="true"><use href="#i-${icon}"></use></svg>
          </span>
          <div class="summary-card__copy">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(hint || "")}</small>
          </div>
        </article>`;
    }

    function renderMonth() {
      elements.monthLabel.textContent = dates.monthLabel(state.month);
      elements.next.disabled = state.month >= currentMonth;
    }

    function renderSummary(data) {
      const total = data.total;
      const tracked = data.categories.length;
      const over = data.categories.filter((entry) => entry.status === "over").length;
      const warning = data.categories.filter((entry) => entry.status === "warning").length;
      const status = statusMeta(total.status);
      const today = dates.todayISO();
      const isCurrentMonth = state.month === currentMonth;
      const daysLeft = isCurrentMonth
        ? Math.max(0, dates.daysInMonth(state.month) - Number(today.slice(8, 10)))
        : 0;
      const dailyAllowance = total.remaining > 0 && daysLeft > 0 ? total.remaining / daysLeft : 0;

      elements.summary.innerHTML = [
        summaryCard(
          "primary",
          "target",
          "Overall limit",
          total.amount > 0 ? money.format(total.amount) : "Not set",
          total.amount > 0 ? `${tracked} categor${tracked === 1 ? "y" : "ies"} with limits` : "Set a monthly ceiling below"
        ),
        summaryCard("danger", "arrow-up", "Spent so far", money.format(total.spent), `${total.percent.toFixed(0)}% of the overall limit`),
        summaryCard(
          total.remaining >= 0 ? "success" : "danger",
          "wallet",
          total.remaining >= 0 ? "Remaining" : "Over budget",
          money.format(Math.abs(total.remaining)),
          total.amount > 0 && total.remaining > 0 && daysLeft > 0
            ? `${money.format(dailyAllowance)} per day for ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
            : status.label
        ),
        summaryCard(
          over ? "danger" : warning ? "info" : "primary",
          "shield",
          "Category health",
          over ? `${over} over` : warning ? `${warning} near limit` : "All clear",
          tracked ? `${tracked} tracked · ${data.unbudgeted.length} unbudgeted` : "No category limits yet"
        ),
      ].join("");
    }

    function renderOverall(data) {
      const total = data.total;
      const status = statusMeta(total.status);
      elements.overallStatus.className = `chip ${status.className}`.trim();
      elements.overallStatus.textContent = status.label;

      elements.overallPanel.innerHTML = `
        <div class="budget-hero">
          <div class="budget-hero__amount">
            <div>
              <span class="muted">Spent</span>
              <strong>${money.format(total.spent)}</strong>
            </div>
            <span>of ${total.amount > 0 ? money.format(total.amount) : "no limit set"}</span>
          </div>
          <div class="progress progress--${progressClass(total.status)}" role="img" aria-label="${Math.round(
        total.progress
      )} percent of the overall budget used">
            <span style="width:${money.clampPercent(total.progress)}%"></span>
          </div>
          <div class="budget-hero__meta">
            <span>${total.remaining >= 0 ? `${money.format(total.remaining)} remaining` : `${money.format(Math.abs(total.remaining))} over budget`}</span>
            <span>${total.percent.toFixed(0)}% used</span>
          </div>

          <form class="budget-form" id="overall-budget-form" novalidate>
            <div class="field">
              <label for="overall-amount">Overall monthly limit</label>
              <div class="input-wrap input-wrap--plain amount-input">
                <span class="amount-input__symbol">${escapeHtml(money.symbol())}</span>
                <input id="overall-amount" type="number" inputmode="decimal" min="0" step="1" value="${
                  total.amount > 0 ? total.amount : ""
                }" placeholder="0">
              </div>
            </div>
            <button class="btn btn--primary btn--sm" type="submit">
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-check"></use></svg>
              Save limit
            </button>
          </form>

          <p class="hint-banner">
            <svg class="icon icon--sm" aria-hidden="true"><use href="#i-info"></use></svg>
            <span>Set the overall limit to 0 to clear it. Category limits work independently and add up to the planning view above.</span>
          </p>
        </div>`;

      document.getElementById("overall-budget-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = document.getElementById("overall-amount");
        const amount = Number(input.value || 0);
        if (!Number.isFinite(amount) || amount < 0) {
          ui.showFieldError(input, "Enter a limit of zero or more.");
          return;
        }
        ui.clearFieldError(input);
        try {
          await SS.finance.budgets.save({ month: state.month, categoryId: null, amount });
          ui.toast.success(
            "Overall budget saved",
            amount > 0
              ? `${money.format(amount)} is the limit for ${dates.monthLabel(state.month)}.`
              : "The overall monthly limit has been cleared."
          );
          await refresh();
        } catch (error) {
          ui.showFieldError(input, error.message || "Could not save this budget.");
        }
      });
    }

    function renderChart(data) {
      const items = data.categories
        .filter((entry) => entry.amount > 0)
        .slice(0, 6)
        .map((entry) => ({
          label: entry.categoryName,
          value: entry.amount,
          color: entry.categoryColor,
        }));

      const remainder = data.categories
        .filter((entry) => entry.amount > 0)
        .slice(6)
        .reduce((total, entry) => total + entry.amount, 0);
      if (remainder > 0) items.push({ label: "Other categories", value: remainder, color: "#94a3b8" });

      SS.charts.donut("#budget-chart", {
        items,
        title: "Category budget allocation",
        centerLabel: "planned",
        formatValue: (value) => money.format(value),
        emptyMessage: "Add category limits to see how your plan is split.",
      });
    }

    function renderCategories(data) {
      if (!data.categories.length) {
        elements.list.innerHTML = `
          <div class="empty-state empty-state--compact">
            <span class="empty-state__icon"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-target"></use></svg></span>
            <strong>No category budgets for this month</strong>
            <p>Add limits for the categories you spend in most, or copy last month's plan.</p>
            <button class="btn btn--primary btn--sm" type="button" data-empty-add>
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-plus"></use></svg>
              Add category budget
            </button>
          </div>`;
        const emptyAdd = elements.list.querySelector("[data-empty-add]");
        if (emptyAdd) emptyAdd.addEventListener("click", () => openAddDialog());
        return;
      }

      elements.list.innerHTML = data.categories
        .map((entry) => {
          const status = statusMeta(entry.status);
          return `
            <article class="budget-row" data-budget-id="${escapeHtml(entry.id)}">
              <span class="budget-row__icon" style="color:${entry.categoryColor};background:${entry.categoryColor}1f">
                <svg class="icon" aria-hidden="true"><use href="#i-${entry.categoryIcon || "target"}"></use></svg>
              </span>
              <div class="budget-row__main">
                <div class="budget-row__head">
                  <strong>${escapeHtml(entry.categoryName)}</strong>
                  <span class="chip ${status.className}">${status.label}</span>
                </div>
                <div class="progress progress--${progressClass(entry.status)} progress--thin" role="img" aria-label="${Math.round(
            entry.progress
          )} percent used">
                  <span style="width:${money.clampPercent(entry.progress)}%"></span>
                </div>
                <div class="budget-row__meta">
                  <span>${money.format(entry.spent)} spent of ${money.format(entry.amount)}</span>
                  <span>${entry.remaining >= 0 ? `${money.format(entry.remaining)} left` : `${money.format(Math.abs(entry.remaining))} over`}</span>
                  <span>${entry.percent.toFixed(0)}% used</span>
                </div>
              </div>
              <form class="budget-row__edit" data-budget-form="${escapeHtml(entry.id)}" novalidate>
                <div class="input-wrap input-wrap--plain amount-input">
                  <span class="amount-input__symbol">${escapeHtml(money.symbol())}</span>
                  <input type="number" inputmode="decimal" min="0" step="1" value="${entry.amount}" aria-label="Limit for ${
            escapeHtml(entry.categoryName)
          }">
                </div>
                <button class="btn btn--ghost btn--sm" type="submit" aria-label="Save limit for ${escapeHtml(
                  entry.categoryName
                )}">
                  <svg class="icon icon--sm" aria-hidden="true"><use href="#i-check"></use></svg>
                </button>
                <button class="icon-action icon-action--danger" type="button" data-remove="${escapeHtml(
                  entry.id
                )}" aria-label="Remove budget for ${escapeHtml(entry.categoryName)}" title="Remove budget">
                  <svg class="icon icon--sm" aria-hidden="true"><use href="#i-trash"></use></svg>
                </button>
              </form>
            </article>`;
        })
        .join("");

      elements.list.querySelectorAll("[data-budget-form]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const id = form.getAttribute("data-budget-form");
          const entry = data.categories.find((item) => item.id === id);
          if (!entry) return;
          const input = form.querySelector("input");
          const amount = Number(input.value);
          if (!Number.isFinite(amount) || amount < 0) {
            input.focus();
            ui.toast.warning("Check the limit", "Enter an amount of zero or more.");
            return;
          }
          try {
            await SS.finance.budgets.save({ month: state.month, categoryId: entry.categoryId, amount });
            ui.toast.success("Budget updated", `${entry.categoryName} is now limited to ${money.format(amount)}.`);
            await refresh();
          } catch (error) {
            ui.toast.error("Could not save budget", error.message || "Please try again.");
          }
        });
      });

      elements.list.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", async () => {
          const id = button.getAttribute("data-remove");
          const entry = data.categories.find((item) => item.id === id);
          const confirmed = await ui.confirm({
            title: "Remove this category budget?",
            message: `${entry ? entry.categoryName : "This category"} will no longer have a monthly limit. Spending continues to be tracked.`,
            confirmLabel: "Remove budget",
            danger: true,
            icon: "trash",
          });
          if (!confirmed) return;
          try {
            await SS.finance.budgets.remove(id);
            ui.toast.success("Budget removed", "The category is no longer limited for this month.");
            await refresh();
          } catch (error) {
            ui.toast.error("Could not remove budget", error.message || "Please try again.");
          }
        });
      });
    }

    function renderUnbudgeted(data) {
      if (!data.unbudgeted.length) {
        elements.unbudgeted.innerHTML = `
          <p class="hint-banner">
            <svg class="icon icon--sm" aria-hidden="true"><use href="#i-check-circle"></use></svg>
            <span>Every expense category has a limit for ${escapeHtml(dates.monthLabel(state.month))}.</span>
          </p>`;
        return;
      }

      elements.unbudgeted.innerHTML = data.unbudgeted
        .map(
          (category) => `
          <div class="unbudgeted-row">
            <span class="unbudgeted-row__dot" style="background:${category.color}"></span>
            <span class="unbudgeted-row__name">${escapeHtml(category.name)}</span>
            <span class="unbudgeted-row__spent">${money.format(category.spent)} spent</span>
            <button class="btn btn--ghost btn--sm" type="button" data-add-category="${escapeHtml(category.id)}">Set limit</button>
          </div>`
        )
        .join("");

      elements.unbudgeted.querySelectorAll("[data-add-category]").forEach((button) => {
        button.addEventListener("click", () => openAddDialog(button.getAttribute("data-add-category")));
      });
    }

    function render(data) {
      state.data = data;
      renderMonth();
      renderSummary(data);
      renderOverall(data);
      renderChart(data);
      renderCategories(data);
      renderUnbudgeted(data);
    }

    async function refresh() {
      const token = ++state.token;
      elements.currency.textContent = money.symbol();
      const [data, categories] = await Promise.all([
        SS.finance.budgets.forMonth(state.month),
        SS.finance.categories.list("expense"),
      ]);
      if (token !== state.token) return;
      state.categories = categories;
      render(data);
    }

    function showError(error) {
      ui.toast.error("Could not load budgets", (error && error.message) || "Reload the page and try again.");
    }

    function clearDialogErrors() {
      elements.categoryError.textContent = "";
      elements.amountError.textContent = "";
      elements.category.closest(".field").classList.remove("is-invalid");
      elements.amount.closest(".field").classList.remove("is-invalid");
      ui.hideAlert(elements.alert);
    }

    function openAddDialog(preselect) {
      const data = state.data;
      if (!data) return;

      /* Prefer categories without a limit, but still allow adjusting a limit
         from the same dialog once every category is budgeted. */
      const unbudgeted = data.unbudgeted;
      const pool = unbudgeted.length ? unbudgeted : state.categories;
      if (!pool.length) {
        ui.toast.info("No expense categories yet", "Create an expense category on the Categories page first.");
        return;
      }

      elements.category.innerHTML = pool
        .map((category) => {
          const existing = data.categories.find((entry) => entry.categoryId === category.id);
          const spent = existing ? existing.spent : 0;
          const suffix = existing ? ` · current ${money.format(existing.amount)}` : "";
          return `<option value="${category.id}">${escapeHtml(category.name)} · ${money.format(
            spent
          )} spent${suffix}</option>`;
        })
        .join("");
      if (preselect && pool.some((category) => category.id === preselect)) {
        elements.category.value = preselect;
      }
      elements.amount.value = "";
      elements.currency.textContent = money.symbol();
      clearDialogErrors();
      ui.setLoading(elements.save, false);
      ui.openDialog(elements.dialog);
      window.setTimeout(() => elements.amount.focus(), 60);
    }

    elements.add.addEventListener("click", () => openAddDialog());
    elements.addInline.addEventListener("click", () => openAddDialog());

    elements.dialog.addEventListener("close", () => {
      elements.form.reset();
      clearDialogErrors();
      ui.setLoading(elements.save, false);
    });

    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearDialogErrors();

      const categoryId = elements.category.value;
      const amount = Number(elements.amount.value);
      let valid = true;

      if (!categoryId) {
        elements.categoryError.textContent = "Choose a category.";
        elements.category.closest(".field").classList.add("is-invalid");
        valid = false;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        elements.amountError.textContent = "Enter a limit greater than zero.";
        elements.amount.closest(".field").classList.add("is-invalid");
        valid = false;
      }

      if (!valid) {
        ui.shake(elements.form);
        elements.amount.focus();
        return;
      }

      ui.setLoading(elements.save, true);
      try {
        const category = state.categories.find((item) => item.id === categoryId);
        await SS.finance.budgets.save({ month: state.month, categoryId, amount });
        ui.closeDialog(elements.dialog);
        ui.toast.success(
          "Category budget added",
          `${category ? category.name : "This category"} now has a ${money.format(amount)} limit.`
        );
        await refresh();
      } catch (error) {
        ui.showAlert(
          elements.alert,
          "error",
          (error && error.message) || "Could not save this budget. Please try again.",
          "Could not save budget"
        );
        ui.shake(elements.form);
      } finally {
        ui.setLoading(elements.save, false);
      }
    });

    elements.prev.addEventListener("click", () => {
      state.month = dates.addMonths(state.month, -1);
      refresh().catch(showError);
    });

    elements.next.addEventListener("click", () => {
      if (state.month >= currentMonth) return;
      state.month = dates.addMonths(state.month, 1);
      refresh().catch(showError);
    });

    elements.copy.addEventListener("click", async () => {
      ui.setLoading(elements.copy, true);
      try {
        const created = await SS.finance.budgets.copyPrevious(state.month);
        if (created > 0) {
          ui.toast.success(
            "Plan copied forward",
            `${created} limit${created === 1 ? "" : "s"} from ${dates.monthLabel(
              dates.addMonths(state.month, -1)
            )} added to this month.`
          );
        } else {
          ui.toast.info("Nothing to copy", "Every existing limit is already present in this month.");
        }
        await refresh();
      } catch (error) {
        ui.toast.error("Could not copy last month", error.message || "Please try again.");
      } finally {
        ui.setLoading(elements.copy, false);
      }
    });

    document.addEventListener("ss:data-changed", () => {
      refresh().catch(showError);
    });

    try {
      await refresh();
    } catch (error) {
      showError(error);
    }
  });
})(window);
