/* ==========================================================================
   SmartSpend · Dashboard controller
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const money = SS.money;
  const dates = SS.dates;

  ui.ready(async function () {
    const ctx = await SS.shell.mount({
      active: "dashboard",
      title: "Dashboard",
      subtitle: "Income, spending and savings at a glance",
    });
    if (!ctx) return;

    const state = {
      month: dates.currentMonth(),
      token: 0,
      recent: [],
      categories: {},
    };

    ui.qsa("[data-greeting]").forEach((node) => (node.textContent = ui.greeting()));
    ui.qsa("[data-user-first]").forEach((node) => (node.textContent = ui.firstName(ctx.user.fullName)));

    function escape(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function deltaText(current, previous, inverseGood) {
      const now = Number(current) || 0;
      const before = Number(previous) || 0;
      if (before === 0) {
        return { text: now === 0 ? "No activity" : "New this month", tone: "neutral", icon: "minus" };
      }
      const change = ((now - before) / Math.abs(before)) * 100;
      const up = change >= 0;
      const good = inverseGood ? !up : up;
      return {
        text: `${Math.abs(change).toFixed(0)}% vs last month`,
        tone: Math.abs(change) < 1 ? "neutral" : good ? "positive" : "negative",
        icon: up ? "trending-up" : "trending-down",
      };
    }

    function statusChip(status) {
      if (status === "over") return { label: "Over budget", className: "chip--danger" };
      if (status === "warning") return { label: "Close to limit", className: "chip--warning" };
      if (status === "ok") return { label: "On track", className: "chip--success" };
      return { label: "Not set", className: "chip" };
    }

    function progressClass(status) {
      return status === "over" ? "danger" : status === "warning" ? "warning" : "success";
    }

    function metricCard(options) {
      const delta = options.delta || null;
      const deltaHtml = delta
        ? `<span class="delta delta--${delta.tone}">
             <svg class="icon icon--sm" aria-hidden="true"><use href="#i-${delta.icon}"></use></svg>
             ${escape(delta.text)}
           </span>`
        : "";
      const progress = options.progress
        ? `<div class="progress progress--${options.progress.tone || "primary"}" role="img" aria-label="${Math.round(
            options.progress.value
          )} percent used"><span style="width:${money.clampPercent(options.progress.value)}%"></span></div>`
        : "";
      return `
        <article class="metric-card metric-card--${options.tone || "primary"}">
          <div class="metric-card__top">
            <span class="metric-card__icon">
              <svg class="icon" aria-hidden="true"><use href="#i-${options.icon}"></use></svg>
            </span>
            ${deltaHtml}
          </div>
          <span class="metric-card__label">${escape(options.label)}</span>
          <strong class="metric-card__value">${escape(options.value)}</strong>
          ${progress}
          <span class="metric-card__hint">${escape(options.hint || "")}</span>
        </article>`;
    }

    function emptyState(icon, title, message, href, action) {
      return `
        <div class="empty-state empty-state--compact">
          <span class="empty-state__icon"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-${icon}"></use></svg></span>
          <strong>${escape(title)}</strong>
          <p>${escape(message)}</p>
          ${href ? `<a class="btn btn--ghost btn--sm" href="${href}">${escape(action || "Open")}</a>` : ""}
        </div>`;
    }

    function renderMonth() {
      const label = document.getElementById("month-label");
      if (label) label.textContent = dates.monthLabel(state.month);
      const next = document.getElementById("month-next");
      if (next) next.disabled = state.month >= dates.currentMonth();
    }

    async function refresh() {
      const token = ++state.token;
      renderMonth();
      const range = dates.monthRange(state.month);
      const previousRange = dates.monthRange(dates.addMonths(state.month, -1));

      const [overview, previous, trend, byCategory, goalSummary, allTime, categoryList, recentRows] =
        await Promise.all([
          SS.finance.getOverview(state.month),
          SS.finance.reports.overview(previousRange),
          SS.finance.reports.trend(6, state.month),
          SS.finance.reports.byCategory(range),
          SS.finance.goals.summary(),
          SS.finance.reports.overview({}),
          SS.finance.categories.list("all"),
          SS.finance.transactions.query({ sort: "date-desc" }),
        ]);

      if (token !== state.token) return;

      state.recent = recentRows.slice(0, 6);
      state.categories = {};
      categoryList.forEach((category) => {
        state.categories[category.id] = category;
      });

      const summary = overview.summary;
      const budget = overview.budget;

      /* Metrics */
      const netDelta = deltaText(summary.net, previous.net, false);
      const incomeDelta = deltaText(summary.income, previous.income, false);
      const expenseDelta = deltaText(summary.expense, previous.expense, true);
      const budgetChip = statusChip(budget.total.status);
      const metrics = [
        metricCard({
          tone: "success",
          icon: "trending-up",
          label: "Net saved",
          value: money.format(summary.net),
          delta: netDelta,
          hint: `All-time net ${money.format(allTime.net)} · ${summary.savingsRate.toFixed(0)}% savings rate`,
        }),
        metricCard({
          tone: "info",
          icon: "arrow-down",
          label: "Income",
          value: money.format(summary.income),
          delta: incomeDelta,
          hint: `${summary.incomeCount} credit${summary.incomeCount === 1 ? "" : "s"} this month`,
        }),
        metricCard({
          tone: "danger",
          icon: "arrow-up",
          label: "Expenses",
          value: money.format(summary.expense),
          delta: expenseDelta,
          hint: `${money.format(summary.activeDays ? summary.expense / summary.activeDays : 0)} average per active day`,
        }),
        metricCard({
          tone: "warning",
          icon: "target",
          label: "Budget left",
          value:
            budget.total.amount > 0
              ? money.format(Math.max(0, budget.total.remaining))
              : "Not set",
          progress:
            budget.total.amount > 0
              ? {
                  value: budget.total.progress,
                  tone: progressClass(budget.total.status),
                }
              : null,
          hint:
            budget.total.amount > 0
              ? `${budgetChip.label} · ${money.format(budget.total.spent)} of ${money.format(
                  budget.total.amount
                )}`
              : "Set an overall monthly budget to track this.",
        }),
      ];
      document.getElementById("metrics").innerHTML = metrics.join("");

      /* Cash flow */
      SS.charts.lineChart("#cashflow-chart", {
        labels: trend.map((item) => item.label),
        series: [
          { name: "Income", color: "#0f9d76", values: trend.map((item) => item.income), area: false },
          { name: "Expenses", color: "#f43f5e", values: trend.map((item) => item.expense), area: false },
        ],
        formatValue: (value) => money.compact(value),
        title: "Income and expenses over the last six months",
        emptyMessage: "Add a few transactions to see your cash flow.",
      });

      /* Donut */
      const donutItems = byCategory.slice(0, 6).map((item) => ({
        label: item.name,
        value: item.total,
        color: item.color,
      }));
      const remainder = byCategory.slice(6).reduce((total, item) => total + item.total, 0);
      if (remainder > 0) {
        donutItems.push({ label: "Other categories", value: remainder, color: "#94a3b8" });
      }
      SS.charts.donut("#category-chart", {
        items: donutItems,
        title: "Spending by category",
        centerLabel: "spent",
        formatValue: (value) => money.format(value),
        emptyMessage: "No expenses in this month yet.",
      });

      /* Budget snapshot */
      const budgetNode = document.getElementById("budget-snapshot");
      if (!budget.total.amount) {
        budgetNode.innerHTML = emptyState(
          "target",
          "No budget for this month",
          "Set an overall limit and per-category limits to unlock warnings.",
          "budgets.html",
          "Create a budget"
        );
      } else {
        const overallChip = statusChip(budget.total.status);
        const left = budget.total.remaining;
        const topCategories = budget.categories.slice(0, 3);
        budgetNode.innerHTML = `
          <div class="budget-overview">
            <div class="budget-overview__head">
              <div>
                <span class="muted">Overall monthly budget</span>
                <strong>${money.format(budget.total.spent)} <span>of ${money.format(
                  budget.total.amount
                )}</span></strong>
              </div>
              <span class="chip ${overallChip.className}">${overallChip.label}</span>
            </div>
            <div class="progress progress--${progressClass(budget.total.status)}">
              <span style="width:${money.clampPercent(budget.total.progress)}%"></span>
            </div>
            <div class="budget-overview__meta">
              <span>${left >= 0 ? `${money.format(left)} remaining` : `${money.format(Math.abs(left))} over`}</span>
              <span>${budget.total.percent.toFixed(0)}% used</span>
            </div>
          </div>
          <ul class="mini-budget-list">
            ${topCategories
              .map((entry) => {
                const chip = statusChip(entry.status);
                return `<li class="mini-budget">
                  <span class="mini-budget__icon" style="color:${entry.categoryColor};background:${entry.categoryColor}1f">
                    <svg class="icon icon--sm" aria-hidden="true"><use href="#i-${entry.categoryIcon}"></use></svg>
                  </span>
                  <span class="mini-budget__copy">
                    <span class="mini-budget__head"><strong>${escape(entry.categoryName)}</strong><span class="chip ${chip.className}">${chip.label}</span></span>
                    <span class="mini-budget__amounts">${money.format(entry.spent)} of ${money.format(entry.amount)}</span>
                    <span class="progress progress--${progressClass(entry.status)} progress--thin"><span style="width:${money.clampPercent(entry.progress)}%"></span></span>
                  </span>
                </li>`;
              })
              .join("")}
          </ul>`;
      }

      /* Goals */
      const goalNode = document.getElementById("goal-snapshot");
      const topGoals = goalSummary.goals.filter((goal) => goal.status !== "completed").slice(0, 2);
      if (!topGoals.length) {
        goalNode.innerHTML = emptyState(
          "piggy-bank",
          goalSummary.completed ? "Every goal is funded" : "No savings goals yet",
          goalSummary.completed
            ? "Create a fresh goal to keep the momentum going."
            : "Turn a plan into a target with a deadline and monthly amount.",
          "goals.html",
          "Create a goal"
        );
      } else {
        goalNode.innerHTML = `
          <div class="goal-overview">
            <div class="goal-overview__numbers">
              <div>
                <span class="muted">Saved across goals</span>
                <strong>${money.format(goalSummary.saved)}</strong>
              </div>
              <div class="goal-overview__right">
                <span class="muted">Target</span>
                <strong>${money.format(goalSummary.target)}</strong>
              </div>
            </div>
            <div class="progress">
              <span style="width:${money.clampPercent(money.percent(goalSummary.saved, goalSummary.target))}%"></span>
            </div>
            <span class="goal-overview__hint">${money.format(goalSummary.monthlyNeeded)} per month needed to stay on schedule.</span>
          </div>
          <ul class="mini-goal-list">
            ${topGoals
              .map(
                (goal) => `
                <li class="mini-goal">
                  <span class="mini-goal__dot" style="background:${goal.color}"></span>
                  <span class="mini-goal__copy">
                    <span class="mini-goal__head"><strong>${escape(goal.name)}</strong><span>${Math.round(
                      goal.percent
                    )}%</span></span>
                    <span class="progress progress--thin"><span style="width:${money.clampPercent(
                      goal.progress
                    )}%;background:${goal.color}"></span></span>
                    <span class="mini-goal__meta">${money.format(goal.saved)} of ${money.format(
                      goal.target
                    )} · ${goal.daysLeft >= 0 ? `${goal.daysLeft} days left` : "Past due"}</span>
                  </span>
                </li>`
              )
              .join("")}
          </ul>`;
      }

      /* Recent transactions */
      const recentNode = document.getElementById("recent-list");
      if (!state.recent.length) {
        recentNode.innerHTML = emptyState(
          "receipt",
          "No transactions yet",
          "Add your first income or expense to bring the dashboard to life.",
          "transactions.html",
          "Open ledger"
        );
      } else {
        recentNode.innerHTML = state.recent
          .map((transaction) => {
            const category = state.categories[transaction.categoryId] || {};
            const income = transaction.type === "income";
            return `
              <button class="recent-row" type="button" data-tx-id="${transaction.id}">
                <span class="recent-row__icon" style="color:${category.color || "#64748b"};background:${
                  (category.color || "#64748b") + "1f"
                }">
                  <svg class="icon" aria-hidden="true"><use href="#i-${category.icon || "receipt"}"></use></svg>
                </span>
                <span class="recent-row__copy">
                  <strong>${escape(transaction.merchant || transaction.note || "Transaction")}</strong>
                  <span>${escape(category.name || "Uncategorised")} · ${dates.format(transaction.date)}</span>
                </span>
                <span class="recent-row__amount ${income ? "money--income" : "money--expense"}">${
                  income ? "+" : "−"
                }${money.format(transaction.amount)}</span>
              </button>`;
          })
          .join("");

        recentNode.querySelectorAll("[data-tx-id]").forEach((button) => {
          button.addEventListener("click", () => {
            const transaction = state.recent.find(
              (item) => item.id === button.getAttribute("data-tx-id")
            );
            if (transaction) SS.tx.open({ transaction });
          });
        });
      }

      /* Insights */
      const insights = [];
      if (byCategory.length) {
        const top = byCategory[0];
        insights.push({
          icon: top.icon,
          tone: "primary",
          title: `${top.name} is your biggest category`,
          text: `${money.format(top.total)} across ${top.count} transaction${
            top.count === 1 ? "" : "s"
          } — ${top.percent.toFixed(0)}% of this month's spending.`,
        });
      }
      if (summary.biggest) {
        const category = state.categories[summary.biggest.categoryId] || {};
        insights.push({
          icon: "receipt",
          tone: "danger",
          title: "Largest single expense",
          text: `${summary.biggest.merchant || "Transaction"} · ${money.format(
            summary.biggest.amount
          )} (${category.name || "Other"}) on ${dates.format(summary.biggest.date)}.`,
        });
      }
      if (budget.total.amount > 0) {
        const remaining = budget.total.remaining;
        insights.push({
          icon: budget.total.status === "over" ? "alert" : "shield",
          tone: budget.total.status === "over" ? "danger" : "success",
          title:
            budget.total.status === "over"
              ? "Budget exceeded"
              : budget.total.status === "warning"
                ? "Budget is getting tight"
                : "Budget is on track",
          text:
            remaining >= 0
              ? `${money.format(remaining)} left with ${Math.max(
                  0,
                  dates.daysInMonth(state.month) - Number(dates.todayISO().slice(8, 10))
                )} days to go in ${dates.monthLabel(state.month, { year: false })}.`
              : `${money.format(Math.abs(remaining))} over the monthly limit. Adjust a category or pause spending.`,
        });
      }
      insights.push({
        icon: "trending-up",
        tone: summary.savingsRate >= 20 ? "success" : "warning",
        title: `${summary.savingsRate.toFixed(0)}% savings rate`,
        text:
          summary.savingsRate >= 20
            ? "A healthy share of income stayed in your pocket this month."
            : "Aim for 20% or more by trimming the fastest-growing category.",
      });
      document.getElementById("insights").innerHTML = insights
        .slice(0, 4)
        .map(
          (item) => `
          <li class="insight">
            <span class="insight__icon insight__icon--${item.tone}">
              <svg class="icon" aria-hidden="true"><use href="#i-${item.icon}"></use></svg>
            </span>
            <span class="insight__body"><strong>${escape(item.title)}</strong><span>${escape(
              item.text
            )}</span></span>
          </li>`
        )
        .join("");
    }

    document.getElementById("month-prev").addEventListener("click", () => {
      state.month = dates.addMonths(state.month, -1);
      refresh().catch(showError);
    });

    document.getElementById("month-next").addEventListener("click", () => {
      if (state.month >= dates.currentMonth()) return;
      state.month = dates.addMonths(state.month, 1);
      refresh().catch(showError);
    });

    document.addEventListener("ss:data-changed", () => {
      refresh().catch(showError);
    });

    function showError(error) {
      ui.toast.error(
        "Could not refresh the dashboard",
        (error && error.message) || "Reload the page and try again."
      );
    }

    try {
      await refresh();
    } catch (error) {
      showError(error);
    }
  });
})(window);
