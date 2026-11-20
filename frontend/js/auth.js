/* ==========================================================================
   SmartSpend · Route guards and session helpers
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});

  function go(path) {
    window.location.replace(path);
  }

  function safeNext(value, fallback) {
    const next = String(value || "").trim();
    if (!next) return fallback || SS.config.routes.dashboard;
    /* Only allow the app's own signed-in pages. This prevents an open
       redirect through ?next= while still supporting deep links. */
    const clean = next.split("?")[0].split("#")[0];
    const allowed = SS.config.pages || [];
    if (allowed.includes(clean)) {
      const suffix = next.slice(clean.length);
      return `${clean}${suffix}`;
    }
    return fallback || SS.config.routes.dashboard;
  }

  function setFlash(type, title, message) {
    SS.store.setFlash({ type, title, message });
  }

  async function getCurrentUser() {
    try {
      return await SS.api.getCurrentUser();
    } catch (error) {
      return null;
    }
  }

  async function requireAuth() {
    const user = await getCurrentUser();
    if (!user) {
      setFlash("warning", "Please sign in", "Your session has ended. Sign in to open your workspace.");
      go(SS.config.routes.login);
      return null;
    }
    return user;
  }

  async function redirectIfAuthenticated() {
    const user = await getCurrentUser();
    if (user) {
      go(SS.config.routes.dashboard);
      return true;
    }
    return false;
  }

  async function logout() {
    try {
      await SS.api.logout();
    } finally {
      setFlash("success", "Signed out", "You have been signed out safely.");
      go(SS.config.routes.login);
    }
  }

  function consumeFlash() {
    return SS.store.consumeFlash();
  }

  function loginUrl(next) {
    const target = next ? `?next=${encodeURIComponent(next)}` : "";
    return `${SS.config.routes.login}${target}`;
  }

  SS.auth = {
    go,
    safeNext,
    setFlash,
    getCurrentUser,
    requireAuth,
    redirectIfAuthenticated,
    logout,
    consumeFlash,
    loginUrl,
  };
})(window);
