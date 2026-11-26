/* ==========================================================================
   SmartSpend · Global configuration
   The live app runs the complete stack: vanilla UI + Java 17 REST API + SQLite.
   Both adapters stay isolated so the app can also run offline.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});

  SS.config = Object.freeze({
    appName: "SmartSpend",
    version: "3.0.0",

    /* The live app runs against the Java 17 + SQLite server. Set these to true to
       fall back to the offline browser adapter without a backend. */
    useMockAuth: false,
    useMockData: false,
    apiBaseUrl: "/api",

    /* Keep the offline adapter aligned with the Java backend. */
    pbkdf2Iterations: 210000,
    sessionDays: 7,
    minPasswordLength: 8,

    routes: Object.freeze({
      login: "login.html",
      register: "register.html",
      dashboard: "dashboard.html",
      transactions: "transactions.html",
      budgets: "budgets.html",
      goals: "goals.html",
      categories: "categories.html",
      reports: "reports.html",
      account: "account.html",
      settings: "settings.html",
    }),

    pages: Object.freeze([
      "dashboard.html",
      "transactions.html",
      "budgets.html",
      "goals.html",
      "categories.html",
      "reports.html",
      "account.html",
      "settings.html",
    ]),
  });
})(window);
