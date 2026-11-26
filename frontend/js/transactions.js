/* ==========================================================================
   SmartSpend · Transaction ledger controller (Phase 3)
   Search, filter, sort, paginate, bulk-delete, undo and CSV export.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const money = SS.money;
  const dates = SS.dates;

  ui.ready(async function () {
    const ctx = await SS.shell.mount({
      active: "transactions",
      title: "Transactions",
      subtitle: "Search, filter and manage every entry",
    });
    if (!ctx) return;

    const state = {
      search: "",
      type: "all",
      categoryId: "all",
      period: "all",
      from: "",
      to: "",
      sort: "date-desc",
      page: 1,
      pageSize: 10,
      rows: [],
      categories: [],
      categoryMap: {},
      selected: new Set(),
      token: 0,
    };

    const elements = {
      summary: document.getElementById("tx-summary"),
      search: document.getElementById("tx-search"),
      type: document.getElementById("tx-type"),
      category: document.getElementById("tx-category"),
      period: document.getElementById("tx-period"),
      sort: document.getElementById("tx-sort"),
      from: document.getElementById("tx-from"),
      to: document.getElementById("tx-to"),
      custom: document.getElementById("custom-range"),
      reset: document.getElementById("reset-filters"),
      emptyReset: document.getElementById("empty-reset"),
      body: document.getElementById("tx-body"),
      table: document.querySelector(".tx-table"),
      empty: document.getElementById("tx-empty"),
      pagination: document.getElementById("pagination"),
      bulkBar: document.getElementById("bulk-bar"),
      bulkCount: document.getElementById("bulk-count"),
      bulkClear: document.getElementById("bulk-clear"),
      bulkDelete: document.getElementById("bulk-delete"),
      selectAll: document.getElementById("select-all"),
      smartBar: document.getElementById("smart-bar"),
      exportCsv: document.getElementById("export-csv"),
    };

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function periodRange(period) {
      const current = dates.currentMonth();
      if (period === "this-month") return dates.monthRange(current);
      if (period === "last-month") return dates.monthRange(dates.addMonths(current, -1));
      if (period === "last-3") {
        return {
          from: dates.monthRange(dates.addMonths(current, -2)).from,
          to: dates.monthRange(current).to,
        };
      }
      if (period === "this-year") {
        return { from: `${current.slice(0, 4)}-01-01`, to: `${current.slice(0, 4)}-12-31` };
      }
      if (period === "custom") {
        return { from: elements.from.value || "", to: elements.to.value || "" };
      }
      return { from: "", to: "" };
    }

    function activeFilters() {
      const range = periodRange(state.period);
      return {
        search: state.search,
        type: state.type,
        categoryId: state.categoryId,
        sort: state.sort,
        from: range.from,
        to: range.to,
      };
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

    function renderSummary(rows) {
      const summary = SS.finance.summarize(rows);
      elements.summary.innerHTML = [
        summaryCard("success", "arrow-down", "Income", money.format(summary.income), `${summary.incomeCount} credit${summary.incomeCount === 1 ? "" : "s"}`),
        summaryCard("danger", "arrow-up", "Expenses", money.format(summary.expense), `${summary.expenseCount} debit${summary.expenseCount === 1 ? "" : "s"}`),
        summaryCard(
          summary.net >= 0 ? "info" : "danger",
          "wallet",
          "Net",
          money.signed(summary.net),
          `${summary.savingsRate.toFixed(0)}% savings rate`
        ),
        summaryCard("primary", "receipt", "Entries", String(summary.count), `Across ${summary.activeDays} active day${summary.activeDays === 1 ? "" : "s"}`),
      ].join("");
    }

    function dateCell(iso) {
      const date = dates.parseISO(iso);
      if (!date) return `<span class="tx-date"><strong>—</strong><span>Unknown</span></span>`;
      const weekday = new Intl.DateTimeFormat("en", { weekday: "long" }).format(date);
      return `<span class="tx-date"><strong>${escapeHtml(dates.format(iso))}</strong><span>${escapeHtml(
        weekday
      )}</span></span>`;
    }

    function rowHtml(transaction) {
      const category = state.categoryMap[transaction.categoryId] || {
        name: "Uncategorised",
        color: "#64748b",
        icon: "receipt",
      };
      const income = transaction.type === "income";
      const selected = state.selected.has(transaction.id);
      const description = transaction.note || (income ? "Income" : "Expense");
      return `
        <tr data-tx-id="${escapeHtml(transaction.id)}">
          <td class="tx-cell--check">
            <label class="check-only">
              <input type="checkbox" data-select="${escapeHtml(transaction.id)}" aria-label="Select ${escapeHtml(
        transaction.merchant || description
      )}"${selected ? " checked" : ""}>
              <span class="check-only__box"><svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg></span>
            </label>
          </td>
          <td>${dateCell(transaction.date)}</td>
          <td>
            <span class="tx-desc">
              <span class="tx-avatar" style="color:${category.color};background:${category.color}1f">
                <svg class="icon icon--sm" aria-hidden="true"><use href="#i-${category.icon || "receipt"}"></use></svg>
              </span>
              <span class="tx-desc__copy">
                <strong>${escapeHtml(transaction.merchant || description)}</strong>
                <span>${escapeHtml(description)} · ${escapeHtml(transaction.method || "—")}</span>
              </span>
            </span>
          </td>
          <td>
            <span class="category-pill" style="color:${category.color};background:${category.color}17">
              <span class="category-pill__dot" style="background:${category.color}"></span>
              ${escapeHtml(category.name)}
            </span>
          </td>
          <td><span class="chip ${income ? "chip--success" : "chip--danger"}">${income ? "Income" : "Expense"}</span></td>
          <td class="tx-cell--amount">
            <span class="${income ? "money--income" : "money--expense"}">${income ? "+" : "−"}${money.format(
        transaction.amount
      )}</span>
          </td>
          <td class="tx-cell--actions">
            <button class="icon-action" type="button" data-edit="${escapeHtml(transaction.id)}" aria-label="Edit ${
        escapeHtml(transaction.merchant || "transaction")
      }" title="Edit">
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-edit"></use></svg>
            </button>
            <button class="icon-action icon-action--danger" type="button" data-delete="${escapeHtml(
              transaction.id
            )}" aria-label="Delete ${escapeHtml(transaction.merchant || "transaction")}" title="Delete">
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-trash"></use></svg>
            </button>
          </td>
        </tr>`;
    }

    function pageRows() {
      const start = (state.page - 1) * state.pageSize;
      return state.rows.slice(start, start + state.pageSize);
    }

    function renderTable() {
      const rows = pageRows();
      elements.body.innerHTML = rows.map(rowHtml).join("");
      elements.table.hidden = state.rows.length === 0;
      elements.empty.hidden = state.rows.length > 0;

      elements.body.querySelectorAll("[data-edit]").forEach((button) => {
        button.addEventListener("click", () => {
          const transaction = state.rows.find((item) => item.id === button.getAttribute("data-edit"));
          if (transaction) openEditor(transaction);
        });
      });

      elements.body.querySelectorAll("[data-delete]").forEach((button) => {
        button.addEventListener("click", () => deleteOne(button.getAttribute("data-delete")));
      });

      elements.body.querySelectorAll("[data-select]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          const id = checkbox.getAttribute("data-select");
          if (checkbox.checked) state.selected.add(id);
          else state.selected.delete(id);
          updateSelectionUi();
        });
      });

      updateSelectionUi();
    }

    function renderPagination() {
      const totalPages = Math.max(1, Math.ceil(state.rows.length / state.pageSize));
      if (state.page > totalPages) state.page = totalPages;
      const start = state.rows.length ? (state.page - 1) * state.pageSize + 1 : 0;
      const end = Math.min(state.rows.length, state.page * state.pageSize);

      const buttons = [];
      buttons.push(
        `<button class="pager__page" type="button" data-page="${state.page - 1}" ${
          state.page <= 1 ? "disabled" : ""
        } aria-label="Previous page">‹</button>`
      );

      const windowStart = Math.max(1, Math.min(state.page - 2, totalPages - 4));
      const windowEnd = Math.min(totalPages, windowStart + 4);
      for (let page = windowStart; page <= windowEnd; page += 1) {
        buttons.push(
          `<button class="pager__page${page === state.page ? " is-active" : ""}" type="button" data-page="${page}" aria-label="Page ${page}"${
            page === state.page ? ' aria-current="page"' : ""
          }>${page}</button>`
        );
      }

      buttons.push(
        `<button class="pager__page" type="button" data-page="${state.page + 1}" ${
          state.page >= totalPages ? "disabled" : ""
        } aria-label="Next page">›</button>`
      );

      elements.pagination.innerHTML = `
        <span class="pager__info">Showing ${start}–${end} of ${state.rows.length} transaction${
        state.rows.length === 1 ? "" : "s"
      }</span>
        <div class="pager__buttons">${buttons.join("")}</div>`;

      elements.pagination.querySelectorAll("[data-page]").forEach((button) => {
        button.addEventListener("click", () => {
          const page = Number(button.getAttribute("data-page"));
          if (!Number.isFinite(page) || page < 1 || page > totalPages || page === state.page) return;
          state.page = page;
          renderTable();
          renderPagination();
        });
      });
    }

    function updateSelectionUi() {
      const ids = new Set(pageRows().map((row) => row.id));
      const selectedOnPage = Array.from(ids).filter((id) => state.selected.has(id)).length;
      if (elements.selectAll) {
        elements.selectAll.checked = ids.size > 0 && selectedOnPage === ids.size;
        elements.selectAll.indeterminate = selectedOnPage > 0 && selectedOnPage < ids.size;
      }
      const count = state.selected.size;
      elements.bulkBar.hidden = count === 0;
      if (elements.bulkCount) elements.bulkCount.textContent = String(count);
    }

    async function renderSmartBar() {
      const [undoCount, recurring] = await Promise.all([
        SS.finance.transactions.undoCount(),
        SS.finance.transactions.recurringInfo(),
      ]);

      const items = [];
      if (undoCount > 0) {
        items.push(
          `<span class="smart-bar__item"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-undo"></use></svg><strong>${undoCount}</strong> recent deletion${
            undoCount === 1 ? "" : "s"
          } can be restored</span>`
        );
      }
      if (recurring.total > 0) {
        items.push(
          `<span class="smart-bar__item"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-repeat"></use></svg>${
            recurring.due > 0
              ? `<strong>${recurring.due}</strong> recurring entr${recurring.due === 1 ? "y is" : "ies are"} due`
              : `${recurring.total} recurring entr${recurring.total === 1 ? "y" : "ies"} scheduled`
          }</span>`
        );
      }

      const actions = [];
      if (undoCount > 0) {
        actions.push(`<button class="btn btn--ghost btn--sm" type="button" id="undo-delete">Undo delete</button>`);
      }
      if (recurring.due > 0) {
        actions.push(
          `<button class="btn btn--soft btn--sm" type="button" id="post-recurring">Post due entries</button>`
        );
      }

      elements.smartBar.hidden = items.length === 0;
      elements.smartBar.innerHTML = items.length
        ? `${items.join("")}<div class="smart-bar__actions">${actions.join("")}</div>`
        : "";

      const undoButton = document.getElementById("undo-delete");
      if (undoButton) {
        undoButton.addEventListener("click", async () => {
          const restored = await SS.finance.transactions.restoreLast();
          ui.toast.success(
            "Transactions restored",
            `${restored} entr${restored === 1 ? "y was" : "ies were"} added back to your ledger.`
          );
          await refresh();
        });
      }

      const postButton = document.getElementById("post-recurring");
      if (postButton) {
        postButton.addEventListener("click", async () => {
          ui.setLoading(postButton, true);
          try {
            const count = await SS.finance.transactions.processRecurring();
            ui.toast.success(
              "Recurring entries posted",
              `${count} entr${count === 1 ? "y was" : "ies were"} added to your ledger.`
            );
            await refresh();
          } catch (error) {
            ui.toast.error("Could not post recurring entries", error.message || "Please try again.");
          } finally {
            ui.setLoading(postButton, false);
          }
        });
      }
    }

    async function refresh() {
      const token = ++state.token;
      const rows = await SS.finance.transactions.query(activeFilters());
      if (token !== state.token) return;
      state.rows = rows;

      /* Keep only selections that are still visible. */
      const visible = new Set(rows.map((row) => row.id));
      state.selected.forEach((id) => {
        if (!visible.has(id)) state.selected.delete(id);
      });

      const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
      if (state.page > totalPages) state.page = totalPages;

      renderSummary(rows);
      renderTable();
      renderPagination();
      await renderSmartBar();
    }

    function showError(error) {
      ui.toast.error(
        "Could not load transactions",
        (error && error.message) || "Reload the page and try again."
      );
    }

    function openEditor(transaction) {
      SS.tx.open({
        transaction,
        onSaved: () => {
          refresh().catch(showError);
        },
      });
    }

    async function deleteOne(id) {
      const transaction = state.rows.find((item) => item.id === id);
      if (!transaction) return;
      const confirmed = await ui.confirm({
        title: "Delete this transaction?",
        message: `${transaction.merchant || "This entry"} (${money.format(
          transaction.amount
        )}) will be removed from your ledger. You can undo it from the toolbar.`,
        confirmLabel: "Delete transaction",
        danger: true,
        icon: "trash",
      });
      if (!confirmed) return;
      try {
        await SS.finance.transactions.remove(id);
        state.selected.delete(id);
        ui.toast.success("Transaction deleted", "Use Undo delete in the toolbar if this was a mistake.");
        await refresh();
      } catch (error) {
        ui.toast.error("Could not delete transaction", error.message || "Please try again.");
      }
    }

    function readControls() {
      state.search = elements.search.value.trim();
      state.type = elements.type.value;
      state.categoryId = elements.category.value;
      state.period = elements.period.value;
      state.sort = elements.sort.value;
      state.from = elements.from.value;
      state.to = elements.to.value;
      elements.custom.hidden = state.period !== "custom";
      state.page = 1;
    }

    function resetFilters() {
      elements.search.value = "";
      elements.type.value = "all";
      elements.category.value = "all";
      elements.period.value = "all";
      elements.sort.value = "date-desc";
      elements.from.value = "";
      elements.to.value = "";
      state.selected.clear();
      readControls();
      refresh().catch(showError);
    }

    async function populateCategories() {
      state.categories = await SS.finance.categories.list("all");
      state.categoryMap = {};
      state.categories.forEach((category) => {
        state.categoryMap[category.id] = category;
      });
      const options = ['<option value="all">All categories</option>'];
      const expense = state.categories.filter((category) => category.type === "expense");
      const income = state.categories.filter((category) => category.type === "income");
      if (expense.length) {
        options.push(
          `<optgroup label="Expenses">${expense
            .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
            .join("")}</optgroup>`
        );
      }
      if (income.length) {
        options.push(
          `<optgroup label="Income">${income
            .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
            .join("")}</optgroup>`
        );
      }
      elements.category.innerHTML = options.join("");
    }

    const runSearch = ui.debounce(() => {
      readControls();
      refresh().catch(showError);
    }, 260);

    elements.search.addEventListener("input", runSearch);
    [elements.type, elements.category, elements.period, elements.sort].forEach((control) => {
      control.addEventListener("change", () => {
        readControls();
        refresh().catch(showError);
      });
    });

    [elements.from, elements.to].forEach((input) => {
      input.addEventListener("change", () => {
        readControls();
        refresh().catch(showError);
      });
    });

    elements.reset.addEventListener("click", resetFilters);
    elements.emptyReset.addEventListener("click", resetFilters);

    elements.selectAll.addEventListener("change", () => {
      pageRows().forEach((row) => {
        if (elements.selectAll.checked) state.selected.add(row.id);
        else state.selected.delete(row.id);
      });
      renderTable();
    });

    elements.bulkClear.addEventListener("click", () => {
      state.selected.clear();
      renderTable();
    });

    elements.bulkDelete.addEventListener("click", async () => {
      const ids = Array.from(state.selected);
      if (!ids.length) return;
      const confirmed = await ui.confirm({
        title: `Delete ${ids.length} transaction${ids.length === 1 ? "" : "s"}?`,
        message: "The selected entries will be removed from your ledger. You can undo the deletion afterwards.",
        confirmLabel: "Delete selected",
        danger: true,
        icon: "trash",
      });
      if (!confirmed) return;
      try {
        const removed = await SS.finance.transactions.bulkRemove(ids);
        state.selected.clear();
        ui.toast.success(
          "Transactions deleted",
          `${removed} entr${removed === 1 ? "y was" : "ies were"} removed. Use Undo delete if needed.`
        );
        await refresh();
      } catch (error) {
        ui.toast.error("Could not delete transactions", error.message || "Please try again.");
      }
    });

    elements.exportCsv.addEventListener("click", async () => {
      ui.setLoading(elements.exportCsv, true);
      try {
        const range = periodRange(state.period);
        const csv = await SS.finance.backup.transactionsCsv({ from: range.from, to: range.to });
        const filename = `smartspend-transactions-${dates.todayISO()}.csv`;
        if (ui.download(filename, `\ufeff${csv}`, "text/csv;charset=utf-8")) {
          ui.toast.success("CSV exported", `${filename} has been downloaded.`);
        } else {
          ui.toast.error("Could not export CSV", "Your browser blocked the download.");
        }
      } catch (error) {
        ui.toast.error("Could not export CSV", error.message || "Please try again.");
      } finally {
        ui.setLoading(elements.exportCsv, false);
      }
    });

    document.addEventListener("ss:data-changed", () => {
      refresh().catch(showError);
    });

    try {
      await populateCategories();
      await refresh();
    } catch (error) {
      showError(error);
    }
  });
})(window);
