/* ==========================================================================
   SmartSpend · Transaction dialog
   One shared add/edit form used by the dashboard, ledger and quick-add action.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const money = SS.money;
  const dates = SS.dates;

  let dialog = null;
  let elements = null;
  let state = null;

  function build() {
    if (dialog) return;

    dialog = document.createElement("dialog");
    dialog.className = "modal modal--wide";
    dialog.id = "tx-dialog";
    dialog.setAttribute("aria-labelledby", "tx-dialog-title");
    dialog.innerHTML = `
      <div class="modal__card">
        <div class="modal__head">
          <span class="modal__icon" id="tx-dialog-icon">
            <svg class="icon icon--lg" aria-hidden="true"><use href="#i-wallet"></use></svg>
          </span>
          <div class="modal__head-text">
            <h2 id="tx-dialog-title">Add transaction</h2>
            <p id="tx-dialog-subtitle">Record money moving in or out of your wallet.</p>
          </div>
          <button class="btn btn--icon" type="button" data-tx-close aria-label="Close dialog">
            <svg class="icon" aria-hidden="true"><use href="#i-x"></use></svg>
          </button>
        </div>

        <div class="alert" id="tx-alert" role="alert" hidden></div>

        <form id="tx-form" novalidate>
          <div class="segmented" role="group" aria-label="Transaction type">
            <button class="segmented__button is-active" type="button" data-tx-type="expense">
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-arrow-up"></use></svg>
              Expense
            </button>
            <button class="segmented__button" type="button" data-tx-type="income">
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-arrow-down"></use></svg>
              Income
            </button>
          </div>

          <div class="form-grid form-grid--2">
            <div class="field">
              <label for="tx-amount">Amount <span class="label-optional">required</span></label>
              <div class="input-wrap amount-input">
                <span class="amount-input__symbol" id="tx-currency"></span>
                <input id="tx-amount" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0" aria-describedby="tx-amount-error" required>
              </div>
              <p class="field-error" id="tx-amount-error" role="alert"></p>
            </div>

            <div class="field">
              <label for="tx-category">Category <span class="label-optional">required</span></label>
              <div class="input-wrap input-wrap--plain select-wrap">
                <select id="tx-category" name="categoryId" aria-describedby="tx-category-error" required></select>
              </div>
              <p class="field-error" id="tx-category-error" role="alert"></p>
            </div>
          </div>

          <div class="form-grid form-grid--2">
            <div class="field">
              <label for="tx-date">Date</label>
              <div class="input-wrap input-wrap--plain">
                <input id="tx-date" name="date" type="date" aria-describedby="tx-date-error">
              </div>
              <p class="field-error" id="tx-date-error" role="alert"></p>
            </div>

            <div class="field">
              <label for="tx-method">Payment method</label>
              <div class="input-wrap input-wrap--plain select-wrap">
                <select id="tx-method" name="method"></select>
              </div>
            </div>
          </div>

          <div class="field">
            <label for="tx-merchant">Description</label>
            <div class="input-wrap input-wrap--plain">
              <input id="tx-merchant" name="merchant" type="text" maxlength="90" placeholder="e.g. Swiggy, salary, electricity bill">
            </div>
          </div>

          <div class="field">
            <label for="tx-note">Note <span class="label-optional">optional</span></label>
            <div class="input-wrap input-wrap--plain">
              <input id="tx-note" name="note" type="text" maxlength="240" placeholder="Add context for this entry">
            </div>
          </div>

          <label class="check-row" for="tx-recurring">
            <input type="checkbox" id="tx-recurring">
            <span class="check-row__box"><svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg></span>
            <span class="check-row__copy">
              <strong>Repeat monthly</strong>
              <span>Add this entry to the recurring queue for the same day next month.</span>
            </span>
          </label>

          <div class="modal__actions">
            <button class="btn btn--danger-ghost" type="button" id="tx-delete" hidden>
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-trash"></use></svg>
              Delete
            </button>
            <span class="modal__actions-spacer"></span>
            <button class="btn btn--ghost" type="button" data-tx-close>Cancel</button>
            <button class="btn btn--primary" type="submit" id="tx-save">
              <span class="btn__label">Save transaction</span>
              <span class="btn__spinner" aria-hidden="true"></span>
            </button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(dialog);

    elements = {
      form: dialog.querySelector("#tx-form"),
      title: dialog.querySelector("#tx-dialog-title"),
      subtitle: dialog.querySelector("#tx-dialog-subtitle"),
      icon: dialog.querySelector("#tx-dialog-icon"),
      alert: dialog.querySelector("#tx-alert"),
      amount: dialog.querySelector("#tx-amount"),
      category: dialog.querySelector("#tx-category"),
      date: dialog.querySelector("#tx-date"),
      method: dialog.querySelector("#tx-method"),
      merchant: dialog.querySelector("#tx-merchant"),
      note: dialog.querySelector("#tx-note"),
      recurring: dialog.querySelector("#tx-recurring"),
      save: dialog.querySelector("#tx-save"),
      remove: dialog.querySelector("#tx-delete"),
      currency: dialog.querySelector("#tx-currency"),
      typeButtons: Array.from(dialog.querySelectorAll("[data-tx-type]")),
    };

    elements.currency.textContent = money.symbol();
    elements.currency.className = "amount-input__symbol";

    elements.method.innerHTML = SS.data.PAYMENT_METHODS.map(
      (method) => `<option value="${method}">${method}</option>`
    ).join("");

    elements.typeButtons.forEach((button) => {
      button.addEventListener("click", () => setType(button.getAttribute("data-tx-type")));
    });

    dialog.querySelectorAll("[data-tx-close]").forEach((button) => {
      button.addEventListener("click", () => ui.closeDialog(dialog));
    });

    elements.amount.addEventListener("input", () => clearField(elements.amount));
    elements.category.addEventListener("change", () => clearField(elements.category));
    elements.date.addEventListener("input", () => clearField(elements.date));

    dialog.addEventListener("close", reset);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) ui.closeDialog(dialog);
    });

    elements.save.addEventListener("click", (event) => {
      /* Submit is handled by the form; the button click is only a fallback for
         browsers that do not submit a clicked submit button. */
      event.preventDefault();
      elements.form.requestSubmit();
    });

    elements.form.addEventListener("submit", save);
    elements.remove.addEventListener("click", remove);
  }

  function clearField(input) {
    const field = input.closest(".field");
    if (!field) return;
    field.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
    const error = field.querySelector(".field-error");
    if (error) error.textContent = "";
  }

  function setType(type) {
    if (!state) return;
    state.type = type === "income" ? "income" : "expense";
    elements.typeButtons.forEach((button) => {
      const active = button.getAttribute("data-tx-type") === state.type;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    elements.icon.innerHTML = `<svg class="icon icon--lg" aria-hidden="true"><use href="#i-${
      state.type === "income" ? "arrow-down" : "arrow-up"
    }"></use></svg>`;
    renderCategories();
  }

  function renderCategories(selectedId) {
    if (!state) return;
    const current = selectedId || elements.category.value;
    const list = state.categories.filter((category) => category.type === state.type);
    elements.category.innerHTML = list
      .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
      .join("");
    if (list.some((category) => category.id === current)) {
      elements.category.value = current;
    } else if (list.length) {
      elements.category.value = list[0].id;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function reset() {
    if (!elements) return;
    elements.form.reset();
    elements.recurring.checked = false;
    elements.remove.hidden = true;
    elements.save.querySelector(".btn__label").textContent = "Save transaction";
    elements.title.textContent = "Add transaction";
    elements.subtitle.textContent = "Record money moving in or out of your wallet.";
    ui.hideAlert(elements.alert);
    ui.setLoading(elements.save, false);
    [
      elements.amount,
      elements.category,
      elements.date,
    ].forEach((input) => clearField(input));
    state = null;
  }

  async function open(options) {
    build();
    const settings = options || {};
    const editing = settings.transaction || null;
    const categories = await SS.finance.categories.list("all");

    state = {
      editing,
      categories,
      transaction: editing,
      onSaved: settings.onSaved,
      defaults: settings.defaults || {},
    };

    reset();
    state = {
      editing,
      categories,
      transaction: editing,
      onSaved: settings.onSaved,
      defaults: settings.defaults || {},
    };

    elements.currency.textContent = money.symbol();
    elements.title.textContent = editing ? "Edit transaction" : "Add transaction";
    elements.subtitle.textContent = editing
      ? "Update the details of this entry."
      : "Record money moving in or out of your wallet.";
    elements.save.querySelector(".btn__label").textContent = editing
      ? "Save changes"
      : "Save transaction";
    elements.remove.hidden = !editing;

    if (editing) {
      setType(editing.type);
      renderCategories(editing.categoryId);
      elements.amount.value = editing.amount;
      elements.date.value = editing.date;
      elements.method.value = editing.method || "UPI";
      elements.merchant.value = editing.merchant || "";
      elements.note.value = editing.note || "";
      elements.recurring.checked = Boolean(editing.recurring);
    } else {
      const defaults = state.defaults;
      setType(defaults.type || "expense");
      renderCategories(defaults.categoryId);
      elements.amount.value = defaults.amount || "";
      elements.date.value = defaults.date || dates.todayISO();
      elements.method.value = defaults.method || "UPI";
      elements.merchant.value = defaults.merchant || "";
      elements.note.value = defaults.note || "";
      elements.recurring.checked = Boolean(defaults.recurring);
    }

    ui.hideAlert(elements.alert);
    ui.setLoading(elements.save, false);
    ui.openDialog(dialog);
    window.setTimeout(() => elements.amount.focus(), 70);
  }

  async function save(event) {
    event.preventDefault();
    if (!state) return;
    ui.hideAlert(elements.alert);

    const amount = Number(elements.amount.value);
    const categoryId = elements.category.value;
    const date = elements.date.value;
    let valid = true;

    if (!Number.isFinite(amount) || amount <= 0) {
      showError(elements.amount, "Enter an amount greater than zero.");
      valid = false;
    } else {
      clearField(elements.amount);
    }

    if (!categoryId) {
      showError(elements.category, "Choose a category.");
      valid = false;
    } else {
      clearField(elements.category);
    }

    if (!date) {
      showError(elements.date, "Choose a date.");
      valid = false;
    } else {
      clearField(elements.date);
    }

    if (!valid) {
      ui.shake(elements.form);
      ui.focusFirstInvalid(elements.form);
      return;
    }

    ui.setLoading(elements.save, true);
    const payload = {
      type: state.type,
      amount,
      categoryId,
      date,
      method: elements.method.value,
      merchant: elements.merchant.value,
      note: elements.note.value,
      recurring: elements.recurring.checked,
      queueNext: true,
    };

    try {
      const saved = state.editing
        ? await SS.finance.transactions.update(state.editing.id, payload)
        : await SS.finance.transactions.create(payload);

      const wasEditing = Boolean(state.editing);
      const callback = state.onSaved;
      ui.closeDialog(dialog);
      ui.toast.success(
        wasEditing ? "Transaction updated" : "Transaction saved",
        `${money.format(saved.amount)} · ${wasEditing ? "changes saved" : "added to your ledger"}.`
      );
      if (typeof callback === "function") callback(saved, wasEditing ? "updated" : "created");
    } catch (error) {
      if (error && error.field) showError(elements[error.field] || elements.amount, error.message);
      ui.showAlert(
        elements.alert,
        "error",
        (error && error.message) || "We could not save this transaction. Please try again.",
        "Could not save transaction"
      );
      ui.shake(elements.form);
    } finally {
      ui.setLoading(elements.save, false);
    }
  }

  function showError(input, message) {
    const field = input.closest(".field");
    if (!field) return;
    field.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    const error = field.querySelector(".field-error");
    if (error) error.textContent = message || "";
  }

  async function remove() {
    if (!state || !state.editing) return;
    const confirmed = await ui.confirm({
      title: "Delete this transaction?",
      message: `${state.editing.merchant || "This entry"} (${money.format(state.editing.amount)}) will be removed. You can undo the deletion from the ledger.`,
      confirmLabel: "Delete transaction",
      danger: true,
      icon: "trash",
    });
    if (!confirmed) return;

    ui.setLoading(elements.remove, true);
    try {
      await SS.finance.transactions.remove(state.editing.id);
      const callback = state.onSaved;
      ui.closeDialog(dialog);
      ui.toast.success("Transaction deleted", "Use Undo in the ledger if this was a mistake.");
      if (typeof callback === "function") callback(null, "deleted");
    } catch (error) {
      ui.showAlert(
        elements.alert,
        "error",
        (error && error.message) || "We could not delete this transaction.",
        "Could not delete transaction"
      );
    } finally {
      ui.setLoading(elements.remove, false);
    }
  }

  SS.tx = { open };
})(window);
