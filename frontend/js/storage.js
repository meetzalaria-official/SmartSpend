/* ==========================================================================
   SmartSpend · Offline demo store
   Used only when `useMockAuth` / `useMockData` are enabled. The Java + SQLite
   backend is the default storage for Phase 8. This store also keeps the theme,
   last identifier and one-shot flash messages for the live app.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});

  const KEYS = Object.freeze({
    users: "smartspend.users.v1",
    session: "smartspend.session.v1",
    theme: "smartspend.theme.v1",
    lastIdentifier: "smartspend.lastIdentifier.v1",
    flash: "smartspend.flash.v1",
  });

  function safeParse(raw, fallback) {
    if (raw == null) return fallback;
    try {
      const value = JSON.parse(raw);
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function readLocal(key, fallback) {
    try {
      return safeParse(window.localStorage.getItem(key), fallback);
    } catch (error) {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function removeLocal(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      /* Storage can be unavailable in private modes; the demo still works in-memory. */
    }
  }

  function readSessionStore(key, fallback) {
    try {
      return safeParse(window.sessionStorage.getItem(key), fallback);
    } catch (error) {
      return fallback;
    }
  }

  function writeSessionStore(key, value) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function removeSessionStore(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (error) {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------------------
     Users
     ------------------------------------------------------------------------ */
  function getUsers() {
    const users = readLocal(KEYS.users, []);
    return Array.isArray(users) ? users.filter(Boolean) : [];
  }

  function saveUsers(users) {
    if (!writeLocal(KEYS.users, users)) {
      throw new Error(
        "Local storage is unavailable. Please allow site data or use a normal browser window."
      );
    }
  }

  function addUser(user) {
    const users = getUsers();
    users.push(user);
    saveUsers(users);
    return user;
  }

  function updateUser(id, patch) {
    const users = getUsers();
    const index = users.findIndex((user) => user.id === id);
    if (index === -1) return null;
    users[index] = Object.assign({}, users[index], patch, { updatedAt: new Date().toISOString() });
    saveUsers(users);
    return users[index];
  }

  function findUserById(id) {
    return getUsers().find((user) => user.id === id) || null;
  }

  function findUserByIdentifier(identifier) {
    const value = String(identifier || "").trim().toLowerCase();
    if (!value) return null;
    return (
      getUsers().find(
        (user) =>
          String(user.username || "").toLowerCase() === value ||
          String(user.email || "").toLowerCase() === value
      ) || null
    );
  }

  function usernameExists(username, excludeId) {
    const value = String(username || "").trim().toLowerCase();
    return getUsers().some(
      (user) => user.id !== excludeId && String(user.username || "").toLowerCase() === value
    );
  }

  function emailExists(email, excludeId) {
    const value = String(email || "").trim().toLowerCase();
    return getUsers().some(
      (user) => user.id !== excludeId && String(user.email || "").toLowerCase() === value
    );
  }

  /* ------------------------------------------------------------------------
     Session
     ------------------------------------------------------------------------ */
  function getStoredSession() {
    const local = readLocal(KEYS.session, null);
    if (local) return local;
    return readSessionStore(KEYS.session, null);
  }

  function setSession(session) {
    clearSession();
    if (session.remember) {
      writeLocal(KEYS.session, session);
    } else {
      writeSessionStore(KEYS.session, session);
    }
  }

  function clearSession() {
    removeLocal(KEYS.session);
    removeSessionStore(KEYS.session);
  }

  function isSessionExpired(session) {
    if (!session || !session.expiresAt) return true;
    const expires = new Date(session.expiresAt).getTime();
    return !Number.isFinite(expires) || expires <= Date.now();
  }

  /* ------------------------------------------------------------------------
     Small preferences
     ------------------------------------------------------------------------ */
  function getTheme() {
    try {
      return window.localStorage.getItem(KEYS.theme) || "";
    } catch (error) {
      return "";
    }
  }

  function setTheme(theme) {
    try {
      window.localStorage.setItem(KEYS.theme, theme);
    } catch (error) {
      /* ignore */
    }
  }

  function getLastIdentifier() {
    try {
      return window.localStorage.getItem(KEYS.lastIdentifier) || "";
    } catch (error) {
      return "";
    }
  }

  function setLastIdentifier(identifier) {
    try {
      window.localStorage.setItem(KEYS.lastIdentifier, String(identifier || ""));
    } catch (error) {
      /* ignore */
    }
  }

  function setFlash(payload) {
    writeSessionStore(KEYS.flash, payload);
  }

  function consumeFlash() {
    const flash = readSessionStore(KEYS.flash, null);
    removeSessionStore(KEYS.flash);
    return flash;
  }

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  function toPublicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
    };
  }

  SS.store = {
    KEYS,
    getUsers,
    saveUsers,
    addUser,
    updateUser,
    findUserById,
    findUserByIdentifier,
    usernameExists,
    emailExists,
    getStoredSession,
    setSession,
    clearSession,
    isSessionExpired,
    getTheme,
    setTheme,
    getLastIdentifier,
    setLastIdentifier,
    setFlash,
    consumeFlash,
    toPublicUser,
  };
})(window);
