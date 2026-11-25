/* ==========================================================================
   SmartSpend · Finance API facade
   Every finance screen talks to this module only. The browser adapter below
   uses the local browser store; the Java/SQLite adapter is the default in the
   live app. Response shapes intentionally match the REST endpoints.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const dates = SS.dates;
  const money = SS.money;
  const data = SS.data;
  const dsa = SS.dsa;

  class FinanceError extends Error {
    constructor(message, field, code) {
      super(message);
      this.name = "FinanceError";
      this.field = field || null;
      this.code = code || "FINANCE_ERROR";
    }
  }

  let activeUserId = null;
  let cache = null;

  function sessionUserId() {
    try {
      const session = SS.store.getStoredSession();
      return session && session.userId ? session.userId : null;
    } catch (error) {
      return null;
    }
  }

  async function userId() {
    if (activeUserId) return activeUserId;
    const fromSession = sessionUserId();
    if (fromSession) {
      activeUserId = fromSession;
      return activeUserId;
    }
    const user = await SS.api.getCurrentUser();
    if (!user) {
      throw new FinanceError("Please sign in to continue.", null, "UNAUTHENTICATED");
    }
    activeUserId = user.id;
    return activeUserId;
  }

  async function loadDoc() {
    const id = await userId();
    if (cache && cache.userId === id) return cache.doc;
    const doc = data.load(id);
    cache = { userId: id, doc };
    money.setCurrency(doc.settings.currency || "INR");
    money.setDateFormat(doc.settings.dateFormat || "DD MMM YYYY");
    return doc;
  }

  function commit(doc) {
    if (!activeUserId) throw new FinanceError("Your session has ended. Please sign in again.");
    doc.updatedAt = new Date().toISOString();
    data.save(activeUserId, doc);
    cache = { userId: activeUserId, doc };
    document.dispatchEvent(new CustomEvent("ss:data-changed"));
    return doc;
  }

  function resetCache() {
    activeUserId = null;
    cache = null;
  }

  function today() {
    return dates.todayISO();
  }

  function inRange(transaction, from, to) {
    if (from && transaction.date < from) return false;
    if (to && transaction.date > to) return false;
    return true;
  }

  function categoryMap(doc) {
    return data.createCategoryMap(doc.categories);
  }

  function summarize(rows) {
    let income = 0;
    let expense = 0;
    let expenseCount = 0;
    let incomeCount = 0;
    let biggest = null;
    const datesSeen = new Set();

    (rows || []).forEach((transaction) => {
      const amount = Number(transaction.amount) || 0;
      datesSeen.add(transaction.date);
      if (transaction.type === "income") {
        income += amount;
        incomeCount += 1;
      } else {
        expense += amount;
        expenseCount += 1;
        if (!biggest || amount > biggest.amount) biggest = transaction;
      }
    });

    const net = income - expense;
    return {
      income: data.roundMoney(income),
      expense: data.roundMoney(expense),
      net: data.roundMoney(net),
      savingsRate: income > 0 ? data.roundMoney((net / income) * 100) : 0,
      count: (rows || []).length,
      incomeCount,
      expenseCount,
      activeDays: datesSeen.size,
      biggest,
    };
  }

  function statusFor(spent, amount) {
    if (!amount || amount <= 0) return "unset";
    const percent = (spent / amount) * 100;
    if (percent >= 100) return "over";
    if (percent >= 80) return "warning";
    return "ok";
  }

  function decorateBudgetEntry(entry, categories, transactions, month) {
    const category = entry.categoryId ? categories[entry.categoryId] : null;
    const spent = transactions.reduce((total, transaction) => {
      if (transaction.type !== "expense") return total;
      if (transaction.date.slice(0, 7) !== month) return total;
      if (entry.categoryId && transaction.categoryId !== entry.categoryId) return total;
      return total + (Number(transaction.amount) || 0);
    }, 0);
    const amount = Number(entry.amount) || 0;
    const percent = amount > 0 ? (spent / amount) * 100 : 0;
    return {
      id: entry.id,
      month: entry.month,
      categoryId: entry.categoryId,
      categoryName: category ? category.name : "Overall monthly budget",
      categoryColor: category ? category.color : "#6366f1",
      categoryIcon: category ? category.icon : "target",
      amount,
      spent: data.roundMoney(spent),
      remaining: data.roundMoney(amount - spent),
      percent: data.roundMoney(percent),
      progress: Math.min(100, Math.max(0, percent)),
      status: statusFor(spent, amount),
    };
  }

  function decorateGoal(goal) {
    const target = Number(goal.target) || 0;
    const saved = Number(goal.saved) || 0;
    const remaining = Math.max(0, target - saved);
    const percent = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
    const todayISO = today();
    const daysLeft = goal.deadline ? dates.daysBetween(todayISO, goal.deadline) : 0;
    const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
    const completed = target > 0 && saved >= target;
    return Object.assign({}, goal, {
      target,
      saved,
      remaining,
      percent: data.roundMoney(percent),
      progress: Math.min(100, Math.max(0, percent)),
      daysLeft,
      monthsLeft,
      monthlyNeeded: completed ? 0 : data.roundMoney(remaining / monthsLeft),
      status: completed ? "completed" : daysLeft < 0 ? "overdue" : "active",
    });
  }

  function advanceMonth(isoDate) {
    const date = dates.parseISO(isoDate);
    if (!date) return dates.todayISO();
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, last));
    return dates.toISO(date);
  }

  function buildNotifications(doc) {
    const settings = doc.settings || {};
    const prefs = settings.notifications || {};
    const month = dates.currentMonth();
    const categories = categoryMap(doc);
    const monthRange = dates.monthRange(month);
    const rows = doc.transactions.filter((transaction) => inRange(transaction, monthRange.from, monthRange.to));
    const budget = buildBudget(doc, month, categories, doc.transactions);
    const items = [];

    if (prefs.budgetAlerts !== false) {
      if (budget.total.status === "over") {
        items.push({
          id: `budget:${month}:overall`,
          tone: "danger",
          icon: "alert",
          title: "Overall budget exceeded",
          message: `You have spent ${money.format(budget.total.spent)} of your ${money.format(budget.total.amount)} budget for ${dates.monthLabel(month)}.`,
          link: `budgets.html?month=${month}`,
          createdAt: `${monthRange.to}T09:00:00`,
          priority: 0,
        });
      }
      budget.categories.forEach((entry) => {
        if (entry.status === "over") {
          items.push({
            id: `budget:${month}:${entry.categoryId}`,
            tone: "danger",
            icon: "alert",
            title: `${entry.categoryName} budget exceeded`,
            message: `${money.format(entry.spent)} spent against ${money.format(entry.amount)}. Review this category to get back on track.`,
            link: `budgets.html?month=${month}`,
            createdAt: `${monthRange.to}T08:00:00`,
            priority: 0,
          });
        } else if (entry.status === "warning") {
          items.push({
            id: `budget:${month}:${entry.categoryId}`,
            tone: "warning",
            icon: "target",
            title: `${entry.categoryName} budget at ${Math.round(entry.percent)}%`,
            message: `${money.format(entry.remaining)} left this month. Consider slowing down this category.`,
            link: `budgets.html?month=${month}`,
            createdAt: `${monthRange.to}T08:00:00`,
            priority: 1,
          });
        }
      });
    }

    if (prefs.goalReminders !== false) {
      doc.goals.map(decorateGoal).forEach((goal) => {
        if (goal.status === "completed") {
          items.push({
            id: `goal:${goal.id}:complete`,
            tone: "success",
            icon: "check-circle",
            title: `${goal.name} is fully funded`,
            message: `You reached ${money.format(goal.target)}. Create a new goal when you are ready.`,
            link: "goals.html",
            createdAt: `${dates.todayISO()}T07:00:00`,
            priority: 3,
          });
        } else if (goal.daysLeft >= 0 && goal.daysLeft <= 45 && goal.percent < 85) {
          items.push({
            id: `goal:${goal.id}:deadline`,
            tone: "warning",
            icon: "piggy-bank",
            title: `${goal.name} needs attention`,
            message: `${goal.daysLeft} day${goal.daysLeft === 1 ? "" : "s"} left. Save about ${money.format(goal.monthlyNeeded)} per month to finish on time.`,
            link: "goals.html",
            createdAt: `${dates.todayISO()}T07:00:00`,
            priority: 2,
          });
        }
      });
    }

    if (prefs.recurringReminders !== false) {
      const due = (doc.state.recurringQueue || []).filter((item) => item.nextDate <= today());
      if (due.length) {
        items.push({
          id: `recurring:${due.length}:${today()}`,
          tone: "info",
          icon: "repeat",
          title: `${due.length} recurring transaction${due.length === 1 ? "" : "s"} due`,
          message: "Open transactions to post the scheduled entries to your ledger.",
          link: "transactions.html",
          createdAt: `${today()}T06:00:00`,
          priority: 2,
        });
      }
    }

    if (prefs.weeklyDigest !== false && rows.length) {
      const summary = summarize(rows);
      items.push({
        id: `digest:${month}:${dates.todayISO()}`,
        tone: "info",
        icon: "chart",
        title: "This month at a glance",
        message: `${summary.count} transactions · ${money.format(summary.expense)} spent · ${money.format(summary.net)} net.`,
        link: "reports.html",
        createdAt: `${today()}T05:00:00`,
        priority: 4,
      });
    }

    const hasCategories = doc.categories.length > 0;
    items.push({
      id: `welcome:${doc.seededAt || doc.state.createdAt || "workspace"}`,
      tone: "info",
      icon: "sparkles",
      title: "Your workspace is ready",
      message: hasCategories
        ? "Review your latest activity or add a new transaction from the dashboard."
        : "Add your first category in Settings, then record a transaction to get started.",
      link: hasCategories ? "dashboard.html" : "settings.html#categories",
      createdAt: doc.seededAt || doc.state.createdAt || new Date().toISOString(),
      priority: 5,
    });

    const read = new Set(doc.state.readNotifications || []);
    const dismissed = new Set(doc.state.dismissedNotifications || []);

    return items
      .filter((item) => !dismissed.has(item.id))
      .map((item) => Object.assign({}, item, { read: read.has(item.id) }))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
  }

  function buildBudget(doc, month, categories, transactions) {
    const entries = doc.budgets.filter((entry) => entry.month === month);
    const overall = entries.find((entry) => !entry.categoryId) || { id: null, amount: 0, categoryId: null };
    const categoryEntries = entries.filter((entry) => entry.categoryId);
    const totalSpent = transactions
      .filter((transaction) => transaction.type === "expense" && transaction.date.slice(0, 7) === month)
      .reduce((total, transaction) => total + (Number(transaction.amount) || 0), 0);
    const totalAmount = Number(overall.amount) || 0;
    const totalPercent = totalAmount > 0 ? (totalSpent / totalAmount) * 100 : 0;

    const categoryBudgets = categoryEntries
      .map((entry) => decorateBudgetEntry(entry, categories, transactions, month))
      .sort((a, b) => b.percent - a.percent);

    const budgetedIds = new Set(categoryEntries.map((entry) => entry.categoryId));
    const unbudgeted = doc.categories
      .filter((category) => category.type === "expense" && !budgetedIds.has(category.id))
      .map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        spent: data.roundMoney(
          transactions
            .filter(
              (transaction) =>
                transaction.type === "expense" &&
                transaction.date.slice(0, 7) === month &&
                transaction.categoryId === category.id
            )
            .reduce((total, transaction) => total + (Number(transaction.amount) || 0), 0)
        ),
      }))
      .sort((a, b) => b.spent - a.spent);

    return {
      month,
      total: {
        id: overall.id,
        amount: totalAmount,
        spent: data.roundMoney(totalSpent),
        remaining: data.roundMoney(totalAmount - totalSpent),
        percent: data.roundMoney(totalPercent),
        progress: Math.min(100, Math.max(0, totalPercent)),
        status: statusFor(totalSpent, totalAmount),
      },
      categories: categoryBudgets,
      unbudgeted,
    };
  }

  /* ------------------------------------------------------------------------
     Transactions
     ------------------------------------------------------------------------ */
  const transactions = {
    async query(filters) {
      const doc = await loadDoc();
      const settings = filters || {};
      let rows = doc.transactions.slice();
      rows = rows.filter((transaction) => inRange(transaction, settings.from, settings.to));
      if (settings.type && settings.type !== "all") {
        rows = rows.filter((transaction) => transaction.type === settings.type);
      }
      if (settings.categoryId && settings.categoryId !== "all") {
        rows = rows.filter((transaction) => transaction.categoryId === settings.categoryId);
      }
      if (settings.recurringOnly) rows = rows.filter((transaction) => transaction.recurring);
      rows = dsa.searchTransactions(rows, settings.search);
      rows = dsa.sortTransactions(rows, settings.sort || "date-desc");
      return rows;
    },

    async get(id) {
      const doc = await loadDoc();
      const found = doc.transactions.find((transaction) => transaction.id === id);
      return found ? data.clone(found) : null;
    },

    async create(payload) {
      const doc = await loadDoc();
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new FinanceError("Enter an amount greater than zero.", "amount", "INVALID_AMOUNT");
      }
      const category = doc.categories.find((item) => item.id === payload.categoryId);
      if (!category) {
        throw new FinanceError("Choose a category for this transaction.", "categoryId", "INVALID_CATEGORY");
      }
      const date = dates.formatInput(payload.date) || today();
      if (!dates.parseISO(date)) {
        throw new FinanceError("Choose a valid date.", "date", "INVALID_DATE");
      }
      const now = new Date().toISOString();
      const transaction = {
        id: data.randomId("tx"),
        type: payload.type === "income" ? "income" : "expense",
        amount: data.roundMoney(amount),
        categoryId: category.id,
        date,
        merchant: String(payload.merchant || payload.note || category.name).trim().slice(0, 90),
        note: String(payload.note || "").trim().slice(0, 240),
        method: String(payload.method || "UPI"),
        recurring: Boolean(payload.recurring),
        createdAt: now,
        updatedAt: now,
      };
      doc.transactions.push(transaction);
      if (transaction.recurring && payload.queueNext !== false) {
        doc.state.recurringQueue.push({
          id: data.randomId("rec"),
          transactionId: transaction.id,
          payload: {
            type: transaction.type,
            amount: transaction.amount,
            categoryId: transaction.categoryId,
            merchant: transaction.merchant,
            note: transaction.note,
            method: transaction.method,
            recurring: true,
          },
          nextDate: advanceMonth(transaction.date),
        });
      }
      commit(doc);
      return data.clone(transaction);
    },

    async update(id, payload) {
      const doc = await loadDoc();
      const index = doc.transactions.findIndex((transaction) => transaction.id === id);
      if (index < 0) throw new FinanceError("That transaction no longer exists.", null, "NOT_FOUND");
      const existing = doc.transactions[index];
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new FinanceError("Enter an amount greater than zero.", "amount", "INVALID_AMOUNT");
      }
      const category = doc.categories.find((item) => item.id === payload.categoryId);
      if (!category) {
        throw new FinanceError("Choose a category for this transaction.", "categoryId", "INVALID_CATEGORY");
      }
      const date = dates.formatInput(payload.date) || existing.date;
      if (!dates.parseISO(date)) {
        throw new FinanceError("Choose a valid date.", "date", "INVALID_DATE");
      }
      const updated = Object.assign({}, existing, {
        type: payload.type === "income" ? "income" : "expense",
        amount: data.roundMoney(amount),
        categoryId: category.id,
        date,
        merchant: String(payload.merchant || payload.note || category.name).trim().slice(0, 90),
        note: String(payload.note || "").trim().slice(0, 240),
        method: String(payload.method || existing.method || "UPI"),
        recurring: Boolean(payload.recurring),
        updatedAt: new Date().toISOString(),
      });
      doc.transactions[index] = updated;
      commit(doc);
      return data.clone(updated);
    },

    async remove(id) {
      const doc = await loadDoc();
      const index = doc.transactions.findIndex((transaction) => transaction.id === id);
      if (index < 0) throw new FinanceError("That transaction no longer exists.", null, "NOT_FOUND");
      const removed = doc.transactions.splice(index, 1)[0];
      doc.state.lastDeleted = [removed];
      doc.state.recurringQueue = doc.state.recurringQueue.filter((item) => item.transactionId !== id);
      commit(doc);
      return data.clone(removed);
    },

    async bulkRemove(ids) {
      const doc = await loadDoc();
      const wanted = new Set(ids || []);
      const removed = doc.transactions.filter((transaction) => wanted.has(transaction.id));
      if (!removed.length) return 0;
      doc.transactions = doc.transactions.filter((transaction) => !wanted.has(transaction.id));
      doc.state.lastDeleted = removed;
      doc.state.recurringQueue = doc.state.recurringQueue.filter((item) => !wanted.has(item.transactionId));
      commit(doc);
      return removed.length;
    },

    async clearAll() {
      const doc = await loadDoc();
      const count = doc.transactions.length;
      doc.state.lastDeleted = [];
      doc.transactions = [];
      doc.state.recurringQueue = [];
      commit(doc);
      return count;
    },

    async restoreLast() {
      const doc = await loadDoc();
      const items = doc.state.lastDeleted || [];
      if (!items.length) return 0;
      items.forEach((transaction) => {
        if (!doc.transactions.some((item) => item.id === transaction.id)) doc.transactions.push(transaction);
      });
      doc.state.lastDeleted = [];
      commit(doc);
      return items.length;
    },

    async undoCount() {
      const doc = await loadDoc();
      return (doc.state.lastDeleted || []).length;
    },

    async recurringInfo() {
      const doc = await loadDoc();
      const queue = doc.state.recurringQueue || [];
      const due = queue.filter((item) => item.nextDate <= today());
      return { total: queue.length, due: due.length, nextDate: queue.length ? queue[0].nextDate : null };
    },

    async processRecurring() {
      const doc = await loadDoc();
      const due = (doc.state.recurringQueue || []).filter((item) => item.nextDate <= today());
      if (!due.length) return 0;
      const now = new Date().toISOString();
      due.forEach((item) => {
        doc.transactions.push({
          id: data.randomId("tx"),
          type: item.payload.type,
          amount: data.roundMoney(item.payload.amount),
          categoryId: item.payload.categoryId,
          date: item.nextDate,
          merchant: item.payload.merchant || "Recurring transaction",
          note: item.payload.note || "Recurring",
          method: item.payload.method || "Auto-debit",
          recurring: true,
          createdAt: now,
          updatedAt: now,
        });
        item.nextDate = advanceMonth(item.nextDate);
      });
      commit(doc);
      return due.length;
    },
  };

  /* ------------------------------------------------------------------------
     Categories
     ------------------------------------------------------------------------ */
  const categories = {
    async list(type) {
      const doc = await loadDoc();
      return doc.categories
        .filter((category) => !type || type === "all" || category.type === type)
        .map((category) => data.clone(category))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async create(payload) {
      const doc = await loadDoc();
      const name = String(payload.name || "").trim();
      const type = payload.type === "income" ? "income" : "expense";
      if (name.length < 2) throw new FinanceError("Use at least 2 characters for the category name.", "name");
      if (name.length > 32) throw new FinanceError("Keep the category name under 32 characters.", "name");
      if (
        doc.categories.some(
          (category) => category.type === type && category.name.toLowerCase() === name.toLowerCase()
        )
      ) {
        throw new FinanceError("A category with this name already exists.", "name", "DUPLICATE_CATEGORY");
      }
      const category = {
        id: data.randomId("cat"),
        name,
        type,
        color: payload.color || "#6366f1",
        icon: payload.icon || "tag",
        system: false,
      };
      doc.categories.push(category);
      commit(doc);
      return data.clone(category);
    },

    async update(id, payload) {
      const doc = await loadDoc();
      const category = doc.categories.find((item) => item.id === id);
      if (!category) throw new FinanceError("That category no longer exists.", null, "NOT_FOUND");
      const name = String(payload.name == null ? category.name : payload.name).trim();
      if (name.length < 2) throw new FinanceError("Use at least 2 characters for the category name.", "name");
      if (name.length > 32) throw new FinanceError("Keep the category name under 32 characters.", "name");
      if (
        doc.categories.some(
          (item) =>
            item.id !== category.id &&
            item.type === category.type &&
            item.name.toLowerCase() === name.toLowerCase()
        )
      ) {
        throw new FinanceError("A category with this name already exists.", "name", "DUPLICATE_CATEGORY");
      }
      category.name = name;
      if (payload.color) category.color = payload.color;
      if (payload.icon) category.icon = payload.icon;
      commit(doc);
      return data.clone(category);
    },

    async remove(id) {
      const doc = await loadDoc();
      const category = doc.categories.find((item) => item.id === id);
      if (!category) throw new FinanceError("That category no longer exists.", null, "NOT_FOUND");
      if (category.system) {
        throw new FinanceError(
          "This category cannot be deleted. Rename or recolour it instead.",
          null,
          "SYSTEM_CATEGORY"
        );
      }
      const usage = doc.transactions.filter((transaction) => transaction.categoryId === id).length;
      const budgetUsage = doc.budgets.filter((budget) => budget.categoryId === id).length;
      if (usage > 0 || budgetUsage > 0) {
        throw new FinanceError(
          `This category is used by ${usage} transaction${usage === 1 ? "" : "s"} and ${budgetUsage} budget${budgetUsage === 1 ? "" : "s"}. Move those entries first.`,
          null,
          "CATEGORY_IN_USE"
        );
      }
      doc.categories = doc.categories.filter((item) => item.id !== id);
      commit(doc);
      return true;
    },

    async usage() {
      const doc = await loadDoc();
      const counts = {};
      doc.transactions.forEach((transaction) => {
        counts[transaction.categoryId] = (counts[transaction.categoryId] || 0) + 1;
      });
      return counts;
    },
  };

  /* ------------------------------------------------------------------------
     Budgets
     ------------------------------------------------------------------------ */
  const budgets = {
    async forMonth(month) {
      const doc = await loadDoc();
      const key = dates.monthKey(month) || dates.currentMonth();
      return buildBudget(doc, key, categoryMap(doc), doc.transactions);
    },

    async save(payload) {
      const doc = await loadDoc();
      const month = dates.monthKey(payload.month) || dates.currentMonth();
      const categoryId = payload.categoryId || null;
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new FinanceError("Enter a budget amount of zero or more.", "amount", "INVALID_AMOUNT");
      }
      const existing = doc.budgets.find(
        (entry) => entry.month === month && (entry.categoryId || null) === categoryId
      );
      if (existing) {
        existing.amount = data.roundMoney(amount);
      } else if (amount > 0) {
        doc.budgets.push({
          id: data.randomId("bud"),
          month,
          categoryId,
          amount: data.roundMoney(amount),
        });
      }
      commit(doc);
      return buildBudget(doc, month, categoryMap(doc), doc.transactions);
    },

    async remove(id) {
      const doc = await loadDoc();
      doc.budgets = doc.budgets.filter((entry) => entry.id !== id);
      commit(doc);
      return true;
    },

    async copyPrevious(month) {
      const doc = await loadDoc();
      const target = dates.monthKey(month) || dates.currentMonth();
      const source = dates.addMonths(target, -1);
      const previous = doc.budgets.filter((entry) => entry.month === source);
      let created = 0;
      previous.forEach((entry) => {
        const exists = doc.budgets.some(
          (item) => item.month === target && (item.categoryId || null) === (entry.categoryId || null)
        );
        if (!exists) {
          doc.budgets.push({
            id: data.randomId("bud"),
            month: target,
            categoryId: entry.categoryId,
            amount: entry.amount,
          });
          created += 1;
        }
      });
      if (created) commit(doc);
      return created;
    },

    async months() {
      const doc = await loadDoc();
      return Array.from(new Set(doc.budgets.map((entry) => entry.month))).sort().reverse();
    },
  };

  /* ------------------------------------------------------------------------
     Goals
     ------------------------------------------------------------------------ */
  const goals = {
    async list() {
      const doc = await loadDoc();
      return doc.goals
        .map((goal) => decorateGoal(goal))
        .sort((a, b) => {
          if (a.status !== b.status) {
            if (a.status === "completed") return 1;
            if (b.status === "completed") return -1;
          }
          return String(a.deadline).localeCompare(String(b.deadline));
        });
    },

    async create(payload) {
      const doc = await loadDoc();
      const name = String(payload.name || "").trim();
      const target = Number(payload.target);
      const saved = Number(payload.saved) || 0;
      if (name.length < 2) throw new FinanceError("Give your goal a name.", "name");
      if (name.length > 42) throw new FinanceError("Keep the goal name under 42 characters.", "name");
      if (!Number.isFinite(target) || target <= 0) {
        throw new FinanceError("Enter a target greater than zero.", "target", "INVALID_TARGET");
      }
      if (!Number.isFinite(saved) || saved < 0) {
        throw new FinanceError("Starting saved amount cannot be negative.", "saved", "INVALID_AMOUNT");
      }
      const deadline = dates.formatInput(payload.deadline);
      if (!deadline || !dates.parseISO(deadline)) {
        throw new FinanceError("Pick a target date for this goal.", "deadline", "INVALID_DATE");
      }
      const now = new Date().toISOString();
      const goal = {
        id: data.randomId("goal"),
        name,
        target: data.roundMoney(target),
        saved: data.roundMoney(saved),
        deadline,
        color: payload.color || "#6366f1",
        icon: payload.icon || "target",
        note: String(payload.note || "").trim().slice(0, 200),
        createdAt: now,
        updatedAt: now,
        contributions: saved > 0
          ? [{ id: data.randomId("con"), amount: data.roundMoney(saved), date: today(), note: "Starting amount" }]
          : [],
      };
      doc.goals.push(goal);
      commit(doc);
      return decorateGoal(goal);
    },

    async update(id, payload) {
      const doc = await loadDoc();
      const goal = doc.goals.find((item) => item.id === id);
      if (!goal) throw new FinanceError("That goal no longer exists.", null, "NOT_FOUND");
      const name = String(payload.name == null ? goal.name : payload.name).trim();
      const target = Number(payload.target == null ? goal.target : payload.target);
      if (name.length < 2) throw new FinanceError("Give your goal a name.", "name");
      if (name.length > 42) throw new FinanceError("Keep the goal name under 42 characters.", "name");
      if (!Number.isFinite(target) || target <= 0) {
        throw new FinanceError("Enter a target greater than zero.", "target", "INVALID_TARGET");
      }
      const deadline = dates.formatInput(payload.deadline == null ? goal.deadline : payload.deadline);
      if (!deadline || !dates.parseISO(deadline)) {
        throw new FinanceError("Pick a target date for this goal.", "deadline", "INVALID_DATE");
      }
      goal.name = name;
      goal.target = data.roundMoney(target);
      goal.deadline = deadline;
      if (payload.color) goal.color = payload.color;
      if (payload.icon) goal.icon = payload.icon;
      if (payload.note != null) goal.note = String(payload.note).trim().slice(0, 200);
      goal.updatedAt = new Date().toISOString();
      commit(doc);
      return decorateGoal(goal);
    },

    async contribute(id, payload) {
      const doc = await loadDoc();
      const goal = doc.goals.find((item) => item.id === id);
      if (!goal) throw new FinanceError("That goal no longer exists.", null, "NOT_FOUND");
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new FinanceError("Enter a contribution greater than zero.", "amount", "INVALID_AMOUNT");
      }
      const entry = {
        id: data.randomId("con"),
        amount: data.roundMoney(amount),
        date: dates.formatInput(payload.date) || today(),
        note: String(payload.note || "Contribution").trim().slice(0, 120),
      };
      goal.saved = data.roundMoney((Number(goal.saved) || 0) + entry.amount);
      goal.contributions = Array.isArray(goal.contributions) ? goal.contributions : [];
      goal.contributions.push(entry);
      goal.updatedAt = new Date().toISOString();
      commit(doc);
      return decorateGoal(goal);
    },

    async remove(id) {
      const doc = await loadDoc();
      const before = doc.goals.length;
      doc.goals = doc.goals.filter((goal) => goal.id !== id);
      if (doc.goals.length === before) {
        throw new FinanceError("That goal no longer exists.", null, "NOT_FOUND");
      }
      commit(doc);
      return true;
    },

    async summary() {
      const list = await goals.list();
      const active = list.filter((goal) => goal.status !== "completed");
      return {
        count: list.length,
        active: active.length,
        completed: list.filter((goal) => goal.status === "completed").length,
        target: data.roundMoney(list.reduce((total, goal) => total + goal.target, 0)),
        saved: data.roundMoney(list.reduce((total, goal) => total + goal.saved, 0)),
        remaining: data.roundMoney(list.reduce((total, goal) => total + goal.remaining, 0)),
        monthlyNeeded: data.roundMoney(
          active.reduce((total, goal) => total + goal.monthlyNeeded, 0)
        ),
        goals: list,
      };
    },
  };

  /* ------------------------------------------------------------------------
     Reports
     ------------------------------------------------------------------------ */
  const reports = {
    async overview(range) {
      const doc = await loadDoc();
      const rows = doc.transactions.filter((transaction) =>
        inRange(transaction, range && range.from, range && range.to)
      );
      const summary = summarize(rows);
      const days =
        range && range.from && range.to
          ? Math.max(1, dates.daysBetween(range.from, range.to) + 1)
          : Math.max(1, summary.activeDays);
      return Object.assign({}, summary, {
        avgDaily: data.roundMoney(summary.expense / days),
        avgTransaction: summary.expenseCount
          ? data.roundMoney(summary.expense / summary.expenseCount)
          : 0,
        range: range || null,
      });
    },

    async byCategory(range) {
      const doc = await loadDoc();
      const categoriesById = categoryMap(doc);
      const rows = doc.transactions.filter(
        (transaction) =>
          transaction.type === "expense" && inRange(transaction, range && range.from, range && range.to)
      );
      const grouped = {};
      rows.forEach((transaction) => {
        const key = transaction.categoryId || "cat_other";
        if (!grouped[key]) grouped[key] = { categoryId: key, total: 0, count: 0 };
        grouped[key].total += Number(transaction.amount) || 0;
        grouped[key].count += 1;
      });
      const total = Object.values(grouped).reduce((sum, entry) => sum + entry.total, 0);
      return dsa
        .mergeSort(Object.values(grouped), (a, b) => b.total - a.total)
        .map((entry) => {
          const category = categoriesById[entry.categoryId] || {
            name: "Other",
            color: "#64748b",
            icon: "receipt",
          };
          return {
            categoryId: entry.categoryId,
            name: category.name,
            color: category.color,
            icon: category.icon,
            total: data.roundMoney(entry.total),
            count: entry.count,
            percent: total > 0 ? data.roundMoney((entry.total / total) * 100) : 0,
          };
        });
    },

    async trend(monthCount, endMonth) {
      const doc = await loadDoc();
      const months = dates.lastMonths(monthCount || 6, endMonth);
      return months.map((month) => {
        const range = dates.monthRange(month);
        const rows = doc.transactions.filter((transaction) => inRange(transaction, range.from, range.to));
        const summary = summarize(rows);
        return {
          month,
          label: dates.monthLabel(month, { short: true }),
          income: summary.income,
          expense: summary.expense,
          net: summary.net,
          savingsRate: summary.savingsRate,
          count: summary.count,
        };
      });
    },

    async topMerchants(range, limit) {
      const doc = await loadDoc();
      const rows = doc.transactions.filter(
        (transaction) =>
          transaction.type === "expense" && inRange(transaction, range && range.from, range && range.to)
      );
      const grouped = {};
      rows.forEach((transaction) => {
        const name = String(transaction.merchant || "Unknown").trim();
        const key = name.toLowerCase();
        if (!grouped[key]) grouped[key] = { name, total: 0, count: 0, lastDate: transaction.date };
        grouped[key].total += Number(transaction.amount) || 0;
        grouped[key].count += 1;
        if (transaction.date > grouped[key].lastDate) grouped[key].lastDate = transaction.date;
      });
      return dsa
        .mergeSort(Object.values(grouped), (a, b) => b.total - a.total)
        .slice(0, limit || 6)
        .map((entry) => Object.assign({}, entry, { total: data.roundMoney(entry.total) }));
    },

    async monthlyCounts() {
      const doc = await loadDoc();
      const counts = {};
      doc.transactions.forEach((transaction) => {
        const month = transaction.date.slice(0, 7);
        counts[month] = (counts[month] || 0) + 1;
      });
      return counts;
    },
  };

  /* ------------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------------ */
  const settings = {
    async get() {
      const doc = await loadDoc();
      return data.clone(doc.settings);
    },

    async update(patch) {
      const doc = await loadDoc();
      const next = Object.assign({}, doc.settings, patch || {});
      if (patch && patch.notifications) {
        next.notifications = Object.assign({}, doc.settings.notifications, patch.notifications);
      }
      if (!money.CURRENCIES[next.currency]) next.currency = "INR";
      next.monthStart = Math.min(28, Math.max(1, Number(next.monthStart) || 1));
      doc.settings = next;
      commit(doc);
      money.setCurrency(next.currency);
      money.setDateFormat(next.dateFormat || "DD MMM YYYY");
      return data.clone(next);
    },
  };

  /* ------------------------------------------------------------------------
     Notifications
     ------------------------------------------------------------------------ */
  const notifications = {
    async list() {
      const doc = await loadDoc();
      return buildNotifications(doc);
    },

    async markRead(id) {
      const doc = await loadDoc();
      if (!doc.state.readNotifications.includes(id)) {
        doc.state.readNotifications.push(id);
        commit(doc);
      }
      return true;
    },

    async markAllRead(ids) {
      const doc = await loadDoc();
      const target = ids && ids.length ? ids : buildNotifications(doc).map((item) => item.id);
      const merged = new Set([...(doc.state.readNotifications || []), ...target]);
      doc.state.readNotifications = Array.from(merged);
      commit(doc);
      return doc.state.readNotifications.length;
    },

    async dismiss(id) {
      const doc = await loadDoc();
      if (!doc.state.dismissedNotifications.includes(id)) {
        doc.state.dismissedNotifications.push(id);
      }
      doc.state.readNotifications = doc.state.readNotifications.filter((item) => item !== id);
      commit(doc);
      return true;
    },
  };

  /* ------------------------------------------------------------------------
     Export / import / reset
     ------------------------------------------------------------------------ */
  function csvEscape(value) {
    const text = String(value == null ? "" : value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  const backup = {
    async transactionsCsv(filters) {
      const doc = await loadDoc();
      const categoriesById = categoryMap(doc);
      const rows = dsa.sortTransactions(
        doc.transactions.filter((transaction) => inRange(transaction, filters && filters.from, filters && filters.to)),
        "date-asc"
      );
      const lines = [
        ["Date", "Type", "Category", "Description", "Merchant", "Payment method", "Amount", "Notes"].join(","),
      ];
      rows.forEach((transaction) => {
        const category = categoriesById[transaction.categoryId];
        lines.push(
          [
            transaction.date,
            transaction.type,
            category ? category.name : "Other",
            transaction.note || transaction.merchant || "",
            transaction.merchant || "",
            transaction.method || "",
            Number(transaction.amount).toFixed(2),
            transaction.note || "",
          ]
            .map(csvEscape)
            .join(",")
        );
      });
      return lines.join("\r\n");
    },

    async backupJson() {
      const doc = await loadDoc();
      return {
        app: "SmartSpend",
        format: "smartspend-backup",
        version: data.VERSION,
        exportedAt: new Date().toISOString(),
        data: data.clone(doc),
      };
    },

    async importJson(payload) {
      const source = payload && payload.data ? payload.data : payload;
      if (!source || !Array.isArray(source.transactions) || !Array.isArray(source.categories)) {
        throw new FinanceError(
          "This file is not a SmartSpend backup. Choose a JSON backup exported from Settings.",
          null,
          "INVALID_BACKUP"
        );
      }
      const doc = await loadDoc();
      const incoming = data.clone(source);
      if (!incoming.categories.length && incoming.transactions.length) {
        throw new FinanceError("The backup has no categories for its transactions.", null, "INVALID_BACKUP");
      }
      doc.categories = incoming.categories;
      doc.transactions = incoming.transactions.filter(
        (transaction) => transaction && transaction.id && transaction.date && Number(transaction.amount) > 0
      );
      doc.budgets = Array.isArray(incoming.budgets) ? incoming.budgets : [];
      doc.goals = Array.isArray(incoming.goals) ? incoming.goals : [];
      if (incoming.settings) {
        doc.settings = Object.assign({}, doc.settings, incoming.settings, {
          notifications: Object.assign(
            {},
            doc.settings.notifications,
            incoming.settings.notifications || {}
          ),
        });
        money.setCurrency(doc.settings.currency || "INR");
      }
      if (incoming.state) {
        doc.state = Object.assign({}, doc.state, incoming.state);
      }
      commit(doc);
      return {
        transactions: doc.transactions.length,
        categories: doc.categories.length,
        goals: doc.goals.length,
      };
    },

    async usage() {
      const id = await userId();
      const doc = await loadDoc();
      return {
        bytes: data.usage(id),
        transactions: doc.transactions.length,
        categories: doc.categories.length,
        budgets: doc.budgets.length,
        goals: doc.goals.length,
      };
    },
  };

  const mockAdapter = {
    transactions,
    categories,
    budgets,
    goals,
    reports,
    settings,
    notifications,
    backup,
    async getOverview(month) {
      const doc = await loadDoc();
      const key = dates.monthKey(month) || dates.currentMonth();
      const range = dates.monthRange(key);
      const rows = doc.transactions.filter((transaction) => inRange(transaction, range.from, range.to));
      return {
        summary: summarize(rows),
        budget: buildBudget(doc, key, categoryMap(doc), doc.transactions),
        recent: dsa.sortTransactions(rows, "date-desc").slice(0, 5),
      };
    },
  };

  /* ------------------------------------------------------------------------
     Java + SQLite REST adapter
     The backend stores money as integer cents and returns the same object
     shapes as the offline store, so screens stay adapter-agnostic.
     ------------------------------------------------------------------------ */
  function isMockData() {
    return Boolean(SS.config.useMockData);
  }

  function queryString(params) {
    const parts = [];
    Object.keys(params || {}).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null || value === "" || value === "all" || value === false) {
        return;
      }
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value === true ? "true" : value)}`);
    });
    return parts.length ? `?${parts.join("&")}` : "";
  }

  function notifyChanged() {
    document.dispatchEvent(new CustomEvent("ss:data-changed"));
  }

  async function request(path, options) {
    const settings = Object.assign({ method: "GET", body: null }, options || {});
    let response;
    try {
      response = await window.fetch(`${SS.config.apiBaseUrl}${path}`, {
        method: settings.method,
        headers: Object.assign(
          { Accept: "application/json" },
          settings.body === null ? {} : { "Content-Type": "application/json" }
        ),
        credentials: "same-origin",
        body: settings.body === null ? undefined : JSON.stringify(settings.body),
      });
    } catch (error) {
      throw new FinanceError(
        "Cannot reach the SmartSpend server. Make sure the backend is running and try again.",
        null,
        "NETWORK_ERROR"
      );
    }

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      const message =
        (data && (data.message || data.error)) ||
        (response.status === 401
          ? "Your session has expired. Please sign in again."
          : "Something went wrong. Please try again.");
      throw new FinanceError(
        message,
        data && data.field,
        (data && data.code) || `HTTP_${response.status}`
      );
    }

    return data;
  }

  async function requestText(path) {
    let response;
    try {
      response = await window.fetch(`${SS.config.apiBaseUrl}${path}`, {
        method: "GET",
        headers: { Accept: "text/csv, text/plain, */*" },
        credentials: "same-origin",
      });
    } catch (error) {
      throw new FinanceError(
        "Cannot reach the SmartSpend server. Make sure the backend is running and try again.",
        null,
        "NETWORK_ERROR"
      );
    }
    if (!response.ok) {
      let message = "Could not build that export. Please try again.";
      try {
        const data = await response.json();
        message = (data && (data.message || data.error)) || message;
      } catch (error) {
        /* The error body was not JSON; keep the generic message. */
      }
      throw new FinanceError(message, null, `HTTP_${response.status}`);
    }
    return response.text();
  }

  function unwrap(key, payload) {
    if (payload && Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
    return payload;
  }

  function mutate(path, options, key) {
    return request(path, options).then((payload) => {
      notifyChanged();
      return key ? unwrap(key, payload) : payload;
    });
  }

  const remote = {
    transactions: {
      query(filters) {
        const settings = filters || {};
        const suffix = queryString({
          from: settings.from,
          to: settings.to,
          type: settings.type,
          categoryId: settings.categoryId,
          recurringOnly: settings.recurringOnly ? "true" : "",
          search: settings.search,
          sort: settings.sort || "date-desc",
        });
        return request(`/transactions${suffix}`).then((data) => unwrap("transactions", data));
      },
      get(id) {
        return request(`/transactions/${encodeURIComponent(id)}`).then((data) =>
          unwrap("transaction", data)
        );
      },
      create(payload) {
        return mutate("/transactions", { method: "POST", body: payload }, "transaction");
      },
      update(id, payload) {
        return mutate(
          `/transactions/${encodeURIComponent(id)}`,
          { method: "PATCH", body: payload },
          "transaction"
        );
      },
      remove(id) {
        return mutate(
          `/transactions/${encodeURIComponent(id)}`,
          { method: "DELETE" },
          "transaction"
        );
      },
      bulkRemove(ids) {
        return mutate(
          "/transactions/bulk-delete",
          { method: "POST", body: { ids: ids || [] } },
          "removed"
        );
      },
      clearAll() {
        return mutate("/transactions", { method: "DELETE" }, "removed");
      },
      restoreLast() {
        return mutate("/transactions/restore-last", { method: "POST" }, "restored");
      },
      undoCount() {
        return request("/transactions/undo-count").then((data) => unwrap("count", data));
      },
      recurringInfo() {
        return request("/transactions/recurring-info");
      },
      processRecurring() {
        return mutate("/transactions/process-recurring", { method: "POST" }, "posted");
      },
    },

    categories: {
      list(type) {
        return request(`/categories${queryString({ type: type })}`).then((data) =>
          unwrap("categories", data)
        );
      },
      create(payload) {
        return mutate("/categories", { method: "POST", body: payload }, "category");
      },
      update(id, payload) {
        return mutate(
          `/categories/${encodeURIComponent(id)}`,
          { method: "PATCH", body: payload },
          "category"
        );
      },
      remove(id) {
        return mutate(`/categories/${encodeURIComponent(id)}`, { method: "DELETE" }, null).then(
          () => true
        );
      },
      usage() {
        return request("/categories/usage");
      },
    },

    budgets: {
      forMonth(month) {
        return request(`/budgets${queryString({ month: month })}`).then((data) =>
          unwrap("budget", data)
        );
      },
      save(payload) {
        return mutate("/budgets", { method: "POST", body: payload }, "budget");
      },
      remove(id) {
        return mutate(`/budgets/${encodeURIComponent(id)}`, { method: "DELETE" }, null).then(
          () => true
        );
      },
      copyPrevious(month) {
        return mutate(
          "/budgets/copy-previous",
          { method: "POST", body: { month: month } },
          "created"
        );
      },
      months() {
        return request("/budgets/months").then((data) => unwrap("months", data));
      },
    },

    goals: {
      list() {
        return request("/goals").then((data) => unwrap("goals", data));
      },
      create(payload) {
        return mutate("/goals", { method: "POST", body: payload }, "goal");
      },
      update(id, payload) {
        return mutate(
          `/goals/${encodeURIComponent(id)}`,
          { method: "PATCH", body: payload },
          "goal"
        );
      },
      contribute(id, payload) {
        return mutate(
          `/goals/${encodeURIComponent(id)}/contributions`,
          { method: "POST", body: payload },
          "goal"
        );
      },
      remove(id) {
        return mutate(`/goals/${encodeURIComponent(id)}`, { method: "DELETE" }, null).then(
          () => true
        );
      },
      summary() {
        return request("/goals/summary");
      },
    },

    reports: {
      overview(range) {
        const filters = range || {};
        return request(
          `/reports/overview${queryString({ from: filters.from, to: filters.to })}`
        ).then((data) => unwrap("overview", data));
      },
      byCategory(range) {
        const filters = range || {};
        return request(
          `/reports/by-category${queryString({ from: filters.from, to: filters.to })}`
        ).then((data) => unwrap("categories", data));
      },
      trend(monthCount, endMonth) {
        return request(
          `/reports/trend${queryString({ months: monthCount || 6, endMonth: endMonth })}`
        ).then((data) => unwrap("months", data));
      },
      topMerchants(range, limit) {
        const filters = range || {};
        return request(
          `/reports/top-merchants${queryString({
            from: filters.from,
            to: filters.to,
            limit: limit || 6,
          })}`
        ).then((data) => unwrap("merchants", data));
      },
      monthlyCounts() {
        return request("/reports/monthly-counts").then((data) => unwrap("counts", data));
      },
    },

    settings: {
      get() {
        return request("/settings").then((data) => unwrap("settings", data));
      },
      update(patch) {
        return mutate("/settings", { method: "PATCH", body: patch || {} }, "settings").then(
          (next) => {
            money.setCurrency(next.currency || "INR");
            money.setDateFormat(next.dateFormat || "DD MMM YYYY");
            return next;
          }
        );
      },
    },

    notifications: {
      list() {
        return request("/notifications").then((data) => unwrap("notifications", data));
      },
      markRead(id) {
        return mutate(
          `/notifications/${encodeURIComponent(id)}/read`,
          { method: "POST" },
          null
        ).then(() => true);
      },
      markAllRead(ids) {
        return mutate(
          "/notifications/read-all",
          { method: "POST", body: { ids: ids || [] } },
          "count"
        );
      },
      dismiss(id) {
        return mutate(
          `/notifications/${encodeURIComponent(id)}/dismiss`,
          { method: "POST" },
          null
        ).then(() => true);
      },
    },

    backup: {
      transactionsCsv(filters) {
        const settings = filters || {};
        return requestText(
          `/backup/transactions.csv${queryString({ from: settings.from, to: settings.to })}`
        );
      },
      backupJson() {
        return request("/backup/json");
      },
      importJson(payload) {
        return mutate("/backup/import", { method: "POST", body: payload }, null);
      },
      usage() {
        return request("/backup/usage");
      },
    },

    getOverview(month) {
      return request(`/overview${queryString({ month: month })}`);
    },
  };

  const adapter = isMockData() ? mockAdapter : remote;

  const api = {
    FinanceError,
    resetCache,
    summarize,
    isMockData,
    transactions: adapter.transactions,
    categories: adapter.categories,
    budgets: adapter.budgets,
    goals: adapter.goals,
    reports: adapter.reports,
    settings: adapter.settings,
    notifications: adapter.notifications,
    backup: adapter.backup,
    export: adapter.backup,
    getOverview: (month) => adapter.getOverview(month),
  };

  SS.finance = api;
})(window);
