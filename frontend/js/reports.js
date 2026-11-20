/* ==========================================================================
   SmartSpend · Reports and analytics controller (Phase 6)
   Period ranges, trend charts, category mix, merchant ranking and insights.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const money = SS.money;
  const dates = SS.dates;

  ui.ready(async function () {
    const ctx = await SS.shell.mount({
      active: "reports",
      title: "Reports",
      subtitle: "Trends, category mix and spending habits",
    });
    if (!ctx) return;

    const current = dates.currentMonth();
    const currentRange = dates.monthRange(current);

    const state = {
      period: "this-month",
      from: currentRange.from,
      to: dates.todayISO(),
      token: 0,
    };

    const elements = {
      summary: document.getElementById("report-summary"),
      period: document.getElementById("report-period"),
      custom: document.getElementById("report-custom"),
      from: document.getElementById("report-from"),
      to: document.getElementById("report-to"),
      trend: document.getElementById("report-trend"),
      donut: document.getElementById("report-donut"),
      bars: document.getElementById("report-bars"),
      categories: document.getElementById("report-categories"),
      merchants: document.getElementById("report-merchants"),
      facts: document.getElementById("report-facts"),
      insights: document.getElementById("report-insights"),
      exportCsv: document.getElementById("report-export"),
      print: document.getElementById("report-print"),
    };

    elements.from.value = currentRange.from;
    elements.to.value = dates.todayISO();

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function activeRange() {
      const month = dates.currentMonth();
      if (state.period === "this-month") return dates.monthRange(month);
      if (state.period === "last-month") return dates.monthRange(dates.addMonths(month, -1));
      if (state.period === "last-3") {
        return {
          from: dates.monthRange(dates.addMonths(month, -2)).from,
          to: dates.monthRange(month).to,
        };
      }
      if (state.period === "last-6") {
        return {
          from: dates.monthRange(dates.addMonths(month, -5)).from,
          to: dates.monthRange(month).to,
        };
      }
      if (state.period === "this-year") {
        return { from: `${month.slice(0, 4)}-01-01`, to: `${month.slice(0, 4)}-12-31` };
      }
      const from = elements.from.value || currentRange.from;
      const to = elements.to.value || dates.todayISO();
      return from <= to ? { from, to } : { from: to, to: from };
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

    function renderSummary(overview) {
      elements.summary.innerHTML = [
        summaryCard(
          "success",
          "arrow-down",
          "Income",
          money.format(overview.income),
          `${overview.incomeCount} credit${overview.incomeCount === 1 ? "" : "s"}`
        ),
        summaryCard(
          "danger",
          "arrow-up",
          "Expenses",
          money.format(overview.expense),
          `${overview.expenseCount} debit${overview.expenseCount === 1 ? "" : "s"}`
        ),
        summaryCard(
          overview.net >= 0 ? "primary" : "danger",
          "wallet",
          "Net saved",
          money.signed(overview.net),
          `${overview.savingsRate.toFixed(0)}% savings rate`
        ),
        summaryCard(
          "info",
          "calendar",
          "Average daily spend",
          money.format(overview.avgDaily),
          `${overview.activeDays} active day${overview.activeDays === 1 ? "" : "s"}`
        ),
      ].join("");
    }

    function renderTrend(trend) {
      SS.charts.lineChart("#report-trend", {
        labels: trend.map((item) => item.label),
        series: [
          { name: "Income", color: "#0f9d76", values: trend.map((item) => item.income), area: false },
          { name: "Expenses", color: "#f43f5e", values: trend.map((item) => item.expense), area: false },
        ],
        formatValue: (value) => money.compact(value),
        title: "Income and expenses over the last six months",
        emptyMessage: "Add transactions to see the trend.",
      });

      SS.charts.barChart("#report-bars", {
        labels: trend.map((item) => item.label),
        series: [
          { name: "Income", color: "#0f9d76", values: trend.map((item) => item.income) },
          { name: "Expenses", color: "#f43f5e", values: trend.map((item) => item.expense) },
        ],
        formatValue: (value) => money.compact(value),
        title: "Monthly income and expenses",
        emptyMessage: "No monthly data in this window yet.",
      });
    }

    function renderDonut(byCategory) {
      const items = byCategory.slice(0, 6).map((item) => ({
        label: item.name,
        value: item.total,
        color: item.color,
      }));
      const remainder = byCategory.slice(6).reduce((total, item) => total + item.total, 0);
      if (remainder > 0) items.push({ label: "Other categories", value: remainder, color: "#94a3b8" });

      SS.charts.donut("#report-donut", {
        items,
        title: "Expense category mix",
        centerLabel: "spent",
        formatValue: (value) => money.format(value),
        emptyMessage: "No expenses in the selected period.",
      });
    }

    function renderCategories(byCategory) {
      if (!byCategory.length) {
        elements.categories.innerHTML = `
          <div class="empty-state empty-state--compact">
            <span class="empty-state__icon"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-pie"></use></svg></span>
            <strong>No expenses in this period</strong>
            <p>Pick a wider period or add a transaction to populate the breakdown.</p>
          </div>`;
        return;
      }

      elements.categories.innerHTML = byCategory
        .map(
          (entry) => `
          <div class="breakdown-row">
            <span class="breakdown-row__icon" style="color:${entry.color};background:${entry.color}1f">
              <svg class="icon icon--sm" aria-hidden="true"><use href="#i-${entry.icon || "receipt"}"></use></svg>
            </span>
            <span class="breakdown-row__main">
              <span class="breakdown-row__head">
                <strong>${escapeHtml(entry.name)}</strong>
                <span>${entry.count} entr${entry.count === 1 ? "y" : "ies"} · ${entry.percent.toFixed(0)}%</span>
              </span>
              <span class="progress progress--thin" role="img" aria-label="${entry.percent.toFixed(0)} percent of expenses">
                <span style="width:${money.clampPercent(entry.percent)}%;background:${entry.color}"></span>
              </span>
            </span>
            <span class="breakdown-row__amount">${money.format(entry.total)}</span>
          </div>`
        )
        .join("");
    }

    function renderMerchants(merchants) {
      if (!merchants.length) {
        elements.merchants.innerHTML = `
          <div class="empty-state empty-state--compact">
            <span class="empty-state__icon"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-shopping-bag"></use></svg></span>
            <strong>No merchant activity</strong>
            <p>Merchant rankings appear once expenses are recorded.</p>
          </div>`;
        return;
      }

      elements.merchants.innerHTML = merchants
        .map(
          (merchant, index) => `
          <div class="rank-row">
            <span class="rank-row__index">${index + 1}</span>
            <span class="rank-row__main">
              <strong>${escapeHtml(merchant.name)}</strong>
              <span>${merchant.count} transaction${merchant.count === 1 ? "" : "s"} · last ${escapeHtml(
            dates.format(merchant.lastDate)
          )}</span>
            </span>
            <span class="rank-row__amount">${money.format(merchant.total)}</span>
          </div>`
        )
        .join("");
    }

    function renderFacts(overview, byCategory) {
      const biggest = overview.biggest;
      const topCategory = byCategory[0];
      const facts = [
        { label: "Avg. transaction", value: money.format(overview.avgTransaction) },
        { label: "Largest expense", value: biggest ? money.format(biggest.amount) : "—" },
        { label: "Top category", value: topCategory ? topCategory.name : "—" },
        { label: "Transactions", value: String(overview.count) },
      ];
      elements.facts.innerHTML = facts
        .map(
          (fact) => `
          <div class="report-fact">
            <span>${escapeHtml(fact.label)}</span>
            <strong>${escapeHtml(fact.value)}</strong>
          </div>`
        )
        .join("");
    }

    function renderInsights(overview, byCategory, trend, categoryMap) {
      const insights = [];

      if (byCategory.length) {
        const top = byCategory[0];
        insights.push({
          icon: top.icon || "pie",
          tone: "primary",
          title: `${top.name} leads your spending`,
          text: `${money.format(top.total)} across ${top.count} transaction${
            top.count === 1 ? "" : "s"
          } — ${top.percent.toFixed(0)}% of the total in this period.`,
        });
      }

      if (overview.biggest) {
        const category = categoryMap[overview.biggest.categoryId];
        insights.push({
          icon: "receipt",
          tone: "danger",
          title: "Largest single expense",
          text: `${overview.biggest.merchant || "Transaction"} · ${money.format(
            overview.biggest.amount
          )} (${category ? category.name : "Other"}) on ${dates.format(overview.biggest.date)}.`,
        });
      }

      const bestMonth = trend.slice().sort((a, b) => b.net - a.net)[0];
      if (bestMonth) {
        insights.push({
          icon: "trending-up",
          tone: bestMonth.net >= 0 ? "success" : "warning",
          title: `${bestMonth.label} had the strongest net`,
          text: `${money.signed(bestMonth.net)} saved with a ${bestMonth.savingsRate.toFixed(
            0
          )}% savings rate across ${bestMonth.count} transaction${bestMonth.count === 1 ? "" : "s"}.`,
        });
      }

      insights.push({
        icon: overview.savingsRate >= 20 ? "shield" : "alert",
        tone: overview.savingsRate >= 20 ? "success" : "warning",
        title: `${overview.savingsRate.toFixed(0)}% savings rate`,
        text:
          overview.savingsRate >= 20
            ? "A healthy share of income stayed with you in this period."
            : "Aim for 20% or more by trimming the largest category or the top merchant.",
      });

      elements.insights.innerHTML = insights
        .slice(0, 4)
        .map(
          (item) => `
          <li class="insight">
            <span class="insight__icon insight__icon--${item.tone}">
              <svg class="icon" aria-hidden="true"><use href="#i-${item.icon}"></use></svg>
            </span>
            <span class="insight__body">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.text)}</span>
            </span>
          </li>`
        )
        .join("");
    }

    async function refresh() {
      const token = ++state.token;
      elements.custom.hidden = state.period !== "custom";
      const range = activeRange();

      const rangeEndMonth = dates.monthKey(range.to) || dates.currentMonth();
      const trendEnd = rangeEndMonth > dates.currentMonth() ? dates.currentMonth() : rangeEndMonth;

      const [overview, byCategory, trend, merchants, categoryList] = await Promise.all([
        SS.finance.reports.overview(range),
        SS.finance.reports.byCategory(range),
        SS.finance.reports.trend(6, trendEnd),
        SS.finance.reports.topMerchants(range, 6),
        SS.finance.categories.list("all"),
      ]);

      if (token !== state.token) return;

      const categoryMap = {};
      categoryList.forEach((category) => {
        categoryMap[category.id] = category;
      });

      renderSummary(overview);
      renderTrend(trend);
      renderDonut(byCategory);
      renderCategories(byCategory);
      renderMerchants(merchants);
      renderFacts(overview, byCategory);
      renderInsights(overview, byCategory, trend, categoryMap);
    }

    function showError(error) {
      ui.toast.error("Could not load reports", (error && error.message) || "Reload the page and try again.");
    }

    elements.period.addEventListener("change", () => {
      state.period = elements.period.value;
      refresh().catch(showError);
    });

    [elements.from, elements.to].forEach((input) => {
      input.addEventListener("change", () => {
        state.period = "custom";
        elements.period.value = "custom";
        refresh().catch(showError);
      });
    });

    elements.exportCsv.addEventListener("click", async () => {
      ui.setLoading(elements.exportCsv, true);
      try {
        const range = activeRange();
        const csv = await SS.finance.backup.transactionsCsv(range);
        const filename = `smartspend-report-${range.from}-to-${range.to}.csv`;
        if (ui.download(filename, `\ufeff${csv}`, "text/csv;charset=utf-8")) {
          ui.toast.success("Report exported", `${filename} has been downloaded.`);
        } else {
          ui.toast.error("Could not export report", "Your browser blocked the download.");
        }
      } catch (error) {
        ui.toast.error("Could not export report", error.message || "Please try again.");
      } finally {
        ui.setLoading(elements.exportCsv, false);
      }
    });

    elements.print.addEventListener("click", () => {
      window.print();
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
