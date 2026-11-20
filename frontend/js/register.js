/* ==========================================================================
   SmartSpend · Registration screen
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const validators = SS.validators;

  ui.ready(async function () {
    if (await SS.auth.redirectIfAuthenticated()) return;

    const form = document.getElementById("register-form");
    const nameInput = document.getElementById("register-name");
    const usernameInput = document.getElementById("register-username");
    const emailInput = document.getElementById("register-email");
    const passwordInput = document.getElementById("register-password");
    const confirmInput = document.getElementById("register-confirm");
    const strengthRoot = document.getElementById("register-strength");
    const requirementsRoot = document.getElementById("register-requirements");
    const submit = document.getElementById("register-submit");
    const alertBox = document.getElementById("register-alert");

    let usernameToken = 0;
    let emailToken = 0;
    let confirmTouched = false;

    function setFieldResult(input, message, markValid) {
      if (message) {
        ui.showFieldError(input, message);
        return false;
      }
      ui.clearFieldError(input);
      if (markValid && input.value.trim()) ui.markFieldValid(input);
      return true;
    }

    function validateName(show) {
      const message = validators.validateFullName(nameInput.value);
      if (!show) return !message;
      return setFieldResult(nameInput, message, true);
    }

    function validateEmailFormat(show) {
      const message = validators.validateEmail(emailInput.value);
      if (!show) return !message;
      if (message) {
        ui.showFieldError(emailInput, message);
        return false;
      }
      ui.clearFieldError(emailInput);
      return true;
    }

    function validateUsernameFormat(show) {
      const message = validators.validateUsername(usernameInput.value);
      if (!show) return !message;
      if (message) {
        ui.showFieldError(usernameInput, message);
        return false;
      }
      ui.clearFieldError(usernameInput);
      return true;
    }

    function validatePassword(show) {
      const message = validators.validatePassword(passwordInput.value);
      if (!show) return !message;
      if (message) {
        ui.showFieldError(passwordInput, message);
        return false;
      }
      ui.clearFieldError(passwordInput);
      return true;
    }

    function validateConfirm(show) {
      const message = validators.validateConfirmation(passwordInput.value, confirmInput.value);
      if (!show) return !message;
      if (message) {
        ui.showFieldError(confirmInput, message);
        return false;
      }
      ui.clearFieldError(confirmInput);
      if (confirmInput.value) ui.markFieldValid(confirmInput);
      return true;
    }

    async function checkUsernameAvailability() {
      const value = usernameInput.value.trim();
      if (!value) return false;

      const formatError = validators.validateUsername(value);
      if (formatError) {
        ui.showFieldError(usernameInput, formatError);
        return false;
      }

      const token = ++usernameToken;
      ui.clearFieldError(usernameInput);
      ui.showFieldSuccess(usernameInput, "Checking availability…");

      try {
        const result = await SS.api.checkUsername(value);
        if (token !== usernameToken) return false;
        if (!result.available) {
          ui.showFieldError(usernameInput, result.message);
          return false;
        }
        ui.showFieldSuccess(usernameInput, result.message || "Username is available.");
        return true;
      } catch (error) {
        if (token === usernameToken) ui.clearFieldState(usernameInput);
        return false;
      }
    }

    async function checkEmailAvailability() {
      const value = emailInput.value.trim();
      if (!value) return false;

      const formatError = validators.validateEmail(value);
      if (formatError) {
        ui.showFieldError(emailInput, formatError);
        return false;
      }

      const token = ++emailToken;
      ui.clearFieldError(emailInput);
      ui.showFieldSuccess(emailInput, "Checking availability…");

      try {
        const result = await SS.api.checkEmail(value);
        if (token !== emailToken) return false;
        if (!result.available) {
          ui.showFieldError(emailInput, result.message);
          return false;
        }
        ui.showFieldSuccess(emailInput, result.message || "Email is available.");
        return true;
      } catch (error) {
        if (token === emailToken) ui.clearFieldState(emailInput);
        return false;
      }
    }

    function updateStrength() {
      ui.updatePasswordStrength(passwordInput, strengthRoot, requirementsRoot);
    }

    /* Live feedback */
    nameInput.addEventListener("input", () => {
      ui.hideAlert(alertBox);
      if (nameInput.getAttribute("aria-invalid") === "true") ui.clearFieldState(nameInput);
    });
    nameInput.addEventListener("blur", () => {
      if (nameInput.value.trim()) validateName(true);
    });

    usernameInput.addEventListener("input", () => {
      usernameToken += 1;
      ui.hideAlert(alertBox);
      ui.clearFieldState(usernameInput);
    });
    usernameInput.addEventListener("blur", () => {
      if (usernameInput.value.trim()) checkUsernameAvailability();
    });

    emailInput.addEventListener("input", () => {
      emailToken += 1;
      ui.hideAlert(alertBox);
      ui.clearFieldState(emailInput);
    });
    emailInput.addEventListener("blur", () => {
      if (emailInput.value.trim()) checkEmailAvailability();
    });

    passwordInput.addEventListener("input", () => {
      ui.hideAlert(alertBox);
      if (passwordInput.getAttribute("aria-invalid") === "true") ui.clearFieldState(passwordInput);
      updateStrength();
      if (confirmTouched || confirmInput.value) validateConfirm(true);
    });
    passwordInput.addEventListener("blur", () => {
      if (passwordInput.value) {
        const hasError = !validatePassword(true);
        if (!hasError) ui.clearFieldError(passwordInput);
      }
    });

    confirmInput.addEventListener("input", () => {
      confirmTouched = true;
      ui.hideAlert(alertBox);
      if (confirmInput.getAttribute("aria-invalid") === "true") ui.clearFieldState(confirmInput);
      if (confirmInput.value) validateConfirm(true);
    });
    confirmInput.addEventListener("blur", () => {
      if (confirmInput.value) validateConfirm(true);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      ui.hideAlert(alertBox);
      usernameToken += 1;
      emailToken += 1;

      const validName = validateName(true);
      const validUsername = validateUsernameFormat(true);
      const validEmail = validateEmailFormat(true);
      const validPassword = validatePassword(true);
      const validConfirm = validateConfirm(true);

      if (!validName || !validUsername || !validEmail || !validPassword || !validConfirm) {
        ui.shake(form);
        ui.focusFirstInvalid(form);
        return;
      }

      ui.setLoading(submit, true);
      try {
        const user = await SS.api.register({
          fullName: nameInput.value,
          username: usernameInput.value,
          email: emailInput.value,
          password: passwordInput.value,
          confirmPassword: confirmInput.value,
        });

        SS.auth.setFlash(
          "success",
          "Account created",
          `Welcome to SmartSpend, ${ui.firstName(user.fullName)}. Your workspace is ready.`
        );
        window.location.replace(SS.config.routes.dashboard);
      } catch (error) {
        const fieldMap = {
          fullName: nameInput,
          username: usernameInput,
          email: emailInput,
          password: passwordInput,
          confirmPassword: confirmInput,
        };
        if (error && error.field && fieldMap[error.field]) {
          ui.showFieldError(fieldMap[error.field], error.message);
        }
        ui.showAlert(
          alertBox,
          "error",
          (error && error.message) || "We could not create your account. Please try again.",
          "Could not create account"
        );
        ui.shake(form);
        ui.focusFirstInvalid(form);
      } finally {
        ui.setLoading(submit, false);
      }
    });
  });
})(window);
