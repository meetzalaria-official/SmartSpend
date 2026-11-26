package com.smartspend.auth;

import com.smartspend.server.ApiException;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Server-side mirror of {@code frontend/js/validators.js}. The browser validates
 * for UX; the API repeats every rule so it cannot be bypassed.
 */
public final class Validation {

    public static final int MIN_PASSWORD = 8;
    public static final int MAX_PASSWORD = 128;

    private static final Pattern NAME =
            Pattern.compile("^[\\p{L}\\p{M}][\\p{L}\\p{M}\\s.'-]*$");
    private static final Pattern USERNAME =
            Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]*$");
    private static final Pattern EMAIL =
            Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");
    private static final Pattern MONTH = Pattern.compile("^\\d{4}-(0[1-9]|1[0-2])$");
    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    private Validation() {
    }

    public static String normaliseName(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    public static String normaliseUsername(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    public static String normaliseEmail(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    public static String fullNameError(String raw) {
        String name = normaliseName(raw);
        if (name.isEmpty()) {
            return "Please enter your full name.";
        }
        if (name.length() < 2) {
            return "Full name must be at least 2 characters.";
        }
        if (name.length() > 60) {
            return "Full name cannot be longer than 60 characters.";
        }
        if (!NAME.matcher(name).matches()) {
            return "Use letters, spaces, dots, apostrophes or hyphens only.";
        }
        if (!name.contains(" ") && name.length() < 3) {
            return "Please enter your full name.";
        }
        return null;
    }

    public static String usernameError(String raw) {
        String username = normaliseUsername(raw);
        if (username.isEmpty()) {
            return "Please choose a username.";
        }
        if (username.length() < 3) {
            return "Username must be at least 3 characters.";
        }
        if (username.length() > 30) {
            return "Username cannot be longer than 30 characters.";
        }
        if (!USERNAME.matcher(username).matches()) {
            return "Start with a letter or number; use letters, numbers, dots, underscores or hyphens.";
        }
        if (username.matches(".*[._-]{2,}.*")) {
            return "Avoid repeating dots, underscores or hyphens.";
        }
        return null;
    }

    public static String emailError(String raw) {
        String email = normaliseEmail(raw);
        if (email.isEmpty()) {
            return "Please enter your email address.";
        }
        if (email.length() > 254) {
            return "Email address is too long.";
        }
        if (email.startsWith(".") || email.contains("..")) {
            return "Enter a valid email address.";
        }
        if (!EMAIL.matcher(email).matches()) {
            return "Enter a valid email address, for example name@example.com.";
        }
        return null;
    }

    public static String passwordError(String raw) {
        String password = raw == null ? "" : raw;
        if (password.isEmpty()) {
            return "Please create a password.";
        }
        if (password.length() < MIN_PASSWORD) {
            return "Password must be at least " + MIN_PASSWORD + " characters.";
        }
        if (password.length() > MAX_PASSWORD) {
            return "Password cannot be longer than " + MAX_PASSWORD + " characters.";
        }
        if (!password.matches(".*[A-Za-z].*")) {
            return "Password must include at least one letter.";
        }
        if (!password.matches(".*[0-9].*")) {
            return "Password must include at least one number.";
        }
        return null;
    }

    public static String confirmationError(String password, String confirmation) {
        if (confirmation == null || confirmation.isEmpty()) {
            return "Please confirm your password.";
        }
        if (!confirmation.equals(password)) {
            return "Passwords do not match.";
        }
        return null;
    }

    public static String loginIdentifierError(String raw) {
        String identifier = raw == null ? "" : raw.trim();
        if (identifier.isEmpty()) {
            return "Enter your username or email address.";
        }
        if (identifier.length() > 254) {
            return "That username or email is too long.";
        }
        return null;
    }

    public static String loginPasswordError(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "Enter your password.";
        }
        return null;
    }

    public static String requireName(String raw) {
        String error = fullNameError(raw);
        if (error != null) {
            throw ApiException.badRequest(error, "fullName", "INVALID_NAME");
        }
        return normaliseName(raw);
    }

    public static String requireUsername(String raw) {
        String error = usernameError(raw);
        if (error != null) {
            throw ApiException.badRequest(error, "username", "INVALID_USERNAME");
        }
        return normaliseUsername(raw);
    }

    public static String requireEmail(String raw) {
        String error = emailError(raw);
        if (error != null) {
            throw ApiException.badRequest(error, "email", "INVALID_EMAIL");
        }
        return normaliseEmail(raw);
    }

    public static String requirePassword(String raw) {
        String error = passwordError(raw);
        if (error != null) {
            throw ApiException.badRequest(error, "password", "WEAK_PASSWORD");
        }
        return raw;
    }

    public static String requireConfirmation(String password, String confirmation) {
        String error = confirmationError(password, confirmation);
        if (error != null) {
            throw ApiException.badRequest(error, "confirmPassword", "PASSWORD_MISMATCH");
        }
        return confirmation;
    }

    /* ---------------------------------------------------------------------
       Finance helpers
       --------------------------------------------------------------------- */

    public static String today() {
        return LocalDate.now().toString();
    }

    public static String currentMonth() {
        return YearMonth.now().toString();
    }

    public static boolean isIsoDate(String value) {
        if (value == null || !DATE.matcher(value).matches()) {
            return false;
        }
        try {
            LocalDate.parse(value);
            return true;
        } catch (DateTimeParseException error) {
            return false;
        }
    }

    public static String requireDate(String raw, String field) {
        String value = raw == null ? "" : raw.trim();
        if (!isIsoDate(value)) {
            throw ApiException.badRequest("Choose a valid date.", field, "INVALID_DATE");
        }
        return value;
    }

    public static String requireMonth(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            return currentMonth();
        }
        if (!MONTH.matcher(value).matches()) {
            throw ApiException.badRequest("Choose a valid month.", "month", "INVALID_MONTH");
        }
        return value;
    }

    public static String optionalMonth(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            return null;
        }
        if (!MONTH.matcher(value).matches()) {
            throw ApiException.badRequest("Choose a valid month.", "month", "INVALID_MONTH");
        }
        return value;
    }

    public static String truncate(String value, int max) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
