package com.smartspend.auth;

import com.smartspend.db.Db;
import com.smartspend.json.Json;
import com.smartspend.server.ApiException;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Registration, sign-in, sessions, profile updates and password changes.
 */
public final class AuthService {

    private static final int MAX_FAILURES = 10;
    private static final long FAILURE_WINDOW_MILLIS = 5 * 60 * 1000L;

    private final Db db;
    private final SessionService sessions;
    private final Map<String, Deque<Long>> failures = new ConcurrentHashMap<>();

    public AuthService(Db db, SessionService sessions) {
        this.db = db;
        this.sessions = sessions;
    }

    public record AuthResult(User user, SessionService.SessionInfo session) {
    }

    /* ---------------------------------------------------------------------
       Registration and sign-in
       --------------------------------------------------------------------- */

    public AuthResult register(Map<String, Object> payload, String address, String userAgent) {
        String fullName = Validation.requireName(Json.text(payload, "fullName"));
        String username = Validation.requireUsername(Json.text(payload, "username"));
        String email = Validation.requireEmail(Json.text(payload, "email"));
        String password = Json.text(payload, "password");
        Validation.requirePassword(password);
        Validation.requireConfirmation(password, Json.text(payload, "confirmPassword"));

        if (usernameExists(username, null)) {
            throw ApiException.conflict("That username is already taken. Try another one.",
                    "username", "DUPLICATE_USERNAME");
        }
        if (emailExists(email, null)) {
            throw ApiException.conflict("An account with this email already exists.",
                    "email", "DUPLICATE_EMAIL");
        }

        String hash = PasswordHasher.hash(password);
        String now = Instant.now().toString();
        User user = new User(id("usr"), fullName, username, email, hash, now, now, now, now);

        db.tx(connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO users(id, full_name, username, email, password_hash, created_at, updated_at, "
                            + "last_login_at, password_changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
                statement.setString(1, user.id());
                statement.setString(2, user.fullName());
                statement.setString(3, user.username());
                statement.setString(4, user.email());
                statement.setString(5, user.passwordHash());
                statement.setString(6, user.createdAt());
                statement.setString(7, user.updatedAt());
                statement.setString(8, user.lastLoginAt());
                statement.setString(9, user.passwordChangedAt());
                statement.executeUpdate();
            }
            initializeWorkspace(connection, user.id(), now);
            return null;
        });

        SessionService.SessionInfo session = sessions.create(user.id(), true, userAgent);
        return new AuthResult(user, session);
    }

    public AuthResult login(Map<String, Object> payload, String address, String userAgent) {
        String identifier = Json.text(payload, "identifier").trim();
        String password = Json.text(payload, "password");
        boolean remember = Json.bool(payload, "remember", false);

        String identifierError = Validation.loginIdentifierError(identifier);
        if (identifierError != null) {
            throw ApiException.badRequest(identifierError, "identifier", "INVALID_IDENTIFIER");
        }
        String passwordError = Validation.loginPasswordError(password);
        if (passwordError != null) {
            throw ApiException.badRequest(passwordError, "password", "INVALID_PASSWORD");
        }

        enforceRateLimit(address);

        User user = findByUsernameOrEmail(identifier);
        boolean valid = user != null
                ? PasswordHasher.verify(password, user.passwordHash())
                : PasswordHasher.verify(password, dummyHash());

        if (user == null || !valid) {
            recordFailure(address);
            throw new ApiException(401,
                    "Incorrect username/email or password. Please try again.",
                    null, "INVALID_CREDENTIALS");
        }

        clearFailures(address);
        String now = Instant.now().toString();
        db.execute("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", now, now, user.id());
        User updated = findById(user.id());
        SessionService.SessionInfo session = sessions.create(user.id(), remember, userAgent);
        return new AuthResult(updated == null ? user : updated, session);
    }

    public void logout(String token) {
        sessions.destroy(token);
    }

    /* ---------------------------------------------------------------------
       Lookups
       --------------------------------------------------------------------- */

    public User findById(String id) {
        return db.read(connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT * FROM users WHERE id = ?")) {
                statement.setString(1, id);
                try (ResultSet rows = statement.executeQuery()) {
                    return rows.next() ? userFrom(rows) : null;
                }
            }
        });
    }

    public User findByUsernameOrEmail(String identifier) {
        String value = identifier == null ? "" : identifier.trim().toLowerCase();
        if (value.isEmpty()) {
            return null;
        }
        return db.read(connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ? LIMIT 1")) {
                statement.setString(1, value);
                statement.setString(2, value);
                try (ResultSet rows = statement.executeQuery()) {
                    return rows.next() ? userFrom(rows) : null;
                }
            }
        });
    }

    public boolean usernameExists(String username, String excludeId) {
        return exists("SELECT 1 FROM users WHERE lower(username) = lower(?) AND id <> ?", username, excludeId);
    }

    public boolean emailExists(String email, String excludeId) {
        return exists("SELECT 1 FROM users WHERE lower(email) = lower(?) AND id <> ?", email, excludeId);
    }

    private boolean exists(String sql, String value, String excludeId) {
        return db.read(connection -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, value);
                statement.setString(2, excludeId == null ? "" : excludeId);
                try (ResultSet rows = statement.executeQuery()) {
                    return rows.next();
                }
            }
        });
    }

    /* ---------------------------------------------------------------------
       Profile and password
       --------------------------------------------------------------------- */

    public User updateProfile(String userId, Map<String, Object> payload) {
        String fullName = Validation.requireName(Json.text(payload, "fullName"));
        String email = Validation.requireEmail(Json.text(payload, "email"));
        if (emailExists(email, userId)) {
            throw ApiException.conflict("Another account is already using this email.",
                    "email", "DUPLICATE_EMAIL");
        }
        String now = Instant.now().toString();
        db.execute("UPDATE users SET full_name = ?, email = ?, updated_at = ? WHERE id = ?",
                fullName, email, now, userId);
        User user = findById(userId);
        if (user == null) {
            throw ApiException.unauthorised();
        }
        return user;
    }

    public Map<String, Object> changePassword(String userId, Map<String, Object> payload) {
        String currentPassword = Json.text(payload, "currentPassword");
        String newPassword = Json.text(payload, "newPassword");
        User user = findById(userId);
        if (user == null) {
            throw ApiException.unauthorised();
        }
        if (currentPassword.isEmpty()) {
            throw ApiException.badRequest("Enter your current password.", "currentPassword", "INVALID_PASSWORD");
        }
        if (!PasswordHasher.verify(currentPassword, user.passwordHash())) {
            throw ApiException.badRequest("Your current password is incorrect.",
                    "currentPassword", "INVALID_PASSWORD");
        }
        Validation.requirePassword(newPassword);
        Validation.requireConfirmation(newPassword, Json.text(payload, "confirmPassword"));
        if (newPassword.equals(currentPassword)) {
            throw ApiException.badRequest("Choose a password different from your current one.",
                    "newPassword", "SAME_PASSWORD");
        }
        String now = Instant.now().toString();
        db.execute("UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?",
                PasswordHasher.hash(newPassword), now, now, userId);
        Map<String, Object> result = Json.object();
        result.put("changedAt", now);
        return result;
    }

    public Map<String, Object> checkUsername(String username) {
        String value = Validation.normaliseUsername(username);
        String error = Validation.usernameError(value);
        Map<String, Object> result = Json.object();
        if (error != null) {
            result.put("available", false);
            result.put("message", error);
            return result;
        }
        boolean taken = usernameExists(value, null);
        result.put("available", !taken);
        result.put("message", taken ? "That username is already taken." : "Username is available.");
        return result;
    }

    public Map<String, Object> checkEmail(String email) {
        String value = Validation.normaliseEmail(email);
        String error = Validation.emailError(value);
        Map<String, Object> result = Json.object();
        if (error != null) {
            result.put("available", false);
            result.put("message", error);
            return result;
        }
        boolean taken = emailExists(value, null);
        result.put("available", !taken);
        result.put("message", taken ? "An account with this email already exists." : "Email is available.");
        return result;
    }

    public SessionService.SessionInfo sessionInfo(String userId, String token, boolean remember,
                                                  String signedInAt, String expiresAt) {
        return new SessionService.SessionInfo(token, userId, signedInAt, expiresAt, remember);
    }

    /* ---------------------------------------------------------------------
       Helpers
       --------------------------------------------------------------------- */

    /**
     * Prepares an empty workspace for a new account. It intentionally creates no
     * categories, transactions, budgets or goals: the user adds every finance
     * record from scratch, so one account can never inherit sample data or
     * another account's history.
     */
    private static void initializeWorkspace(java.sql.Connection connection, String userId, String now)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT OR IGNORE INTO user_settings(user_id, currency, date_format, month_start, week_start, "
                        + "theme, profile_note, monthly_income_cents, notify_budget_alerts, notify_goal_reminders, "
                        + "notify_weekly_digest, notify_recurring_reminders, updated_at) "
                        + "VALUES (?, 'INR', 'DD MMM YYYY', 1, 'mon', 'light', '', 0, 1, 1, 1, 1, ?)")) {
            statement.setString(1, userId);
            statement.setString(2, now);
            statement.executeUpdate();
        }
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT OR IGNORE INTO user_state(user_id, read_notifications, dismissed_notifications, last_deleted, "
                        + "recurring_queue, seeded_at, updated_at) VALUES (?, '[]', '[]', '[]', '[]', ?, ?)")) {
            statement.setString(1, userId);
            statement.setString(2, now);
            statement.setString(3, now);
            statement.executeUpdate();
        }
    }

    private static User userFrom(ResultSet rows) throws SQLException {
        return new User(
                rows.getString("id"),
                rows.getString("full_name"),
                rows.getString("username"),
                rows.getString("email"),
                rows.getString("password_hash"),
                rows.getString("created_at"),
                rows.getString("updated_at"),
                rows.getString("last_login_at"),
                rows.getString("password_changed_at")
        );
    }

    private static String id(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
    }

    private static volatile String dummy;

    private static String dummyHash() {
        if (dummy == null) {
            dummy = PasswordHasher.hash("SmartSpend-Dummy-Password-1");
        }
        return dummy;
    }

    private void enforceRateLimit(String address) {
        Deque<Long> attempts = failures.get(address);
        if (attempts == null) {
            return;
        }
        long cutoff = System.currentTimeMillis() - FAILURE_WINDOW_MILLIS;
        synchronized (attempts) {
            while (!attempts.isEmpty() && attempts.peekFirst() < cutoff) {
                attempts.pollFirst();
            }
            if (attempts.size() >= MAX_FAILURES) {
                throw new ApiException(429,
                        "Too many sign-in attempts. Please wait a few minutes and try again.",
                        null, "TOO_MANY_ATTEMPTS");
            }
        }
    }

    private void recordFailure(String address) {
        Deque<Long> attempts = failures.computeIfAbsent(address, key -> new ArrayDeque<>());
        synchronized (attempts) {
            attempts.addLast(System.currentTimeMillis());
            while (attempts.size() > MAX_FAILURES * 2) {
                attempts.pollFirst();
            }
        }
    }

    private void clearFailures(String address) {
        failures.remove(address);
    }
}
