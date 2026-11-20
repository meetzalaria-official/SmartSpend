/* ==========================================================================
   SmartSpend · Authentication API
   The pages call this facade only. Phase 8 uses the Java REST adapter; the
   offline browser adapter remains available for demos without a backend.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const validators = SS.validators;
  const store = SS.store;
  const crypto = SS.crypto;

  class AuthError extends Error {
    constructor(message, field, code) {
      super(message);
      this.name = "AuthError";
      this.field = field || null;
      this.code = code || "AUTH_ERROR";
    }
  }

  function isMock() {
    return Boolean(SS.config.useMockAuth);
  }

  function delay(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function startSession(userId, remember) {
    const created = new Date();
    const lifetime = remember
      ? SS.config.sessionDays * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;
    const session = {
      userId,
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + lifetime).toISOString(),
      remember: Boolean(remember),
    };
    store.setSession(session);
    return session;
  }

  function requireUser(user) {
    if (!user) {
      throw new AuthError("Please sign in to continue.", null, "UNAUTHENTICATED");
    }
    return user;
  }

  /* ------------------------------------------------------------------------
     Demo adapter
     ------------------------------------------------------------------------ */
  const mock = {
    async register(payload) {
      const fullName = validators.normalizeName(payload.fullName);
      const username = validators.normalizeUsername(payload.username);
      const email = validators.normalizeEmail(payload.email);
      const password = String(payload.password || "");
      const confirmPassword = String(payload.confirmPassword || "");

      await delay(320, 620);

      const nameError = validators.validateFullName(fullName);
      if (nameError) throw new AuthError(nameError, "fullName");

      const usernameError = validators.validateUsername(username);
      if (usernameError) throw new AuthError(usernameError, "username");

      const emailError = validators.validateEmail(email);
      if (emailError) throw new AuthError(emailError, "email");

      const passwordError = validators.validatePassword(password);
      if (passwordError) throw new AuthError(passwordError, "password");

      const confirmError = validators.validateConfirmation(password, confirmPassword);
      if (confirmError) throw new AuthError(confirmError, "confirmPassword");

      if (store.usernameExists(username)) {
        throw new AuthError("That username is already taken. Try another one.", "username", "DUPLICATE_USERNAME");
      }

      if (store.emailExists(email)) {
        throw new AuthError("An account with this email already exists.", "email", "DUPLICATE_EMAIL");
      }

      const passwordRecord = await crypto.createPasswordRecord(password);
      const timestamp = nowIso();
      const user = {
        id: crypto.randomId(),
        fullName,
        username,
        email,
        password: passwordRecord,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLoginAt: timestamp,
        passwordChangedAt: timestamp,
      };

      store.addUser(user);
      startSession(user.id, true);
      store.setLastIdentifier(user.email);
      return store.toPublicUser(user);
    },

    async login(payload) {
      const identifier = String(payload.identifier || "").trim();
      const password = String(payload.password || "");
      const remember = Boolean(payload.remember);

      await delay(280, 520);

      const identifierError = validators.validateLoginIdentifier(identifier);
      if (identifierError) throw new AuthError(identifierError, "identifier");

      const passwordError = validators.validateLoginPassword(password);
      if (passwordError) throw new AuthError(passwordError, "password");

      const user = store.findUserByIdentifier(identifier);
      const valid = user ? await crypto.verifyPassword(password, user.password) : false;

      if (!user || !valid) {
        throw new AuthError(
          "Incorrect username/email or password. Please try again.",
          null,
          "INVALID_CREDENTIALS"
        );
      }

      const timestamp = nowIso();
      const updated = store.updateUser(user.id, { lastLoginAt: timestamp });
      startSession(user.id, remember);
      store.setLastIdentifier(identifier);
      return store.toPublicUser(updated || user);
    },

    async logout() {
      await delay(80, 180);
      store.clearSession();
      return true;
    },

    async getCurrentUser() {
      const session = store.getStoredSession();
      if (!session) return null;
      if (store.isSessionExpired(session)) {
        store.clearSession();
        return null;
      }
      const user = store.findUserById(session.userId);
      if (!user) {
        store.clearSession();
        return null;
      }
      return store.toPublicUser(user);
    },

    async getSessionInfo() {
      const session = store.getStoredSession();
      if (!session || store.isSessionExpired(session)) return null;
      return {
        signedInAt: session.createdAt,
        expiresAt: session.expiresAt,
        remember: Boolean(session.remember),
      };
    },

    async updateProfile(payload) {
      const current = await mock.getCurrentUser();
      const user = requireUser(current);
      const fullName = validators.normalizeName(payload.fullName);
      const email = validators.normalizeEmail(payload.email);

      await delay(240, 460);

      const nameError = validators.validateFullName(fullName);
      if (nameError) throw new AuthError(nameError, "fullName");

      const emailError = validators.validateEmail(email);
      if (emailError) throw new AuthError(emailError, "email");

      if (store.emailExists(email, user.id)) {
        throw new AuthError("Another account is already using this email.", "email", "DUPLICATE_EMAIL");
      }

      const updated = store.updateUser(user.id, { fullName, email });
      if (email !== validators.normalizeEmail(user.email)) {
        store.setLastIdentifier(email);
      }
      return store.toPublicUser(updated);
    },

    async changePassword(payload) {
      const current = await mock.getCurrentUser();
      const user = requireUser(current);
      const stored = store.findUserById(user.id);
      const currentPassword = String(payload.currentPassword || "");
      const newPassword = String(payload.newPassword || "");
      const confirmPassword = String(payload.confirmPassword || "");

      await delay(260, 480);

      if (!currentPassword) {
        throw new AuthError("Enter your current password.", "currentPassword");
      }

      const currentValid = await crypto.verifyPassword(currentPassword, stored.password);
      if (!currentValid) {
        throw new AuthError("Your current password is incorrect.", "currentPassword", "INVALID_PASSWORD");
      }

      const passwordError = validators.validatePassword(newPassword);
      if (passwordError) throw new AuthError(passwordError, "newPassword");

      const confirmError = validators.validateConfirmation(newPassword, confirmPassword);
      if (confirmError) throw new AuthError(confirmError, "confirmPassword");

      if (newPassword === currentPassword) {
        throw new AuthError("Choose a password different from your current one.", "newPassword");
      }

      const passwordRecord = await crypto.createPasswordRecord(newPassword);
      const timestamp = nowIso();
      store.updateUser(user.id, {
        password: passwordRecord,
        passwordChangedAt: timestamp,
      });
      return { changedAt: timestamp };
    },

    async checkUsername(username) {
      const value = validators.normalizeUsername(username);
      const error = validators.validateUsername(value);
      if (error) return { available: false, message: error };
      await delay(160, 320);
      if (store.usernameExists(value)) {
        return { available: false, message: "That username is already taken." };
      }
      return { available: true, message: "Username is available." };
    },

    async checkEmail(email) {
      const value = validators.normalizeEmail(email);
      const error = validators.validateEmail(value);
      if (error) return { available: false, message: error };
      await delay(160, 320);
      if (store.emailExists(value)) {
        return { available: false, message: "An account with this email already exists." };
      }
      return { available: true, message: "Email is available." };
    },

    async loginDemo() {
      const demo = SS.config.demo;
      await delay(150, 280);

      let user = store.findUserByIdentifier(demo.email);
      if (!user) {
        const passwordRecord = await crypto.createPasswordRecord(demo.password);
        const timestamp = nowIso();
        user = {
          id: crypto.randomId(),
          fullName: demo.fullName,
          username: demo.username,
          email: demo.email,
          password: passwordRecord,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastLoginAt: timestamp,
          passwordChangedAt: timestamp,
          demo: true,
        };
        store.addUser(user);
      }

      try {
        return await mock.login({
          identifier: demo.email,
          password: demo.password,
          remember: true,
        });
      } catch (error) {
        /* A visitor may have changed the demo password. Restore demo access. */
        const record = await crypto.createPasswordRecord(demo.password);
        store.updateUser(user.id, {
          fullName: demo.fullName,
          password: record,
          passwordChangedAt: nowIso(),
        });
        return mock.login({
          identifier: demo.email,
          password: demo.password,
          remember: true,
        });
      }
    },
  };

  /* ------------------------------------------------------------------------
     Java REST adapter (Phase 8)
     ------------------------------------------------------------------------ */
  async function request(path, options) {
    const settings = Object.assign(
      {
        method: "GET",
        body: null,
        headers: {},
      },
      options || {}
    );

    const headers = Object.assign(
      { Accept: "application/json" },
      settings.body ? { "Content-Type": "application/json" } : {},
      settings.headers
    );

    let response;
    try {
      response = await window.fetch(`${SS.config.apiBaseUrl}${path}`, {
        method: settings.method,
        headers,
        credentials: "same-origin",
        body: settings.body ? JSON.stringify(settings.body) : undefined,
      });
    } catch (error) {
      throw new AuthError(
        "Cannot reach the Java server. Make sure the backend is running and try again.",
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
      throw new AuthError(message, data && data.field, (data && data.code) || `HTTP_${response.status}`);
    }

    return data;
  }

  function unwrapUser(data) {
    if (!data) return null;
    return data.user || data;
  }

  const remote = {
    register(payload) {
      return request("/auth/register", { method: "POST", body: payload }).then(unwrapUser);
    },
    login(payload) {
      return request("/auth/login", { method: "POST", body: payload }).then(unwrapUser);
    },
    async logout() {
      try {
        await request("/auth/logout", { method: "POST" });
      } catch (error) {
        if (error.code !== "HTTP_401") throw error;
      }
      return true;
    },
    async getCurrentUser() {
      try {
        const data = await request("/auth/me");
        return unwrapUser(data);
      } catch (error) {
        if (error.code === "HTTP_401" || error.code === "UNAUTHENTICATED") return null;
        throw error;
      }
    },
    async getSessionInfo() {
      try {
        const data = await request("/auth/session");
        return data && data.session ? data.session : null;
      } catch (error) {
        return null;
      }
    },
    updateProfile(payload) {
      return request("/users/me", { method: "PATCH", body: payload }).then(unwrapUser);
    },
    changePassword(payload) {
      return request("/auth/change-password", { method: "POST", body: payload });
    },
    checkUsername(username) {
      return request(`/auth/check-username?username=${encodeURIComponent(username)}`);
    },
    checkEmail(email) {
      return request(`/auth/check-email?email=${encodeURIComponent(email)}`);
    },
    loginDemo() {
      return request("/auth/demo", { method: "POST" }).then(unwrapUser);
    },
  };

  const adapter = isMock() ? mock : remote;

  SS.AuthError = AuthError;
  SS.api = {
    isMock,
    register: (payload) => adapter.register(payload),
    login: (payload) => adapter.login(payload),
    logout: () => adapter.logout(),
    getCurrentUser: () => adapter.getCurrentUser(),
    getSessionInfo: () => adapter.getSessionInfo(),
    updateProfile: (payload) => adapter.updateProfile(payload),
    changePassword: (payload) => adapter.changePassword(payload),
    checkUsername: (username) => adapter.checkUsername(username),
    checkEmail: (email) => adapter.checkEmail(email),
    loginDemo: () => adapter.loginDemo(),
  };
})(window);
