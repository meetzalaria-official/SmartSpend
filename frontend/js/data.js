/* ==========================================================================
   SmartSpend · Offline demo finance store
   Used when `useMockData` is enabled. It mirrors the SQLite schema so the live
   Java REST layer can replace it without changing any page controller.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const dates = SS.dates;

  const VERSION = 1;
  const KEY_PREFIX = "smartspend.finance.v1.";

  const COLORS = Object.freeze({
    orange: "#f97316",
    green: "#16a34a",
    indigo: "#6366f1",
    sky: "#0ea5e9",
    amber: "#eab308",
    pink: "#ec4899",
    violet: "#8b5cf6",
    red: "#ef4444",
    teal: "#14b8a6",
    purple: "#a855f7",
    slate: "#64748b",
    emerald: "#0f9d76",
    blue: "#2563eb",
    rose: "#f43f5e",
    lime: "#84cc16",
    cyan: "#06b6d4",
  });

  const DEFAULT_CATEGORIES = Object.freeze([
    { id: "cat_food", name: "Food & Dining", type: "expense", color: COLORS.orange, icon: "coffee", budget: 8000, system: true },
    { id: "cat_groceries", name: "Groceries", type: "expense", color: COLORS.green, icon: "shopping-bag", budget: 12000, system: true },
    { id: "cat_rent", name: "Rent & Housing", type: "expense", color: COLORS.indigo, icon: "home", budget: 22000, system: true },
    { id: "cat_transport", name: "Transport", type: "expense", color: COLORS.sky, icon: "car", budget: 3500, system: true },
    { id: "cat_utilities", name: "Utilities", type: "expense", color: COLORS.amber, icon: "zap", budget: 4500, system: true },
    { id: "cat_shopping", name: "Shopping", type: "expense", color: COLORS.pink, icon: "tag", budget: 6000, system: true },
    { id: "cat_entertainment", name: "Entertainment", type: "expense", color: COLORS.violet, icon: "play", budget: 3000, system: true },
    { id: "cat_health", name: "Health & Fitness", type: "expense", color: COLORS.red, icon: "heart", budget: 2500, system: true },
    { id: "cat_education", name: "Education", type: "expense", color: COLORS.teal, icon: "book", budget: 3000, system: true },
    { id: "cat_subscriptions", name: "Subscriptions", type: "expense", color: COLORS.purple, icon: "repeat", budget: 1500, system: true },
    { id: "cat_travel", name: "Travel", type: "expense", color: COLORS.lime, icon: "globe", budget: 5000, system: true },
    { id: "cat_other", name: "Other", type: "expense", color: COLORS.slate, icon: "receipt", budget: 2000, system: true },
    { id: "cat_salary", name: "Salary", type: "income", color: COLORS.emerald, icon: "briefcase", system: true },
    { id: "cat_freelance", name: "Freelance", type: "income", color: COLORS.blue, icon: "laptop", system: true },
    { id: "cat_investments", name: "Investments", type: "income", color: COLORS.amber, icon: "trending-up", system: true },
    { id: "cat_gifts", name: "Gifts", type: "income", color: COLORS.rose, icon: "gift", system: true },
    { id: "cat_income_other", name: "Other income", type: "income", color: COLORS.slate, icon: "wallet", system: true },
  ]);

  const ICON_CHOICES = Object.freeze([
    "coffee", "shopping-bag", "home", "car", "zap", "tag", "play", "heart",
    "book", "repeat", "globe", "receipt", "briefcase", "laptop", "trending-up",
    "gift", "wallet", "piggy-bank", "target", "star",
  ]);

  const COLOR_CHOICES = Object.freeze([
    COLORS.orange, COLORS.green, COLORS.indigo, COLORS.sky, COLORS.amber,
    COLORS.pink, COLORS.violet, COLORS.red, COLORS.teal, COLORS.purple,
    COLORS.emerald, COLORS.blue, COLORS.rose, COLORS.lime, COLORS.cyan, COLORS.slate,
  ]);

  const MERCHANTS = {
    cat_food: ["Swiggy", "Zomato", "Cafe Coffee Day", "Pizza Hut", "Chai Point", "Local Dhaba", "Domino's"],
    cat_groceries: ["BigBasket", "DMart", "Reliance Fresh", "Zepto", "Local Kirana", "Blinkit"],
    cat_rent: ["Landlord", "Society Maintenance"],
    cat_transport: ["Uber", "Ola", "Metro Card", "Rapido", "Indian Oil", "Auto Rickshaw"],
    cat_utilities: ["Airtel", "Jio", "BESCOM", "Water Board", "ACT Fibernet", "Gas Refill"],
    cat_shopping: ["Amazon", "Flipkart", "Myntra", "Decathlon", "Croma", "Nykaa"],
    cat_entertainment: ["BookMyShow", "PVR Cinemas", "Steam", "Gaming Zone", "Concert Tickets"],
    cat_health: ["Apollo Pharmacy", "Practo", "Cult.fit", "1mg", "Dental Clinic"],
    cat_education: ["Udemy", "Coursera", "Campus Books", "Stationery Mart", "Workshop Fee"],
    cat_subscriptions: ["Netflix", "Spotify", "Google One", "iCloud", "YouTube Premium"],
    cat_travel: ["IRCTC", "MakeMyTrip", "IndiGo", "OYO", "RedBus"],
    cat_other: ["ATM Withdrawal", "Miscellaneous", "Local Shop"],
    cat_salary: ["Acme Technologies"],
    cat_freelance: ["Design client", "Freelance project", "Consulting call"],
    cat_investments: ["Mutual fund dividend", "Bank interest", "Stock dividend"],
    cat_gifts: ["Family gift", "Birthday gift", "Cashback reward"],
    cat_income_other: ["Refund", "Reimbursement", "Other credit"],
  };

  const NOTES = {
    cat_food: ["Lunch with team", "Weekend dinner", "Coffee run", "Late-night order", "Family meal"],
    cat_groceries: ["Weekly groceries", "Monthly stock-up", "Fruit and vegetables", "Pantry refill"],
    cat_rent: ["Monthly rent", "Society charges"],
    cat_transport: ["Cab to office", "Weekend trip", "Fuel refill", "Metro recharge"],
    cat_utilities: ["Electricity bill", "Broadband bill", "Mobile recharge", "Gas cylinder"],
    cat_shopping: ["New shoes", "Home essentials", "Festive shopping", "Office wear"],
    cat_entertainment: ["Movie night", "Streaming plan", "Game purchase", "Weekend outing"],
    cat_health: ["Pharmacy", "Doctor visit", "Gym membership", "Health check-up"],
    cat_education: ["Online course", "Reference book", "Study material", "Certification"],
    cat_subscriptions: ["Monthly plan", "Annual plan", "Cloud storage"],
    cat_travel: ["Train tickets", "Flight booking", "Hotel stay", "Weekend getaway"],
    cat_other: ["Cash withdrawal", "Small purchase", "Unplanned expense"],
    cat_salary: ["Monthly salary"],
    cat_freelance: ["Project milestone", "Design retainer", "Consulting invoice"],
    cat_investments: ["Quarterly dividend", "Savings interest", "Portfolio return"],
    cat_gifts: ["Gift from family", "Festival gift", "Reward points"],
    cat_income_other: ["Refund credited", "Expense reimbursement", "Cashback"],
  };

  const PAYMENT_METHODS = ["UPI", "Card", "Cash", "Net Banking", "Auto-debit"];

  function hashString(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomId(prefix) {
    const body =
      window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID().replace(/-/g, "").slice(0, 14)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix || "id"}_${body}`;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function storageKey(userId) {
    return `${KEY_PREFIX}${userId}`;
  }

  function defaultSettings() {
    return {
      currency: "INR",
      dateFormat: "DD MMM YYYY",
      monthStart: 1,
      weekStart: "mon",
      theme: "light",
      profileNote: "",
      monthlyIncomeTarget: 0,
      notifications: {
        budgetAlerts: true,
        goalReminders: true,
        weeklyDigest: true,
        recurringReminders: true,
      },
    };
  }

  function createCategoryMap(categories) {
    const map = {};
    categories.forEach((category) => {
      map[category.id] = category;
    });
    return map;
  }

  /* ------------------------------------------------------------------------
     Seeding
     ------------------------------------------------------------------------ */
  function seedDoc(userId, fullName) {
    const random = mulberry32(hashString(String(userId || fullName || "smartspend")));
    const today = dates.todayISO();
    const todayDate = dates.parseISO(today);
    const current = dates.currentMonth();
    const categories = DEFAULT_CATEGORIES.map((category) => clone(category));
    const categoryMap = createCategoryMap(categories);
    const transactions = [];
    const now = new Date().toISOString();

    function money(min, max, step) {
      const raw = min + random() * (max - min);
      const unit = step || 1;
      return Math.max(unit, Math.round(raw / unit) * unit);
    }

    function pick(list) {
      return list[Math.floor(random() * list.length)];
    }

    function validDate(month, day) {
      const range = dates.monthRange(month);
      const last = Number(range.to.slice(8, 10));
      const date = `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
      if (date > today) return null;
      return date;
    }

    function addTransaction(payload) {
      if (!payload.date) return;
      const category = categoryMap[payload.categoryId] || categoryMap.cat_other;
      const note = payload.note || pick(NOTES[category.id] || NOTES.cat_other);
      transactions.push({
        id: randomId("tx"),
        type: payload.type || category.type,
        amount: roundMoney(payload.amount),
        categoryId: category.id,
        date: payload.date,
        merchant: payload.merchant || pick(MERCHANTS[category.id] || MERCHANTS.cat_other),
        note,
        method: payload.method || pick(PAYMENT_METHODS),
        recurring: Boolean(payload.recurring),
        createdAt: now,
        updatedAt: now,
      });
    }

    for (let offset = 7; offset >= 0; offset -= 1) {
      const month = dates.addMonths(current, -offset);
      const isCurrent = month === current;
      const incomeVariation = money(-2500, 4500, 500);

      addTransaction({
        categoryId: "cat_salary",
        date: validDate(month, 1 + Math.floor(random() * 3)),
        amount: 84000 + incomeVariation,
        merchant: "Acme Technologies",
        note: "Monthly salary",
        method: "Net Banking",
        recurring: true,
      });

      if (random() > 0.55) {
        addTransaction({
          categoryId: "cat_freelance",
          date: validDate(month, 10 + Math.floor(random() * 14)),
          amount: money(4500, 18000, 500),
          method: "UPI",
        });
      }

      if (random() > 0.7) {
        addTransaction({
          categoryId: "cat_investments",
          date: validDate(month, 15 + Math.floor(random() * 10)),
          amount: money(600, 3200, 100),
          method: "Net Banking",
        });
      }

      addTransaction({
        categoryId: "cat_rent",
        date: validDate(month, 3),
        amount: 22000,
        merchant: "Landlord",
        note: "Monthly rent",
        method: "Net Banking",
        recurring: true,
      });

      addTransaction({
        categoryId: "cat_utilities",
        date: validDate(month, 8),
        amount: money(1600, 3800, 50),
        merchant: "BESCOM",
        note: "Electricity bill",
        method: "UPI",
      });

      addTransaction({
        categoryId: "cat_utilities",
        date: validDate(month, 6),
        amount: money(799, 1499, 100),
        merchant: "Airtel",
        note: "Broadband bill",
        method: "Auto-debit",
        recurring: true,
      });

      addTransaction({
        categoryId: "cat_subscriptions",
        date: validDate(month, 5),
        amount: 649,
        merchant: "Netflix",
        note: "Monthly plan",
        method: "Auto-debit",
        recurring: true,
      });

      const groceryRuns = 4 + Math.floor(random() * 3);
      for (let index = 0; index < groceryRuns; index += 1) {
        addTransaction({
          categoryId: "cat_groceries",
          date: validDate(month, 2 + Math.floor(random() * 26)),
          amount: money(500, 3200, 50),
        });
      }

      const meals = 4 + Math.floor(random() * 4);
      for (let index = 0; index < meals; index += 1) {
        addTransaction({
          categoryId: "cat_food",
          date: validDate(month, 1 + Math.floor(random() * 27)),
          amount: money(180, 1800, 20),
        });
      }

      const rides = 2 + Math.floor(random() * 4);
      for (let index = 0; index < rides; index += 1) {
        addTransaction({
          categoryId: "cat_transport",
          date: validDate(month, 1 + Math.floor(random() * 27)),
          amount: money(80, 900, 10),
        });
      }

      const shoppingRuns = 1 + Math.floor(random() * 3);
      for (let index = 0; index < shoppingRuns; index += 1) {
        addTransaction({
          categoryId: "cat_shopping",
          date: validDate(month, 4 + Math.floor(random() * 24)),
          amount: money(600, 5500, 100),
        });
      }

      if (random() > 0.25) {
        addTransaction({
          categoryId: "cat_entertainment",
          date: validDate(month, 5 + Math.floor(random() * 22)),
          amount: money(250, 1600, 50),
        });
      }

      if (random() > 0.55) {
        addTransaction({
          categoryId: "cat_health",
          date: validDate(month, 8 + Math.floor(random() * 18)),
          amount: money(250, 2200, 50),
        });
      }

      if (random() > 0.6) {
        addTransaction({
          categoryId: "cat_education",
          date: validDate(month, 6 + Math.floor(random() * 18)),
          amount: money(400, 2600, 100),
        });
      }

      if (random() > 0.78) {
        addTransaction({
          categoryId: "cat_travel",
          date: validDate(month, 12 + Math.floor(random() * 14)),
          amount: money(1800, 9000, 100),
        });
      }

      if (isCurrent) {
        /* Make sure the current month starts with a few useful entries even
           when today is early in the month. */
        addTransaction({
          categoryId: "cat_food",
          date: today,
          amount: money(220, 780, 20),
          note: "Coffee and snack",
          method: "UPI",
        });
      }
    }

    transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const budgets = [];
    for (let offset = 2; offset >= 0; offset -= 1) {
      const month = dates.addMonths(current, -offset);
      budgets.push({
        id: randomId("bud"),
        month,
        categoryId: null,
        amount: 65000,
      });
      DEFAULT_CATEGORIES.filter((category) => category.type === "expense" && category.budget).forEach((category) => {
        budgets.push({
          id: randomId("bud"),
          month,
          categoryId: category.id,
          amount: category.budget,
        });
      });
    }

    const goalSeed = [
      { name: "Emergency fund", target: 200000, saved: 86000, months: 8, color: COLORS.emerald, icon: "shield" },
      { name: "Goa trip", target: 60000, saved: 22500, months: 4, color: COLORS.sky, icon: "globe" },
      { name: "New laptop", target: 120000, saved: 48000, months: 6, color: COLORS.violet, icon: "laptop" },
    ];

    const goals = goalSeed.map((goal) => {
      const deadlineRange = dates.monthRange(dates.addMonths(dates.currentMonth(), goal.months));
      const deadline = deadlineRange.to;
      const contributions = [
        {
          id: randomId("con"),
          amount: Math.round(goal.saved * 0.55),
          date: dates.addDays(today, -70),
          note: "Starting deposit",
        },
        {
          id: randomId("con"),
          amount: goal.saved - Math.round(goal.saved * 0.55),
          date: dates.addDays(today, -24),
          note: "Monthly transfer",
        },
      ].filter((item) => item.amount > 0);

      return {
        id: randomId("goal"),
        name: goal.name,
        target: goal.target,
        saved: goal.saved,
        deadline,
        color: goal.color,
        icon: goal.icon,
        note: "",
        createdAt: dates.addDays(today, -90),
        updatedAt: now,
        contributions,
      };
    });

    const notifications = [];

    return {
      version: VERSION,
      userId,
      seededAt: now,
      updatedAt: now,
      profile: { fullName: fullName || "SmartSpend user" },
      settings: defaultSettings(),
      categories,
      transactions,
      budgets,
      goals,
      notifications,
      state: {
        readNotifications: [],
        dismissedNotifications: [],
        lastDeleted: [],
        recurringQueue: [],
        createdAt: now,
      },
    };
  }

  /* ------------------------------------------------------------------------
     Load / save
     ------------------------------------------------------------------------ */
  function normalize(doc, userId, fullName) {
    const base = seedDoc(userId, fullName);
    const source = doc && typeof doc === "object" ? doc : {};
    const merged = Object.assign({}, base, source, {
      version: VERSION,
      userId,
      settings: Object.assign({}, base.settings, source.settings || {}, {
        notifications: Object.assign(
          {},
          base.settings.notifications,
          (source.settings && source.settings.notifications) || {}
        ),
      }),
      state: Object.assign({}, base.state, source.state || {}),
    });

    merged.categories = Array.isArray(source.categories) && source.categories.length
      ? source.categories.map((category) => Object.assign({}, category))
      : base.categories;
    merged.transactions = Array.isArray(source.transactions) ? source.transactions : base.transactions;
    merged.budgets = Array.isArray(source.budgets) ? source.budgets : base.budgets;
    merged.goals = Array.isArray(source.goals) ? source.goals : base.goals;
    merged.notifications = Array.isArray(source.notifications) ? source.notifications : [];
    merged.state.readNotifications = Array.isArray(merged.state.readNotifications) ? merged.state.readNotifications : [];
    merged.state.dismissedNotifications = Array.isArray(merged.state.dismissedNotifications) ? merged.state.dismissedNotifications : [];
    merged.state.lastDeleted = Array.isArray(merged.state.lastDeleted) ? merged.state.lastDeleted : [];
    merged.state.recurringQueue = Array.isArray(merged.state.recurringQueue) ? merged.state.recurringQueue : [];
    return merged;
  }

  function load(userId, fullName) {
    const key = storageKey(userId);
    let parsed = null;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) parsed = JSON.parse(raw);
    } catch (error) {
      parsed = null;
    }

    if (parsed && parsed.version === VERSION) return normalize(parsed, userId, fullName);

    const seeded = seedDoc(userId, fullName);
    save(userId, seeded);
    return seeded;
  }

  function save(userId, doc) {
    const payload = Object.assign({}, doc, { updatedAt: new Date().toISOString() });
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(payload));
      return payload;
    } catch (error) {
      throw new Error(
        "SmartSpend could not save your data. Free some browser storage or allow site data, then try again."
      );
    }
  }

  function reset(userId, fullName) {
    const seeded = seedDoc(userId, fullName);
    save(userId, seeded);
    return seeded;
  }

  function usage(userId) {
    try {
      const raw = window.localStorage.getItem(storageKey(userId)) || "";
      return raw.length;
    } catch (error) {
      return 0;
    }
  }

  SS.data = {
    VERSION,
    KEY_PREFIX,
    COLORS,
    COLOR_CHOICES,
    ICON_CHOICES,
    DEFAULT_CATEGORIES,
    PAYMENT_METHODS,
    MERCHANTS,
    storageKey,
    seedDoc,
    load,
    save,
    reset,
    usage,
    randomId,
    clone,
    roundMoney,
    createCategoryMap,
  };
})(window);
