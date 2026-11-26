package com.smartspend.auth;

import com.smartspend.json.Json;

import java.util.Map;

/**
 * A SmartSpend account. Password material stays inside this object and is only
 * used by {@link PasswordHasher}; {@link #toPublicJson()} is what the API returns.
 */
public record User(
        String id,
        String fullName,
        String username,
        String email,
        String passwordHash,
        String createdAt,
        String updatedAt,
        String lastLoginAt,
        String passwordChangedAt
) {

    public Map<String, Object> toPublicJson() {
        Map<String, Object> json = Json.object();
        json.put("id", id);
        json.put("fullName", fullName);
        json.put("username", username);
        json.put("email", email);
        json.put("createdAt", createdAt);
        json.put("updatedAt", updatedAt);
        json.put("lastLoginAt", lastLoginAt);
        json.put("passwordChangedAt", passwordChangedAt);
        return json;
    }
}
