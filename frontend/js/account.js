/* ==========================================================================
   SmartSpend · Account workspace
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const validators = SS.validators;
  const money = SS.money;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  ui.ready(async function () {
    const user = await SS.auth.requireAuth();
    if (!user) return;

    let currentUser = user;
    let sessionInfo = null;
    let notifications = [];

    try {
      const prefs = await SS.finance.settings.get();
      money.setCurrency(prefs.currency || "INR");
      money.setDateFormat(prefs.dateFormat || "DD MMM YYYY");
    } catch (error) {
      /* Preferences are optional on this page; defaults are safe. */
    }

    try {
      sessionInfo = await SS.api.getSessionInfo();
    } catch (error) {
      sessionInfo = null;
    }

    /* ----------------------------------------------------------------------
       Rendering
       ---------------------------------------------------------------------- */
    const FIELD_KEYS = {
      accountId: "id",
      memberSince: "createdAt",
      lastLogin: "lastLoginAt",
      passwordChanged: "passwordChangedAt",
    };

    const FIELD_FORMATTERS = {
      fullName: (value) => value || "—",
      username: (value) => (value ? `@${value}` : "—"),
      email: (value) => value || "—",
      accountId: (value) => ui.shortId(value),
      memberSince: (value) => ui.formatMonthYear(value),
      lastLogin: (value) => ui.formatDateTime(value),
      passwordChanged: (value) => ui.formatDate(value),
    };

    function renderUser() {
      ui.qsa("[data-user-field]").forEach((element) => {
        const field = element.getAttribute("data-user-field");
        const key = FIELD_KEYS[field] || field;
        const formatter = FIELD_FORMATTERS[field];
        const value = currentUser[key];
        element.textContent = formatter ? formatter(value) : value || "—";
      });

      ui.qsa("[data-user-initials]").forEach((element) => {
        element.textContent = ui.initials(currentUser.fullName);
      });

      ui.qsa("[data-user-first]").forEach((element) => {
        element.textContent = ui.firstName(currentUser.fullName);
      });

      ui.qsa("[data-greeting]").forEach((element) => {
        element.textContent = ui.greeting();
      });
    }

    function renderSession() {
      const signedIn = (sessionInfo && sessionInfo.signedInAt) || currentUser.lastLoginAt;
      const mode = sessionInfo
        ? sessionInfo.remember
          ? "Remembered on this device for 7 days"
          : "This browser session only"
        : "Active on this device";

      ui.qsa("[data-session-signed-in]").forEach((element) => {
        element.textContent = ui.formatDateTime(signedIn);
      });

      ui.qsa("[data-session-mode]").forEach((element) => {
        element.textContent = mode;
      });

      ui.qsa("[data-session-expires]").forEach((element) => {
        element.textContent =
          sessionInfo && sessionInfo.expiresAt
            ? `Until ${ui.formatDate(sessionInfo.expiresAt, { day: "numeric", month: "short" })}`
            : "Active";
      });
    }

    ui.qsa("[data-today]").forEach((element) => {
      element.textContent = ui.formatDate(new Date(), {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    });

    renderUser();
    renderSession();

    /* ----------------------------------------------------------------------
       Copy account id
       ---------------------------------------------------------------------- */
    ui.qsa("[data-copy-account-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const copied = await ui.copyText(currentUser.id);
        if (copied) {
          ui.toast.success("Account ID copied", "Paste it wherever you need it.");
        } else {
          ui.toast.error("Could not copy", "Your browser blocked clipboard access.");
        }
      });
    });

    /* ----------------------------------------------------------------------
       Popovers, quick add and notifications
       ---------------------------------------------------------------------- */
    ui.initPopover(document.getElementById("notifications-popover"));
    ui.initPopover(document.getElementById("user-popover"));

    function notificationHtml(item) {
      const tone = item.tone || "info";
      return `
        <div class="notif-item notif-item--${tone}${item.read ? "" : " is-unread"}" data-notif-id="${escapeHtml(
        item.id
      )}" data-notif-link="${escapeHtml(item.link || "")}" role="button" tabindex="0">
          <span class="notif-item__icon">
            <svg class="icon" aria-hidden="true"><use href="#i-${escapeHtml(item.icon || "bell")}"></use></svg>
          </span>
          <span class="notif-item__body">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.message)}</span>
            <small>${escapeHtml(ui.relativeTime(item.createdAt))}</small>
          </span>
          <button class="notif-item__dismiss" type="button" data-notif-dismiss="${escapeHtml(
            item.id
          )}" aria-label="Dismiss notification">
            <svg class="icon icon--sm" aria-hidden="true"><use href="#i-x"></use></svg>
          </button>
        </div>`;
    }

    function renderNotifications(items) {
      const list = document.getElementById("notif-list");
      const dot = document.getElementById("notif-dot");
      const summary = document.getElementById("notif-summary");
      if (!list) return;

      notifications = items;
      const unread = items.filter((item) => !item.read).length;
      if (dot) dot.hidden = unread === 0;
      if (summary) {
        summary.textContent = unread
          ? `${unread} unread notification${unread === 1 ? "" : "s"}`
          : "You are all caught up";
      }

      list.innerHTML = items.length
        ? items.slice(0, 12).map(notificationHtml).join("")
        : `<div class="notif-empty">
             <svg class="icon" aria-hidden="true"><use href="#i-bell"></use></svg>
             <strong>All quiet for now</strong>
             <span>Budget warnings, goal reminders and weekly digests appear here.</span>
           </div>`;

      list.querySelectorAll("[data-notif-id]").forEach((node) => {
        const open = () => {
          const id = node.getAttribute("data-notif-id");
          const link = node.getAttribute("data-notif-link");
          SS.finance.notifications.markRead(id).catch(() => {});
          if (link) window.location.href = link;
        };
        node.addEventListener("click", open);
        node.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open();
          }
        });
      });

      list.querySelectorAll("[data-notif-dismiss]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.stopPropagation();
          const id = button.getAttribute("data-notif-dismiss");
          await SS.finance.notifications.dismiss(id).catch(() => {});
          refreshNotifications();
        });
      });
    }

    async function refreshNotifications() {
      try {
        renderNotifications(await SS.finance.notifications.list());
      } catch (error) {
        renderNotifications([]);
      }
    }

    const markAll = document.getElementById("notif-mark-all");
    if (markAll) {
      markAll.addEventListener("click", async () => {
        await SS.finance.notifications.markAllRead(notifications.map((item) => item.id)).catch(() => {});
        await refreshNotifications();
        ui.toast.success("Notifications cleared", "Everything is marked as read.");
      });
    }

    const quickAddButton = document.querySelector("[data-account-quick-add]");
    if (quickAddButton) {
      quickAddButton.addEventListener("click", () => {
        if (!SS.tx) {
          ui.toast.error("Transaction form unavailable", "Reload the page and try again.");
          return;
        }
        SS.tx.open({
          onSaved: () => {
            ui.toast.info("Ledger updated", "Your dashboard and summaries are refreshing.");
            refreshNotifications();
          },
        });
      });
    }

    await refreshNotifications();

    document.addEventListener("keydown", (event) => {
      const tag = (event.target && event.target.tagName) || "";
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (event.target && event.target.isContentEditable);
      if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (quickAddButton) quickAddButton.click();
      }
    });

    /* ----------------------------------------------------------------------
       Sidebar navigation
       ---------------------------------------------------------------------- */
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");
    const sidebarToggle = document.getElementById("sidebar-toggle");
    const topbarSection = document.querySelector(".topbar__title strong");

    const SECTION_TITLES = {
      overview: "Overview",
      profile: "Profile",
      security: "Security",
    };

    function setActiveNav(name) {
      ui.qsa("[data-nav]").forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("data-nav") === name);
      });
      if (topbarSection) topbarSection.textContent = SECTION_TITLES[name] || "Overview";
    }

    function openSidebar() {
      sidebar.classList.add("is-open");
      sidebarOverlay.classList.add("is-open");
      sidebarToggle.setAttribute("aria-expanded", "true");
    }

    function closeSidebar() {
      sidebar.classList.remove("is-open");
      sidebarOverlay.classList.remove("is-open");
      sidebarToggle.setAttribute("aria-expanded", "false");
    }

    sidebarToggle.addEventListener("click", () => {
      if (sidebar.classList.contains("is-open")) closeSidebar();
      else openSidebar();
    });

    sidebarOverlay.addEventListener("click", closeSidebar);

    ui.qsa("[data-nav]").forEach((link) => {
      link.addEventListener("click", () => {
        setActiveNav(link.getAttribute("data-nav"));
        closeSidebar();
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSidebar();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) closeSidebar();
    });

    if ("IntersectionObserver" in window) {
      const sections = ["overview", "profile", "security"]
        .map((id) => document.getElementById(id))
        .filter(Boolean);
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) setActiveNav(entry.target.id);
          });
        },
        { rootMargin: "-28% 0px -62% 0px", threshold: 0 }
      );
      sections.forEach((section) => observer.observe(section));
    }

    /* ----------------------------------------------------------------------
       Logout
       ---------------------------------------------------------------------- */
    ui.qsa("[data-logout]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.dataset.busy === "true") return;
        button.dataset.busy = "true";
        button.disabled = true;
        await SS.auth.logout();
      });
    });

    /* ----------------------------------------------------------------------
       Edit profile dialog
       ---------------------------------------------------------------------- */
    const profileDialog = document.getElementById("profile-dialog");
    const profileForm = document.getElementById("profile-form");
    const profileName = document.getElementById("profile-name");
    const profileEmail = document.getElementById("profile-email");
    const profileUsername = document.getElementById("profile-username");
    const profileAlert = document.getElementById("profile-alert");
    const profileSave = document.getElementById("profile-save");
    const editProfileButton = document.getElementById("edit-profile-button");

    function openProfileDialog() {
      profileName.value = currentUser.fullName;
      profileEmail.value = currentUser.email;
      profileUsername.value = `@${currentUser.username}`;
      ui.hideAlert(profileAlert);
      ui.clearFieldState(profileName);
      ui.clearFieldState(profileEmail);
      ui.openDialog(profileDialog);
      window.setTimeout(() => profileName.focus(), 60);
    }

    editProfileButton.addEventListener("click", openProfileDialog);

    [profileName, profileEmail].forEach((input) => {
      input.addEventListener("input", () => {
        ui.hideAlert(profileAlert);
        if (input.getAttribute("aria-invalid") === "true") ui.clearFieldState(input);
      });
    });

    profileDialog.addEventListener("close", () => {
      ui.hideAlert(profileAlert);
      ui.setLoading(profileSave, false);
      ui.clearFieldState(profileName);
      ui.clearFieldState(profileEmail);
    });

    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      ui.hideAlert(profileAlert);

      const nameError = validators.validateFullName(profileName.value);
      const emailError = validators.validateEmail(profileEmail.value);

      if (nameError) ui.showFieldError(profileName, nameError);
      else ui.clearFieldError(profileName);

      if (emailError) ui.showFieldError(profileEmail, emailError);
      else ui.clearFieldError(profileEmail);

      if (nameError || emailError) {
        ui.shake(profileForm);
        ui.focusFirstInvalid(profileForm);
        return;
      }

      ui.setLoading(profileSave, true);
      try {
        const updated = await SS.api.updateProfile({
          fullName: profileName.value,
          email: profileEmail.value,
        });
        currentUser = Object.assign({}, currentUser, updated || {});
        renderUser();
        ui.closeDialog(profileDialog);
        ui.toast.success("Profile updated", "Your account details are up to date.");
      } catch (error) {
        if (error && error.field === "fullName") ui.showFieldError(profileName, error.message);
        if (error && error.field === "email") ui.showFieldError(profileEmail, error.message);
        ui.showAlert(
          profileAlert,
          "error",
          (error && error.message) || "We could not save your profile. Please try again.",
          "Could not save changes"
        );
        ui.shake(profileForm);
      } finally {
        ui.setLoading(profileSave, false);
      }
    });

    /* ----------------------------------------------------------------------
       Change password dialog
       ---------------------------------------------------------------------- */
    const passwordDialog = document.getElementById("password-dialog");
    const passwordForm = document.getElementById("password-form");
    const currentPassword = document.getElementById("current-password");
    const newPassword = document.getElementById("new-password");
    const confirmPassword = document.getElementById("confirm-password");
    const passwordStrength = document.getElementById("password-strength");
    const passwordRequirements = document.getElementById("password-requirements");
    const passwordAlert = document.getElementById("password-alert");
    const passwordSave = document.getElementById("password-save");
    const changePasswordButton = document.getElementById("change-password-button");

    let confirmPasswordTouched = false;

    function validateCurrentPassword(show) {
      if (!currentPassword.value) {
        if (show) ui.showFieldError(currentPassword, "Enter your current password.");
        return false;
      }
      if (show) ui.clearFieldError(currentPassword);
      return true;
    }

    function validateNewPassword(show) {
      const message = validators.validatePassword(newPassword.value);
      let error = message;
      if (!error && currentPassword.value && newPassword.value === currentPassword.value) {
        error = "Choose a password different from your current one.";
      }
      if (show) {
        if (error) ui.showFieldError(newPassword, error);
        else ui.clearFieldError(newPassword);
      }
      return !error;
    }

    function validateConfirmPassword(show) {
      const message = validators.validateConfirmation(newPassword.value, confirmPassword.value);
      if (show) {
        if (message) ui.showFieldError(confirmPassword, message);
        else {
          ui.clearFieldError(confirmPassword);
          if (confirmPassword.value) ui.markFieldValid(confirmPassword);
        }
      }
      return !message;
    }

    function resetPasswordDialog() {
      passwordForm.reset();
      confirmPasswordTouched = false;
      ui.hideAlert(passwordAlert);
      ui.clearFieldState(currentPassword);
      ui.clearFieldState(newPassword);
      ui.clearFieldState(confirmPassword);
      ui.updatePasswordStrength(newPassword, passwordStrength, passwordRequirements);
      ui.setLoading(passwordSave, false);
    }

    function openPasswordDialog() {
      resetPasswordDialog();
      ui.openDialog(passwordDialog);
      window.setTimeout(() => currentPassword.focus(), 60);
    }

    changePasswordButton.addEventListener("click", openPasswordDialog);

    currentPassword.addEventListener("input", () => {
      ui.hideAlert(passwordAlert);
      if (currentPassword.getAttribute("aria-invalid") === "true") ui.clearFieldState(currentPassword);
    });

    newPassword.addEventListener("input", () => {
      ui.hideAlert(passwordAlert);
      if (newPassword.getAttribute("aria-invalid") === "true") ui.clearFieldState(newPassword);
      ui.updatePasswordStrength(newPassword, passwordStrength, passwordRequirements);
      if (confirmPasswordTouched || confirmPassword.value) validateConfirmPassword(true);
    });

    confirmPassword.addEventListener("input", () => {
      confirmPasswordTouched = true;
      ui.hideAlert(passwordAlert);
      if (confirmPassword.getAttribute("aria-invalid") === "true") ui.clearFieldState(confirmPassword);
      if (confirmPassword.value) validateConfirmPassword(true);
    });

    passwordDialog.addEventListener("close", resetPasswordDialog);

    passwordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      ui.hideAlert(passwordAlert);

      const currentValid = validateCurrentPassword(true);
      const newValid = validateNewPassword(true);
      const confirmValid = validateConfirmPassword(true);

      if (!currentValid || !newValid || !confirmValid) {
        ui.shake(passwordForm);
        ui.focusFirstInvalid(passwordForm);
        return;
      }

      ui.setLoading(passwordSave, true);
      try {
        const result = await SS.api.changePassword({
          currentPassword: currentPassword.value,
          newPassword: newPassword.value,
          confirmPassword: confirmPassword.value,
        });

        currentUser = Object.assign({}, currentUser, {
          passwordChangedAt: (result && result.changedAt) || new Date().toISOString(),
        });
        renderUser();
        ui.closeDialog(passwordDialog);
        ui.toast.success(
          "Password updated",
          "Your new password is active. Use it the next time you sign in."
        );
      } catch (error) {
        if (error && error.field === "currentPassword") {
          ui.showFieldError(currentPassword, error.message);
        }
        if (error && error.field === "newPassword") {
          ui.showFieldError(newPassword, error.message);
        }
        if (error && error.field === "confirmPassword") {
          ui.showFieldError(confirmPassword, error.message);
        }
        ui.showAlert(
          passwordAlert,
          "error",
          (error && error.message) || "We could not update your password. Please try again.",
          "Could not update password"
        );
        ui.shake(passwordForm);
        ui.focusFirstInvalid(passwordForm);
      } finally {
        ui.setLoading(passwordSave, false);
      }
    });

    /* Welcome toast after registration */
    if (new URLSearchParams(window.location.search).get("welcome") === "1") {
      ui.toast.success("Welcome to SmartSpend", "Your workspace is ready for you to explore.");
    }
  });
})(window);
