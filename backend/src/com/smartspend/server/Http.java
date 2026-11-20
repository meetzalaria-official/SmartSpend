package com.smartspend.server;

import com.smartspend.json.Json;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Small HTTP helpers shared by the static file server and the JSON API.
 */
public final class Http {

    public static final String JSON = "application/json; charset=UTF-8";
    private static final int MAX_BODY_BYTES = 8 * 1024 * 1024;

    private Http() {
    }

    public static String method(HttpExchange exchange) {
        return exchange.getRequestMethod().toUpperCase();
    }

    public static String path(HttpExchange exchange) {
        String path = exchange.getRequestURI().getPath();
        return path == null || path.isEmpty() ? "/" : path;
    }

    public static Map<String, String> query(HttpExchange exchange) {
        Map<String, String> result = new LinkedHashMap<>();
        String raw = exchange.getRequestURI().getRawQuery();
        if (raw == null || raw.isEmpty()) {
            return result;
        }
        for (String pair : raw.split("&")) {
            if (pair.isEmpty()) {
                continue;
            }
            int split = pair.indexOf('=');
            String key = split < 0 ? pair : pair.substring(0, split);
            String value = split < 0 ? "" : pair.substring(split + 1);
            try {
                key = URLDecoder.decode(key, StandardCharsets.UTF_8);
                value = URLDecoder.decode(value, StandardCharsets.UTF_8);
            } catch (IllegalArgumentException error) {
                throw ApiException.badRequest("Invalid query string.", null, "INVALID_QUERY");
            }
            result.putIfAbsent(key, value);
        }
        return result;
    }

    public static Map<String, Object> body(HttpExchange exchange) {
        byte[] bytes;
        try (InputStream input = exchange.getRequestBody()) {
            bytes = input.readNBytes(MAX_BODY_BYTES + 1);
        } catch (IOException error) {
            throw ApiException.badRequest("Could not read the request body.", null, "INVALID_BODY");
        }
        if (bytes.length > MAX_BODY_BYTES) {
            throw new ApiException(413, "That request is too large.", null, "PAYLOAD_TOO_LARGE");
        }
        String text = new String(bytes, StandardCharsets.UTF_8).trim();
        if (text.isEmpty()) {
            return Json.object();
        }
        try {
            Object value = Json.parse(text);
            return Json.requireObject(value);
        } catch (Json.ParseException error) {
            throw ApiException.badRequest("Invalid JSON: " + error.getMessage(), null, "INVALID_JSON");
        }
    }

    public static String cookie(HttpExchange exchange, String name) {
        Headers headers = exchange.getRequestHeaders();
        for (String header : headers.getOrDefault("Cookie", java.util.List.of())) {
            for (String part : header.split(";")) {
                String trimmed = part.trim();
                int split = trimmed.indexOf('=');
                if (split <= 0) {
                    continue;
                }
                if (trimmed.substring(0, split).equals(name)) {
                    return trimmed.substring(split + 1);
                }
            }
        }
        return null;
    }

    public static void addHeader(HttpExchange exchange, String name, String value) {
        exchange.getResponseHeaders().add(name, value);
    }

    public static void sendJson(HttpExchange exchange, int status, Object payload) {
        byte[] bytes = Json.stringify(payload).getBytes(StandardCharsets.UTF_8);
        Headers headers = exchange.getResponseHeaders();
        applySecurityHeaders(headers);
        headers.set("Content-Type", JSON);
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        headers.set("Pragma", "no-cache");
        try {
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(bytes);
            }
        } catch (IOException error) {
            // The client may have gone away; nothing useful to do.
        }
    }

    public static void sendError(HttpExchange exchange, int status, String message, String field, String code) {
        Map<String, Object> payload = Json.object();
        payload.put("message", message);
        if (field != null && !field.isEmpty()) {
            payload.put("field", field);
        }
        payload.put("code", code == null ? "API_ERROR" : code);
        sendJson(exchange, status, payload);
    }

    public static void sendText(HttpExchange exchange, int status, String body, String contentType) {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        Headers headers = exchange.getResponseHeaders();
        applySecurityHeaders(headers);
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        try {
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(bytes);
            }
        } catch (IOException error) {
            // Ignore a closed connection.
        }
    }

    public static void applySecurityHeaders(Headers headers) {
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("X-Frame-Options", "DENY");
        headers.set("Referrer-Policy", "same-origin");
        headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        headers.set(
                "Content-Security-Policy",
                "default-src 'self'; "
                        + "script-src 'self' 'unsafe-inline'; "
                        + "style-src 'self' 'unsafe-inline'; "
                        + "img-src 'self' data:; "
                        + "font-src 'self'; "
                        + "connect-src 'self'; "
                        + "base-uri 'none'; "
                        + "form-action 'self'; "
                        + "frame-ancestors 'none'"
        );
    }

    public static String clientAddress(HttpExchange exchange) {
        try {
            return exchange.getRemoteAddress().getAddress().getHostAddress();
        } catch (RuntimeException error) {
            return "unknown";
        }
    }
}
