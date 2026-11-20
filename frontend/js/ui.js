/* ==========================================================================
   SmartSpend · UI helpers
   Theme, toast, alerts, field state, password controls, dialogs and formatting.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const SVG_NS = "http://www.w3.org/2000/svg";

  const THEME_COLORS = {
    light: "#f4f5fb",
    dark: "#070b16",
  };

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function createIcon(name, className) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", className || "icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#i-${name}`);
    svg.appendChild(use);
    return svg;
  }

  /* ------------------------------------------------------------------------
     Theme
     ------------------------------------------------------------------------ */
  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, persist) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    if (persist !== false) SS.store.setTheme(next);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLORS[next]);

    qsa("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-label", next === "dark" ? "Switch to light theme" : "Switch to dark theme");
      button.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
      button.title = next === "dark" ? "Switch to light theme" : "Switch to dark theme";
    });
  }

  function initTheme() {
    const saved = SS.store.getTheme();
    const initial =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    applyTheme(initial, Boolean(saved));

    qsa("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
      });
    });
  }

  /* ------------------------------------------------------------------------
     Toast notifications
     ------------------------------------------------------------------------ */
  const TOAST_ICONS = {
    success: "check-circle",
    error: "alert",
    warning: "alert",
    info: "info",
  };

  function toast(options) {
    const settings = typeof options === "string" ? { message: options } : options || {};
    const type = ["success", "error", "warning", "info"].includes(settings.type)
      ? settings.type
      : "info";
    const stack = document.getElementById("toast-stack");
    if (!stack) return null;

    const element = document.createElement("div");
    element.className = `toast toast--${type}`;
    element.setAttribute("role", type === "error" ? "alert" : "status");

    const iconWrap = document.createElement("span");
    iconWrap.className = "toast__icon";
    iconWrap.appendChild(createIcon(TOAST_ICONS[type] || "info", "icon icon--sm"));

    const body = document.createElement("div");
    body.className = "toast__body";

    if (settings.title) {
      const title = document.createElement("strong");
      title.className = "toast__title";
      title.textContent = settings.title;
      body.appendChild(title);
    }

    if (settings.message) {
      const message = document.createElement("span");
      message.className = "toast__message";
      message.textContent = settings.message;
      body.appendChild(message);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast__close";
    close.setAttribute("aria-label", "Dismiss notification");
    close.appendChild(createIcon("x", "icon icon--sm"));
    close.addEventListener("click", () => dismiss());

    element.append(iconWrap, body, close);
    stack.appendChild(element);

    let timer = null;
    let removed = false;

    function dismiss() {
      if (removed) return;
      removed = true;
      if (timer) window.clearTimeout(timer);
      element.classList.add("is-leaving");
      window.setTimeout(() => element.remove(), 230);
    }

    if (settings.duration !== 0) {
      timer = window.setTimeout(dismiss, settings.duration || 4500);
      element.addEventListener("mouseenter", () => {
        if (timer) window.clearTimeout(timer);
      });
      element.addEventListener("mouseleave", () => {
        if (!removed) timer = window.setTimeout(dismiss, 2200);
      });
    }

    return element;
  }

  toast.success = (title, message) => toast({ type: "success", title, message });
  toast.error = (title, message) => toast({ type: "error", title, message });
  toast.warning = (title, message) => toast({ type: "warning", title, message });
  toast.info = (title, message) => toast({ type: "info", title, message });

  function consumeFlash() {
    const flash = SS.auth.consumeFlash();
    if (!flash || !flash.message) return;
    toast({
      type: flash.type || "info",
      title: flash.title || "",
      message: flash.message,
    });
  }

  /* ------------------------------------------------------------------------
     Inline alerts
     ------------------------------------------------------------------------ */
  const ALERT_ICONS = {
    error: "alert",
    success: "check-circle",
    warning: "alert",
    info: "info",
  };

  function showAlert(element, type, message, title) {
    if (!element) return;
    const kind = ["error", "success", "warning", "info"].includes(type) ? type : "info";
    element.className = `alert alert--${kind}`;
    element.hidden = false;
    element.replaceChildren();
    element.appendChild(createIcon(ALERT_ICONS[kind] || "info", "icon icon--sm"));

    const body = document.createElement("div");
    body.className = "alert__body";

    if (title) {
      const heading = document.createElement("strong");
      heading.className = "alert__title";
      heading.textContent = title;
      body.appendChild(heading);
    }

    const text = document.createElement("span");
    text.textContent = message || "";
    body.appendChild(text);
    element.appendChild(body);
  }

  function hideAlert(element) {
    if (!element) return;
    element.hidden = true;
    element.replaceChildren();
  }

  function shake(element) {
    if (!element) return;
    element.classList.remove("shake");
    /* Force a reflow so the animation can restart. */
    void element.offsetWidth;
    element.classList.add("shake");
    window.setTimeout(() => element.classList.remove("shake"), 450);
  }

  /* ------------------------------------------------------------------------
     Field state
     ------------------------------------------------------------------------ */
  function fieldFor(input) {
    if (!input) return null;
    return input.closest(".field") || input.parentElement;
  }

  function showFieldError(input, message) {
    const field = fieldFor(input);
    if (!field) return;
    field.classList.remove("is-valid");
    field.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    const error = field.querySelector(".field-error");
    if (error) error.textContent = message || "";
    const success = field.querySelector(".field-success");
    if (success) success.textContent = "";
  }

  function clearFieldError(input) {
    const field = fieldFor(input);
    if (!field) return;
    field.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
    const error = field.querySelector(".field-error");
    if (error) error.textContent = "";
  }

  function markFieldValid(input) {
    const field = fieldFor(input);
    if (!field) return;
    field.classList.remove("is-invalid");
    field.classList.add("is-valid");
    input.removeAttribute("aria-invalid");
    const error = field.querySelector(".field-error");
    if (error) error.textContent = "";
  }

  function clearFieldState(input) {
    const field = fieldFor(input);
    if (!field) return;
    field.classList.remove("is-valid", "is-invalid");
    input.removeAttribute("aria-invalid");
    const error = field.querySelector(".field-error");
    if (error) error.textContent = "";
    const success = field.querySelector(".field-success");
    if (success) success.textContent = "";
  }

  function showFieldSuccess(input, message) {
    const field = fieldFor(input);
    if (!field) return;
    field.classList.remove("is-invalid");
    field.classList.add("is-valid");
    input.removeAttribute("aria-invalid");
    const error = field.querySelector(".field-error");
    if (error) error.textContent = "";
    const success = field.querySelector(".field-success");
    if (success) success.textContent = message || "";
  }

  function focusFirstInvalid(form) {
    const invalid = form && form.querySelector(".is-invalid input, .is-invalid select, .is-invalid textarea");
    if (invalid && typeof invalid.focus === "function") invalid.focus();
  }

  /* ------------------------------------------------------------------------
     Buttons
     ------------------------------------------------------------------------ */
  function setLoading(button, loading) {
    if (!button) return;
    if (loading) {
      button.classList.add("is-loading");
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    } else {
      button.classList.remove("is-loading");
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  /* ------------------------------------------------------------------------
     Password tools
     ------------------------------------------------------------------------ */
  function initPasswordToggles(root) {
    qsa("[data-toggle-password]", root || document).forEach((button) => {
      const targetId = button.getAttribute("data-toggle-password");
      const input = document.getElementById(targetId);
      if (!input) return;

      button.addEventListener("click", () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.setAttribute("aria-pressed", showing ? "false" : "true");
        button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        button.title = showing ? "Show password" : "Hide password";
        input.focus({ preventScroll: true });
        try {
          input.setSelectionRange(input.value.length, input.value.length);
        } catch (error) {
          /* Some input types do not support selection. */
        }
      });
    });
  }

  function updatePasswordStrength(input, strengthRoot, requirementsRoot) {
    const strength = SS.validators.passwordStrength(input.value);
    const requirements = SS.validators.passwordRequirements(input.value);

    if (strengthRoot) {
      strengthRoot.dataset.score = String(input.value ? strength.score : 0);
      const label = strengthRoot.querySelector("[data-strength-label]");
      const hint = strengthRoot.querySelector("[data-strength-hint]");
      if (label) label.textContent = strength.label;
      if (hint) hint.textContent = strength.hint;
    }

    if (requirementsRoot) {
      qsa("[data-req]", requirementsRoot).forEach((item) => {
        const key = item.getAttribute("data-req");
        item.classList.toggle("is-met", Boolean(requirements[key]));
      });
    }

    return { strength, requirements };
  }

  /* ------------------------------------------------------------------------
     Dialogs & popovers
     ------------------------------------------------------------------------ */
  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function initDialogs() {
    qsa("[data-open-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        const dialog = document.getElementById(button.getAttribute("data-open-dialog"));
        openDialog(dialog);
      });
    });

    qsa("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        const dialog = button.closest("dialog");
        closeDialog(dialog);
      });
    });

    qsa("dialog.modal").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });
  }

  function initPopover(container, triggerSelector) {
    if (!container) return;
    const trigger = container.querySelector(triggerSelector || "[data-popover-trigger]");
    const panel = container.querySelector(".popover__panel");
    if (!trigger || !panel) return;

    function close() {
      container.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    }

    function open() {
      container.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    }

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      if (container.classList.contains("is-open")) close();
      else open();
    });

    document.addEventListener("click", (event) => {
      if (!container.contains(event.target)) close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });

    qsa("[data-close-popover]", container).forEach((button) => {
      button.addEventListener("click", close);
    });

    return { open, close };
  }

  /* ------------------------------------------------------------------------
     Formatting helpers
     ------------------------------------------------------------------------ */
  function toDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, options) {
    const date = toDate(value);
    if (!date) return "—";
    return new Intl.DateTimeFormat(
      "en-IN",
      options || { day: "numeric", month: "short", year: "numeric" }
    ).format(date);
  }

  function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return "—";
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatMonthYear(value) {
    const date = toDate(value);
    if (!date) return "—";
    return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date);
  }

  function formatTime(value) {
    const date = toDate(value);
    if (!date) return "—";
    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function relativeTime(value) {
    const date = toDate(value);
    if (!date) return "—";
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const ranges = [
      ["year", 60 * 60 * 24 * 365],
      ["month", 60 * 60 * 24 * 30],
      ["week", 60 * 60 * 24 * 7],
      ["day", 60 * 60 * 24],
      ["hour", 60 * 60],
      ["minute", 60],
    ];
    const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    for (const [unit, secondsInUnit] of ranges) {
      if (Math.abs(seconds) >= secondsInUnit || unit === "minute") {
        return formatter.format(Math.round(seconds / secondsInUnit), unit);
      }
    }
    return "just now";
  }

  function initials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "SS";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function firstName(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts[0] : "there";
  }

  function greeting(value) {
    const date = toDate(value) || new Date();
    const hour = date.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }

  function shortId(value) {
    const text = String(value || "").replace(/-/g, "").toUpperCase();
    return text ? `${text.slice(0, 4)}-${text.slice(4, 8)}` : "—";
  }

  function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), wait);
    };
  }

  async function copyText(value) {
    const text = String(value || "");
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      /* fall through to the legacy method */
    }

    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch (error) {
      return false;
    }
  }

  function download(filename, content, mimeType) {
    try {
      const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      return true;
    } catch (error) {
      return false;
    }
  }

  /* ------------------------------------------------------------------------
     Promise-based confirmation dialog
     ------------------------------------------------------------------------ */
  function confirm(options) {
    const settings =
      typeof options === "string" ? { message: options } : Object.assign({}, options || {});

    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "modal modal--confirm";

      const card = document.createElement("div");
      card.className = "modal__card";

      const head = document.createElement("div");
      head.className = "modal__head";

      const icon = document.createElement("span");
      icon.className = `modal__icon${settings.danger ? " modal__icon--danger" : ""}`;
      icon.appendChild(createIcon(settings.icon || "alert", "icon icon--lg"));

      const copy = document.createElement("div");
      copy.className = "modal__head-text";
      const title = document.createElement("h2");
      title.textContent = settings.title || "Are you sure?";
      const message = document.createElement("p");
      message.textContent = settings.message || "This action cannot be undone.";
      copy.append(title, message);
      head.append(icon, copy);

      const actions = document.createElement("div");
      actions.className = "modal__actions";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn--ghost";
      cancel.textContent = settings.cancelLabel || "Cancel";

      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = `btn ${settings.danger ? "btn--danger" : "btn--primary"}`;
      accept.textContent = settings.confirmLabel || "Confirm";

      actions.append(cancel, accept);
      card.append(head, actions);
      dialog.appendChild(card);
      document.body.appendChild(dialog);

      let settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        try {
          closeDialog(dialog);
        } catch (error) {
          dialog.remove();
        }
        window.setTimeout(() => dialog.remove(), 50);
        resolve(value);
      }

      cancel.addEventListener("click", () => finish(false));
      accept.addEventListener("click", () => finish(true));
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        finish(false);
      });
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) finish(false);
      });

      openDialog(dialog);
      window.setTimeout(() => accept.focus(), 50);
    });
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */
  ready(() => {
    SS.icons.mount();
    initTheme();
    initPasswordToggles();
    initDialogs();
    consumeFlash();
  });

  SS.ui = {
    qs,
    qsa,
    ready,
    createIcon,
    currentTheme,
    applyTheme,
    initTheme,
    toast,
    consumeFlash,
    showAlert,
    hideAlert,
    shake,
    showFieldError,
    clearFieldError,
    markFieldValid,
    showFieldSuccess,
    clearFieldState,
    focusFirstInvalid,
    setLoading,
    initPasswordToggles,
    updatePasswordStrength,
    openDialog,
    closeDialog,
    initDialogs,
    initPopover,
    formatDate,
    formatDateTime,
    formatMonthYear,
    formatTime,
    relativeTime,
    initials,
    firstName,
    greeting,
    shortId,
    debounce,
    copyText,
    download,
    confirm,
  };
})(window);
