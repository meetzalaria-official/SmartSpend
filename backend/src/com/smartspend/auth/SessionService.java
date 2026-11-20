package com.smartspend.auth;

import com.smartspend.db.Db;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * Opaque server-side sessions. The browser only receives a random token in an
 * HttpOnly cookie; the database stores a SHA-256 hash of that token, so a
 * database leak cannot be replayed against the API.
 */
public final class SessionService {

    public static final String COOKIE_NAME = "smartspend_session";
    public static final int REMEMBER_DAYS = 7;
    public static final int SESSION_HOURS = 24;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final Db db;

    public SessionService(Db db) {
        this.db = db;
    }

    public record SessionInfo(String token, String userId, String signedInAt, String expiresAt, boolean remember) {
    }

    public record Resolved(String userId, String signedInAt, String expiresAt, boolean remember) {
    }

    public SessionInfo create(String userId, boolean remember, String userAgent) {
        String token = newToken();
        Instant created = Instant.now();
        Duration lifetime = remember ? Duration.ofDays(REMEMBER_DAYS) : Duration.ofHours(SESSION_HOURS);
        Instant expires = created.plus(lifetime);
        String agent = userAgent == null ? "" : userAgent.substring(0, Math.min(240, userAgent.length()));

        db.tx(connection -> {
            try (PreparedStatement cleanup = connection.prepareStatement(
                    "DELETE FROM sessions WHERE expires_at <= ?")) {
                cleanup.setString(1, created.toString());
                cleanup.executeUpdate();
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO sessions(token_hash, user_id, created_at, expires_at, remember, user_agent) "
                            + "VALUES (?, ?, ?, ?, ?, ?)")) {
                statement.setString(1, tokenHash(token));
                statement.setString(2, userId);
                statement.setString(3, created.toString());
                statement.setString(4, expires.toString());
                statement.setInt(5, remember ? 1 : 0);
                statement.setString(6, agent);
                statement.executeUpdate();
            }
            return null;
        });

        return new SessionInfo(token, userId, created.toString(), expires.toString(), remember);
    }

    public Resolved resolve(String token) {
        if (token == null || token.isEmpty()) {
            return null;
        }
        String hash = tokenHash(token);
        return db.read(connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT user_id, created_at, expires_at, remember FROM sessions WHERE token_hash = ?")) {
                statement.setString(1, hash);
                try (ResultSet rows = statement.executeQuery()) {
                    if (!rows.next()) {
                        return null;
                    }
                    String expiresAt = rows.getString("expires_at");
                    if (Instant.parse(expiresAt).isBefore(Instant.now())) {
                        try (PreparedStatement delete = connection.prepareStatement(
                                "DELETE FROM sessions WHERE token_hash = ?")) {
                            delete.setString(1, hash);
                            delete.executeUpdate();
                        }
                        return null;
                    }
                    return new Resolved(
                            rows.getString("user_id"),
                            rows.getString("created_at"),
                            expiresAt,
                            rows.getInt("remember") == 1
                    );
                }
            }
        });
    }

    public void destroy(String token) {
        if (token == null || token.isEmpty()) {
            return;
        }
        db.execute("DELETE FROM sessions WHERE token_hash = ?", tokenHash(token));
    }

    public void destroyAllForUser(String userId) {
        db.execute("DELETE FROM sessions WHERE user_id = ?", userId);
    }

    public static String cookieHeader(SessionInfo session) {
        StringBuilder builder = new StringBuilder();
        builder.append(COOKIE_NAME).append('=').append(session.token())
                .append("; Path=/; HttpOnly; SameSite=Lax");
        if (session.remember()) {
            builder.append("; Max-Age=").append(REMEMBER_DAYS * 24 * 60 * 60);
        }
        return builder.toString();
    }

    public static String clearedCookieHeader() {
        return COOKIE_NAME + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
    }

    private static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String tokenHash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte value : hash) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable.", error);
        }
    }
}
