/* ==========================================================================
   SmartSpend · Savings goals controller (Phase 7)
   Goal targets, deadlines, contributions and progress history.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const money = SS.money;
  const dates = SS.dates;

  ui.ready(async function () {
    const ctx = await SS.shell.mount({
      active: "goals",
      title: "Savings goals",
      subtitle: "Targets, deadlines and monthly progress",
    });
    if (!ctx) return;

    const state = {
      goals: [],
      summary: null,
      editing: null,
      contributionGoal: null,
      formColor: "#6366f1",
      formIcon: "target",
      token: 0,
    };

    const elements = {
      summary: document.getElementById("goal-summary"),
      grid: document.getElementById("goal-grid"),
      add: document.getElementById("add-goal"),
      goalDialog: document.getElementById("goal-dialog"),
      goalTitle: document.getElementById("goal-dialog-title"),
      goalSubtitle: document.getElementById("goal-dialog-subtitle"),
      goalForm: document.getElementById("goal-form"),
      goalAlert: document.getElementById("goal-alert"),
      name: document.getElementById("goal-name"),
      nameError: document.getElementById("goal-name-error"),
      deadline: document.getElementById("goal-deadline"),
      deadlineError: document.getElementById("goal-deadline-error"),
      target: document.getElementById("goal-target"),
      targetError: document.getElementById("goal-target-error"),
      saved: document.getElementById("goal-saved"),
      savedError: document.getElementById("goal-saved-error"),
      savedField: document.getElementById("goal-saved-field"),
      note: document.getElementById("goal-note"),
      currency: document.getElementById("goal-currency"),
      savedCurrency: document.getElementById("goal-saved-currency"),
      colors: document.getElementById("goal-colors"),
      icons: document.getElementById("goal-icons"),
      save: document.getElementById("goal-save"),
      contributionDialog: document.getElementById("contribution-dialog"),
      contributionTitle: document.getElementById("contribution-title"),
      contributionSubtitle: document.getElementById("contribution-subtitle"),
      contributionForm: document.getElementById("contribution-form"),
      contributionAlert: document.getElementById("contribution-alert"),
      contributionAmount: document.getElementById("contribution-amount"),
      contributionAmountError: document.getElementById("contribution-amount-error"),
      contributionDate: document.getElementById("contribution-date"),
      contributionNote: document.getElementById("contribution-note"),
      contributionCurrency: document.getElementById("contribution-currency"),
      contributionSave: document.getElementById("contribution-save"),
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
      if (status === "completed") return { label: "Completed", className: "chip--success" };
      if (status === "overdue") return { label: "Past due", className: "chip--danger" };
      return { label: "In progress", className: "chip--primary" };
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

    function renderSummary(summary) {
      const overallPercent = money.percent(summary.saved, summary.target);
      elements.summary.innerHTML = [
        summaryCard(
          "success",
          "piggy-bank",
          "Total saved",
          money.format(summary.saved),
          `${overallPercent.toFixed(0)}% of ${money.format(summary.target)}`
        ),
        summaryCard("primary", "target", "Active goals", String(summary.active), `${summary.count} goal${summary.count === 1 ? "" : "s"} in total`),
        summaryCard("info", "calendar", "Monthly needed", money.format(summary.monthlyNeeded), "Across every active goal"),
        summaryCard(
          summary.completed ? "success" : "warning",
          "check-circle",
          summary.completed ? "Fully funded" : "Still to save",
          summary.completed ? `${summary.completed} complete` : money.format(summary.remaining),
          summary.completed ? "Create a new target to keep going" : `${summary.completed} completed goal${summary.completed === 1 ? "" : "s"}`
        ),
      ].join("");
    }

    function historyHtml(goal) {
      const contributions = Array.isArray(goal.contributions) ? goal.contributions.slice() : [];
      if (!contributions.length) return "";
      contributions.sort((a, b) => (a.date < b.date ? 1 : -1));
      return `
        <details class="goal-history">
          <summary>${contributions.length} contribution${contributions.length === 1 ? "" : "s"}</summary>
          <ul>
            ${contributions
              .slice(0, 5)
              .map(
                (item) => `
                <li>
                  <span>${escapeHtml(item.note || "Contribution")} · ${escapeHtml(dates.format(item.date))}</span>
                  <strong>+${money.format(item.amount)}</strong>
                </li>`
              )
              .join("")}
          </ul>
        </details>`;
    }

    function goalCard(goal) {
      const status = statusMeta(goal.status);
      const deadlineLabel = goal.deadline ? dates.format(goal.deadline) : "No deadline";
      const deadlineMeta =
        goal.status === "completed"
          ? "Target reached"
          : goal.daysLeft < 0
            ? `${Math.abs(goal.daysLeft)} days overdue`
            : `${goal.daysLeft} day${goal.daysLeft === 1 ? "" : "s"} left`;

      return `
        <article class="goal-card" style="--goal-color:${goal.color}">
          <div class="goal-card__head">
            <span class="goal-card__icon">
              <svg class="icon icon--lg" aria-hidden="true"><use href="#i-${goal.icon || "target"}"></use></svg>
            </span>
            <div class="goal-card__title">
              <h2>${escapeHtml(goal.name)}</h2>
              <span class="chip ${status.className}">${status.label}</span>
            </div>
            <div class="goal-card__actions">
              <button class="icon-action" type="button" data-goal-edit="${escapeHtml(goal.id)}" aria-label="Edit ${
        escapeHtml(goal.name)
      }" title="Edit goal">
                <svg class="icon icon--sm" aria-hidden="true"><use href="#i-edit"></use></svg>
              </button>
              <button class="icon-action icon-action--danger" type="button" data-goal-delete="${escapeHtml(
                goal.id
              )}" aria-label="Delete ${escapeHtml(goal.name)}" title="Delete goal">
                <svg class="icon icon--sm" aria-hidden="true"><use href="#i-trash"></use></svg>
              </button>
            </div>
          </div>

          <div class="goal-card__amounts">
            <strong>${money.format(goal.saved)}</strong>
            <span>of ${money.format(goal.target)}</span>
          </div>

          <div class="progress" role="img" aria-label="${Math.round(goal.percent)} percent of the goal saved">
            <span style="width:${money.clampPercent(goal.progress)}%;background:${goal.color}"></span>
          </div>

          <div class="goal-card__meta">
            <span>${Math.round(goal.percent)}% saved · ${deadlineMeta}</span>
            <span>${escapeHtml(deadlineLabel)}</span>
          </div>

          ${goal.note ? `<p class="goal-card__note">${escapeHtml(goal.note)}</p>` : ""}

          ${historyHtml(goal)}

          <div class="goal-card__footer">
            <span>${
              goal.status === "completed"
                ? "Goal complete — well done."
                : `Save ${money.format(goal.monthlyNeeded)} per month to finish on time.`
            }</span>
            <button class="btn btn--soft btn--sm" type="button" data-goal-contribute="${escapeHtml(goal.id)}">
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-plus"></use></svg>
              Add money
            </button>
          </div>
        </article>`;
    }

    function renderGoals(summary) {
      if (!summary.goals.length) {
        elements.grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1; border:1px dashed var(--border-strong); border-radius:var(--radius-xl); background:var(--surface);">
            <span class="empty-state__icon"><svg class="icon icon--xl" aria-hidden="true"><use href="#i-piggy-bank"></use></svg></span>
            <strong>No savings goals yet</strong>
            <p>Start with an emergency fund or the next big thing you are saving for. Add a target, a date and a starting amount.</p>
            <button class="btn btn--primary" type="button" data-empty-goal>
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-plus"></use></svg>
              Create your first goal
            </button>
          </div>`;
        const emptyButton = elements.grid.querySelector("[data-empty-goal]");
        if (emptyButton) emptyButton.addEventListener("click", () => openGoalDialog(null));
        return;
      }

      elements.grid.innerHTML = summary.goals.map(goalCard).join("");

      elements.grid.querySelectorAll("[data-goal-edit]").forEach((button) => {
        button.addEventListener("click", () => {
          const goal = state.goals.find((item) => item.id === button.getAttribute("data-goal-edit"));
          if (goal) openGoalDialog(goal);
        });
      });

      elements.grid.querySelectorAll("[data-goal-delete]").forEach((button) => {
        button.addEventListener("click", () => deleteGoal(button.getAttribute("data-goal-delete")));
      });

      elements.grid.querySelectorAll("[data-goal-contribute]").forEach((button) => {
        button.addEventListener("click", () => {
          const goal = state.goals.find((item) => item.id === button.getAttribute("data-goal-contribute"));
          if (goal) openContributionDialog(goal);
        });
      });
    }

    async function refresh() {
      const token = ++state.token;
      const summary = await SS.finance.goals.summary();
      if (token !== state.token) return;
      state.summary = summary;
      state.goals = summary.goals;
      renderSummary(summary);
      renderGoals(summary);
    }

    function showError(error) {
      ui.toast.error("Could not load savings goals", (error && error.message) || "Reload the page and try again.");
    }

    function renderChoices() {
      const colors = SS.data.COLOR_CHOICES;
      const icons = SS.data.ICON_CHOICES;
      elements.colors.innerHTML = colors
        .map(
          (color) =>
            `<button class="color-swatch" type="button" data-color="${color}" style="background:${color}" aria-label="Colour ${color}" aria-pressed="false"></button>`
        )
        .join("");
      elements.icons.innerHTML = icons
        .map(
          (icon) =>
            `<button class="icon-choice__button" type="button" data-icon="${icon}" aria-label="Icon ${icon}" aria-pressed="false">
               <svg class="icon icon--sm" aria-hidden="true"><use href="#i-${icon}"></use></svg>
             </button>`
        )
        .join("");

      elements.colors.querySelectorAll("[data-color]").forEach((button) => {
        button.addEventListener("click", () => {
          state.formColor = button.getAttribute("data-color");
          updateChoiceUi();
        });
      });

      elements.icons.querySelectorAll("[data-icon]").forEach((button) => {
        button.addEventListener("click", () => {
          state.formIcon = button.getAttribute("data-icon");
          updateChoiceUi();
        });
      });

      updateChoiceUi();
    }

    function updateChoiceUi() {
      elements.colors.querySelectorAll("[data-color]").forEach((button) => {
        const selected = button.getAttribute("data-color") === state.formColor;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      elements.icons.querySelectorAll("[data-icon]").forEach((button) => {
        const selected = button.getAttribute("data-icon") === state.formIcon;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }

    function clearGoalErrors() {
      [elements.name, elements.target, elements.saved, elements.deadline].forEach((input) => ui.clearFieldError(input));
      ui.hideAlert(elements.goalAlert);
    }

    function openGoalDialog(goal) {
      state.editing = goal || null;
      state.formColor = goal ? goal.color : "#6366f1";
      state.formIcon = goal ? goal.icon : "target";

      elements.goalTitle.textContent = goal ? "Edit savings goal" : "New savings goal";
      elements.goalSubtitle.textContent = goal
        ? "Update the target, deadline or presentation. Use Add money to record savings."
        : "Define a target and a realistic deadline.";
      elements.save.querySelector(".btn__label").textContent = goal ? "Save changes" : "Save goal";
      elements.currency.textContent = money.symbol();
      elements.savedCurrency.textContent = money.symbol();

      elements.name.value = goal ? goal.name : "";
      elements.target.value = goal ? goal.target : "";
      elements.saved.value = goal ? "" : "";
      elements.note.value = goal ? goal.note || "" : "";
      elements.deadline.value = goal
        ? goal.deadline
        : dates.monthRange(dates.addMonths(dates.currentMonth(), 6)).to;
      elements.savedField.hidden = Boolean(goal);

      clearGoalErrors();
      updateChoiceUi();
      ui.setLoading(elements.save, false);
      ui.openDialog(elements.goalDialog);
      window.setTimeout(() => elements.name.focus(), 60);
    }

    elements.add.addEventListener("click", () => openGoalDialog(null));

    elements.goalDialog.addEventListener("close", () => {
      elements.goalForm.reset();
      clearGoalErrors();
      ui.setLoading(elements.save, false);
      state.editing = null;
    });

    elements.goalForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearGoalErrors();

      let valid = true;
      const name = elements.name.value.trim();
      const target = Number(elements.target.value);
      const saved = Number(elements.saved.value || 0);
      const deadline = elements.deadline.value;

      if (name.length < 2) {
        ui.showFieldError(elements.name, "Give your goal a name of at least 2 characters.");
        valid = false;
      }
      if (name.length > 42) {
        ui.showFieldError(elements.name, "Keep the goal name under 42 characters.");
        valid = false;
      }
      if (!Number.isFinite(target) || target <= 0) {
        ui.showFieldError(elements.target, "Enter a target greater than zero.");
        valid = false;
      }
      if (!Number.isFinite(saved) || saved < 0) {
        ui.showFieldError(elements.saved, "Starting amount cannot be negative.");
        valid = false;
      }
      if (!deadline || !dates.parseISO(deadline)) {
        ui.showFieldError(elements.deadline, "Pick a target date.");
        valid = false;
      }

      if (!valid) {
        ui.shake(elements.goalForm);
        ui.focusFirstInvalid(elements.goalForm);
        return;
      }

      ui.setLoading(elements.save, true);
      const payload = {
        name,
        target,
        deadline,
        note: elements.note.value,
        color: state.formColor,
        icon: state.formIcon,
      };

      try {
        if (state.editing) {
          await SS.finance.goals.update(state.editing.id, payload);
        } else {
          await SS.finance.goals.create(Object.assign({}, payload, { saved }));
        }
        const editing = Boolean(state.editing);
        ui.closeDialog(elements.goalDialog);
        ui.toast.success(
          editing ? "Goal updated" : "Savings goal created",
          editing ? "Your changes have been saved." : `${name} is now part of your savings plan.`
        );
        await refresh();
      } catch (error) {
        ui.showAlert(
          elements.goalAlert,
          "error",
          (error && error.message) || "Could not save this goal. Please try again.",
          "Could not save goal"
        );
        ui.shake(elements.goalForm);
      } finally {
        ui.setLoading(elements.save, false);
      }
    });

    function openContributionDialog(goal) {
      state.contributionGoal = goal;
      elements.contributionTitle.textContent = `Add to ${goal.name}`;
      elements.contributionSubtitle.textContent = `${money.format(goal.saved)} saved of ${money.format(
        goal.target
      )} · ${money.format(goal.remaining)} remaining.`;
      elements.contributionAmount.value = goal.monthlyNeeded > 0 ? goal.monthlyNeeded : "";
      elements.contributionDate.value = dates.todayISO();
      elements.contributionNote.value = "Monthly transfer";
      elements.contributionCurrency.textContent = money.symbol();
      elements.contributionAmountError.textContent = "";
      ui.clearFieldError(elements.contributionAmount);
      ui.hideAlert(elements.contributionAlert);
      ui.setLoading(elements.contributionSave, false);
      ui.openDialog(elements.contributionDialog);
      window.setTimeout(() => elements.contributionAmount.focus(), 60);
    }

    elements.contributionDialog.addEventListener("close", () => {
      elements.contributionForm.reset();
      elements.contributionAmountError.textContent = "";
      ui.hideAlert(elements.contributionAlert);
      ui.setLoading(elements.contributionSave, false);
      state.contributionGoal = null;
    });

    elements.contributionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.contributionGoal) return;
      ui.hideAlert(elements.contributionAlert);
      ui.clearFieldError(elements.contributionAmount);

      const amount = Number(elements.contributionAmount.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        ui.showFieldError(elements.contributionAmount, "Enter a contribution greater than zero.");
        ui.shake(elements.contributionForm);
        elements.contributionAmount.focus();
        return;
      }

      ui.setLoading(elements.contributionSave, true);
      try {
        const goal = state.contributionGoal;
        await SS.finance.goals.contribute(goal.id, {
          amount,
          date: elements.contributionDate.value || dates.todayISO(),
          note: elements.contributionNote.value,
        });
        ui.closeDialog(elements.contributionDialog);
        ui.toast.success(
          "Contribution added",
          `${money.format(amount)} added to ${goal.name}.`
        );
        await refresh();
      } catch (error) {
        ui.showAlert(
          elements.contributionAlert,
          "error",
          (error && error.message) || "Could not add this contribution. Please try again.",
          "Could not add contribution"
        );
        ui.shake(elements.contributionForm);
      } finally {
        ui.setLoading(elements.contributionSave, false);
      }
    });

    async function deleteGoal(id) {
      const goal = state.goals.find((item) => item.id === id);
      if (!goal) return;
      const confirmed = await ui.confirm({
        title: "Delete this savings goal?",
        message: `${goal.name} and its contribution history will be removed. This cannot be undone.`,
        confirmLabel: "Delete goal",
        danger: true,
        icon: "trash",
      });
      if (!confirmed) return;
      try {
        await SS.finance.goals.remove(id);
        ui.toast.success("Goal deleted", `${goal.name} has been removed.`);
        await refresh();
      } catch (error) {
        ui.toast.error("Could not delete goal", error.message || "Please try again.");
      }
    }

    document.addEventListener("ss:data-changed", () => {
      refresh().catch(showError);
    });

    renderChoices();

    try {
      await refresh();
    } catch (error) {
      showError(error);
    }
  });
})(window);
