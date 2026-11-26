/* ==========================================================================
   SmartSpend · Offline finance store
   Used when `useMockData` is enabled. It mirrors the SQLite schema so the live
   Java REST layer can replace it without changing any page controller.

   New workspaces start completely empty. No sample transactions, budgets,
   goals or categories are created for an account.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});

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

  const PAYMENT_METHODS = ["UPI", "Card", "Cash", "Net Banking", "Auto-debit"];

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
     Blank workspace
     ------------------------------------------------------------------------ */
  function blankDoc(userId, fullName) {
    const now = new Date().toISOString();
    return {
      version: VERSION,
      userId,
      seededAt: now,
      updatedAt: now,
      profile: { fullName: fullName || "SmartSpend user" },
      settings: defaultSettings(),
      categories: [],
      transactions: [],
      budgets: [],
      goals: [],
      notifications: [],
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
    const base = blankDoc(userId, fullName);
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

    merged.categories = Array.isArray(source.categories)
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

    const fresh = blankDoc(userId, fullName);
    save(userId, fresh);
    return fresh;
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
    PAYMENT_METHODS,
    storageKey,
    load,
    save,
    usage,
    randomId,
    clone,
    roundMoney,
    createCategoryMap,
  };
})(window);
