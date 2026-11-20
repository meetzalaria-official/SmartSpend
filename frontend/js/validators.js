/* ==========================================================================
   SmartSpend · Shared validation rules
   Used by the login, registration and account screens. The Java API repeats
   these checks on the server; client validation is for UX.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const MIN_PASSWORD = 8;
  const MAX_PASSWORD = 128;

  const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u;
  const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function normalizeName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function validateFullName(value) {
    const name = normalizeName(value);
    if (!name) return "Please enter your full name.";
    if (name.length < 2) return "Full name must be at least 2 characters.";
    if (name.length > 60) return "Full name cannot be longer than 60 characters.";
    if (!NAME_PATTERN.test(name)) {
      return "Use letters, spaces, dots, apostrophes or hyphens only.";
    }
    if (!name.includes(" ") && name.length < 3) {
      return "Please enter your full name.";
    }
    return null;
  }

  function validateUsername(value) {
    const username = normalizeUsername(value);
    if (!username) return "Please choose a username.";
    if (username.length < 3) return "Username must be at least 3 characters.";
    if (username.length > 30) return "Username cannot be longer than 30 characters.";
    if (!USERNAME_PATTERN.test(username)) {
      return "Start with a letter or number; use letters, numbers, dots, underscores or hyphens.";
    }
    if (/[._-]{2,}/.test(username)) {
      return "Avoid repeating dots, underscores or hyphens.";
    }
    return null;
  }

  function validateEmail(value) {
    const email = normalizeEmail(value);
    if (!email) return "Please enter your email address.";
    if (email.length > 254) return "Email address is too long.";
    if (email.startsWith(".") || email.includes("..")) return "Enter a valid email address.";
    if (!EMAIL_PATTERN.test(email)) {
      return "Enter a valid email address, for example name@example.com.";
    }
    return null;
  }

  function validatePassword(value) {
    const password = String(value || "");
    if (!password) return "Please create a password.";
    if (password.length < MIN_PASSWORD) {
      return `Password must be at least ${MIN_PASSWORD} characters.`;
    }
    if (password.length > MAX_PASSWORD) {
      return `Password cannot be longer than ${MAX_PASSWORD} characters.`;
    }
    if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter.";
    if (!/[0-9]/.test(password)) return "Password must include at least one number.";
    return null;
  }

  function validateLoginIdentifier(value) {
    const identifier = String(value || "").trim();
    if (!identifier) return "Enter your username or email address.";
    if (identifier.length > 254) return "That username or email is too long.";
    return null;
  }

  function validateLoginPassword(value) {
    if (!String(value || "")) return "Enter your password.";
    return null;
  }

  function validateConfirmation(password, confirmation) {
    if (!String(confirmation || "")) return "Please confirm your password.";
    if (String(password || "") !== String(confirmation || "")) return "Passwords do not match.";
    return null;
  }

  function passwordRequirements(value) {
    const password = String(value || "");
    return {
      length: password.length >= MIN_PASSWORD,
      letter: /[A-Za-z]/.test(password),
      number: /[0-9]/.test(password),
    };
  }

  function passwordStrength(value) {
    const password = String(value || "");
    if (!password) {
      return { score: 0, label: "Enter a password", hint: "Use 8+ characters with a letter and a number." };
    }

    let score = 0;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (password.length >= MIN_PASSWORD) score += 1;
    if (password.length >= 12) score += 1;
    if (hasLower && hasUpper) score += 1;
    if (hasNumber && hasSpecial) score += 1;

    if (password.length < MIN_PASSWORD) {
      return { score: 1, label: "Too short", hint: `Add ${MIN_PASSWORD - password.length} more character(s).` };
    }

    const labels = ["", "Weak", "Fair", "Good", "Strong"];
    const hints = [
      "",
      "Add more length, mixed case or a symbol.",
      "A longer password with mixed case is safer.",
      "Add a symbol or make it longer for a strong score.",
      "Excellent — this password is well protected.",
    ];

    return { score, label: labels[score] || "Fair", hint: hints[score] || hints[2] };
  }

  SS.validators = {
    MIN_PASSWORD,
    MAX_PASSWORD,
    normalizeName,
    normalizeUsername,
    normalizeEmail,
    validateFullName,
    validateUsername,
    validateEmail,
    validatePassword,
    validateLoginIdentifier,
    validateLoginPassword,
    validateConfirmation,
    passwordRequirements,
    passwordStrength,
  };
})(window);
