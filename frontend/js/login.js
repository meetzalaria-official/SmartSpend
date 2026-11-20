/* ==========================================================================
   SmartSpend · Login screen
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;

  ui.ready(async function () {
    if (await SS.auth.redirectIfAuthenticated()) return;

    const form = document.getElementById("login-form");
    const identifier = document.getElementById("identifier");
    const password = document.getElementById("password");
    const remember = document.getElementById("remember");
    const submit = document.getElementById("login-submit");
    const demoButton = document.getElementById("demo-login");
    const alertBox = document.getElementById("login-alert");
    const params = new URLSearchParams(window.location.search);
    const next = SS.auth.safeNext(params.get("next"));

    const savedIdentifier = params.get("identifier") || SS.store.getLastIdentifier();
    if (savedIdentifier) identifier.value = savedIdentifier;

    function validateIdentifier(showMessage) {
      const message = SS.validators.validateLoginIdentifier(identifier.value);
      if (message && showMessage) ui.showFieldError(identifier, message);
      else if (!message && showMessage) ui.clearFieldError(identifier);
      return !message;
    }

    function validatePassword(showMessage) {
      const message = SS.validators.validateLoginPassword(password.value);
      if (message && showMessage) ui.showFieldError(password, message);
      else if (!message && showMessage) ui.clearFieldError(password);
      return !message;
    }

    [identifier, password].forEach((input) => {
      input.addEventListener("input", () => {
        ui.hideAlert(alertBox);
        if (input.getAttribute("aria-invalid") === "true") {
          ui.clearFieldState(input);
        }
      });
    });

    identifier.addEventListener("blur", () => {
      if (identifier.value.trim()) validateIdentifier(true);
    });

    password.addEventListener("blur", () => {
      if (password.value) validatePassword(true);
    });

    function showGeneralError(error) {
      const message =
        error && error.message
          ? error.message
          : "We could not sign you in. Please try again.";
      ui.showAlert(alertBox, "error", message, "Couldn't sign in");
      ui.shake(form);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      ui.hideAlert(alertBox);
      ui.clearFieldState(identifier);
      ui.clearFieldState(password);

      const identifierValid = validateIdentifier(true);
      const passwordValid = validatePassword(true);

      if (!identifierValid || !passwordValid) {
        ui.shake(form);
        ui.focusFirstInvalid(form);
        return;
      }

      ui.setLoading(submit, true);
      try {
        const user = await SS.api.login({
          identifier: identifier.value,
          password: password.value,
          remember: Boolean(remember.checked),
        });

        SS.auth.setFlash(
          "success",
          "Welcome back",
          `Signed in as ${user.fullName}.`
        );
        window.location.replace(next);
      } catch (error) {
        if (error && error.field === "identifier") ui.showFieldError(identifier, error.message);
        if (error && error.field === "password") ui.showFieldError(password, error.message);
        showGeneralError(error);
        ui.focusFirstInvalid(form);
      } finally {
        ui.setLoading(submit, false);
      }
    });

    demoButton.addEventListener("click", async () => {
      ui.hideAlert(alertBox);
      ui.setLoading(demoButton, true);
      try {
        const user = await SS.api.loginDemo();
        SS.auth.setFlash(
          "success",
          "Demo account ready",
          `Signed in as ${user.fullName}. Explore your workspace.`
        );
        window.location.replace(next);
      } catch (error) {
        showGeneralError(error);
      } finally {
        ui.setLoading(demoButton, false);
      }
    });
  });
})(window);
