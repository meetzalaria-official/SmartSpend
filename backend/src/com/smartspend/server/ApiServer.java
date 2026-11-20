package com.smartspend.server;

import com.smartspend.auth.AuthService;
import com.smartspend.auth.SessionService;
import com.smartspend.auth.User;
import com.smartspend.db.Db;
import com.smartspend.json.Json;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;

/**
 * Single-origin server: static frontend files plus the JSON API. Sessions are
 * carried by an HttpOnly cookie, so page scripts never see the token.
 */
public final class ApiServer {

    private static final String PHASE = "8";

    private final Db db;
    private final AuthService auth;
    private final SessionService sessions;
    private final FinanceApi financeApi;
    private final Path root;

    public ApiServer(Db db, AuthService auth, SessionService sessions, FinanceApi financeApi, Path root) {
        this.db = db;
        this.auth = auth;
        this.sessions = sessions;
        this.financeApi = financeApi;
        this.root = root;
    }

    public void handle(HttpExchange exchange) {
        try {
            String path = Http.path(exchange);
            if (path.equals("/api") || path.startsWith("/api/")) {
                api(exchange);
            } else {
                serveStatic(exchange, path);
            }
        } catch (ApiException error) {
            Http.sendError(exchange, error.status(), error.getMessage(), error.field(), error.code());
        } catch (Exception error) {
            System.err.println("API request failed: " + error);
            error.printStackTrace(System.err);
            Http.sendError(exchange, 500, "Something went wrong on the server. Please try again.",
                    null, "INTERNAL_ERROR");
        } finally {
            exchange.close();
        }
    }

    /* ---------------------------------------------------------------------
       API
       --------------------------------------------------------------------- */

    private void api(HttpExchange exchange) {
        String method = Http.method(exchange);
        String path = Http.path(exchange);

        if ("/api/health".equals(path)) {
            allow(method, "GET");
            Map<String, Object> payload = Json.object();
            payload.put("status", "ok");
            payload.put("app", "SmartSpend");
            payload.put("phase", Integer.parseInt(PHASE));
            payload.put("backend", "java");
            payload.put("auth", "session-cookie");
            payload.put("database", "sqlite");
            payload.put("time", Instant.now().toString());
            Http.sendJson(exchange, 200, payload);
            return;
        }

        String token = Http.cookie(exchange, SessionService.COOKIE_NAME);
        SessionService.Resolved resolved = sessions.resolve(token);

        if ("/api/auth/register".equals(path)) {
            allow(method, "POST");
            AuthService.AuthResult result = auth.register(Http.body(exchange),
                    Http.clientAddress(exchange), userAgent(exchange));
            Http.addHeader(exchange, "Set-Cookie", SessionService.cookieHeader(result.session()));
            Http.sendJson(exchange, 201, wrapUser(result.user()));
            return;
        }

        if ("/api/auth/login".equals(path)) {
            allow(method, "POST");
            AuthService.AuthResult result = auth.login(Http.body(exchange),
                    Http.clientAddress(exchange), userAgent(exchange));
            Http.addHeader(exchange, "Set-Cookie", SessionService.cookieHeader(result.session()));
            Http.sendJson(exchange, 200, wrapUser(result.user()));
            return;
        }

        if ("/api/auth/demo".equals(path)) {
            allow(method, "POST");
            AuthService.AuthResult result = auth.loginDemo(userAgent(exchange));
            Http.addHeader(exchange, "Set-Cookie", SessionService.cookieHeader(result.session()));
            Http.sendJson(exchange, 200, wrapUser(result.user()));
            return;
        }

        if ("/api/auth/logout".equals(path)) {
            allow(method, "POST");
            auth.logout(token);
            Http.addHeader(exchange, "Set-Cookie", SessionService.clearedCookieHeader());
            Http.sendJson(exchange, 200, ok());
            return;
        }

        if ("/api/auth/check-username".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, auth.checkUsername(Http.query(exchange).get("username")));
            return;
        }

        if ("/api/auth/check-email".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, auth.checkEmail(Http.query(exchange).get("email")));
            return;
        }

        if ("/api/auth/me".equals(path)) {
            allow(method, "GET");
            User user = requireUser(resolved);
            Http.sendJson(exchange, 200, wrapUser(user));
            return;
        }

        if ("/api/auth/session".equals(path)) {
            allow(method, "GET");
            Map<String, Object> payload = Json.object();
            if (resolved == null) {
                payload.put("session", null);
            } else {
                Map<String, Object> session = Json.object();
                session.put("signedInAt", resolved.signedInAt());
                session.put("expiresAt", resolved.expiresAt());
                session.put("remember", resolved.remember());
                payload.put("session", session);
            }
            Http.sendJson(exchange, 200, payload);
            return;
        }

        if ("/api/auth/change-password".equals(path)) {
            allow(method, "POST");
            User user = requireUser(resolved);
            Http.sendJson(exchange, 200, auth.changePassword(user.id(), Http.body(exchange)));
            return;
        }

        if ("/api/users/me".equals(path)) {
            allow(method, "PATCH", "PUT");
            User user = requireUser(resolved);
            Http.sendJson(exchange, 200, wrapUser(auth.updateProfile(user.id(), Http.body(exchange))));
            return;
        }

        User user = requireUser(resolved);
        financeApi.handle(user.id(), method, path, Http.query(exchange), exchange);
    }

    /* ---------------------------------------------------------------------
       Static frontend
       --------------------------------------------------------------------- */

    private void serveStatic(HttpExchange exchange, String path) throws IOException {
        String method = Http.method(exchange);
        boolean head = "HEAD".equals(method);
        if (!"GET".equals(method) && !head) {
            exchange.getResponseHeaders().set("Allow", "GET, HEAD");
            Http.sendText(exchange, 405, "Method not allowed", "text/plain; charset=UTF-8");
            return;
        }

        String target = path == null || path.isBlank() || "/".equals(path) ? "/index.html" : path;
        String relative = target.startsWith("/") ? target.substring(1) : target;
        Path candidate = root.resolve(relative).normalize();

        if (!candidate.startsWith(root)) {
            Http.sendText(exchange, 403, "Forbidden", "text/plain; charset=UTF-8");
            return;
        }
        if (Files.isDirectory(candidate)) {
            candidate = candidate.resolve("index.html");
        }
        if (!Files.isRegularFile(candidate)) {
            sendNotFound(exchange);
            return;
        }

        byte[] body = Files.readAllBytes(candidate);
        Headers headers = exchange.getResponseHeaders();
        Http.applySecurityHeaders(headers);
        headers.set("Content-Type", contentType(candidate.getFileName().toString()));
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        headers.set("Pragma", "no-cache");

        if (head) {
            exchange.sendResponseHeaders(200, -1);
            return;
        }
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(body);
        }
    }

    private static void sendNotFound(HttpExchange exchange) throws IOException {
        String body = """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>Page not found · SmartSpend</title>
                  <style>
                    :root { color-scheme: light dark; }
                    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
                           font-family: "Segoe UI", system-ui, sans-serif; background: #f4f5fb; color: #111827;
                           padding: 1.5rem; }
                    .card { max-width: 28rem; width: 100%; text-align: center; background: #fff;
                            border: 1px solid #e4e7ec; border-radius: 1.25rem; padding: 2rem;
                            box-shadow: 0 12px 28px -12px rgba(16,24,40,.16); }
                    .badge { display: inline-block; padding: .3rem .6rem; border-radius: 999px;
                             background: #eef0ff; color: #4338ca; font-size: .7rem; font-weight: 700;
                             letter-spacing: .08em; text-transform: uppercase; }
                    h1 { font-size: 1.5rem; margin: 1rem 0 .4rem; letter-spacing: -.03em; }
                    p { color: #667085; font-size: .9rem; line-height: 1.6; margin: 0 0 1.25rem; }
                    a { display: inline-block; padding: .7rem 1.1rem; border-radius: .8rem; text-decoration: none;
                        font-weight: 650; font-size: .88rem; color: #fff;
                        background: linear-gradient(135deg, #4f46e5, #8b5cf6); }
                    @media (prefers-color-scheme: dark) {
                      body { background: #070b16; color: #f2f4fa; }
                      .card { background: #0e1526; border-color: #202b45; }
                      .badge { background: rgba(99,102,241,.16); color: #c7d2fe; }
                      p { color: #919bb4; }
                    }
                  </style>
                </head>
                <body>
                  <div class="card">
                    <span class="badge">404 · Not found</span>
                    <h1>This page does not exist</h1>
                    <p>The address may be mistyped, or the file may have moved. Return to the SmartSpend sign-in screen to continue.</p>
                    <a href="/">Back to SmartSpend</a>
                  </div>
                </body>
                </html>
                """;
        Http.sendText(exchange, 404, body, "text/html; charset=UTF-8");
    }

    private static String contentType(String fileName) {
        String name = fileName.toLowerCase(Locale.ROOT);
        if (name.endsWith(".html") || name.endsWith(".htm")) return "text/html; charset=UTF-8";
        if (name.endsWith(".css")) return "text/css; charset=UTF-8";
        if (name.endsWith(".js")) return "text/javascript; charset=UTF-8";
        if (name.endsWith(".mjs")) return "text/javascript; charset=UTF-8";
        if (name.endsWith(".json")) return "application/json; charset=UTF-8";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".ico")) return "image/x-icon";
        if (name.endsWith(".woff2")) return "font/woff2";
        if (name.endsWith(".woff")) return "font/woff";
        if (name.endsWith(".txt") || name.endsWith(".md")) return "text/plain; charset=UTF-8";
        return "application/octet-stream";
    }

    /* ---------------------------------------------------------------------
       Helpers
       --------------------------------------------------------------------- */

    private User requireUser(SessionService.Resolved resolved) {
        if (resolved == null) {
            throw ApiException.unauthorised();
        }
        User user = auth.findById(resolved.userId());
        if (user == null) {
            throw ApiException.unauthorised();
        }
        return user;
    }

    private static Map<String, Object> wrapUser(User user) {
        Map<String, Object> payload = Json.object();
        payload.put("user", user.toPublicJson());
        return payload;
    }

    private static Map<String, Object> ok() {
        Map<String, Object> payload = Json.object();
        payload.put("ok", true);
        return payload;
    }

    private static void allow(String method, String... allowed) {
        for (String candidate : allowed) {
            if (candidate.equals(method)) {
                return;
            }
        }
        throw new ApiException(405, "Use " + String.join(" or ", allowed) + " for this endpoint.",
                null, "METHOD_NOT_ALLOWED");
    }

    private static String userAgent(HttpExchange exchange) {
        String agent = exchange.getRequestHeaders().getFirst("User-Agent");
        if (agent == null) {
            return "";
        }
        return agent.length() > 240 ? agent.substring(0, 240) : agent;
    }
}
