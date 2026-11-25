package com.smartspend.server;

import com.smartspend.finance.FinanceService;
import com.smartspend.finance.ReportService;
import com.smartspend.json.Json;
import com.sun.net.httpserver.HttpExchange;

import java.util.List;
import java.util.Map;

/**
 * Routes the finance half of the REST API. The signed-in user id is resolved by
 * {@link ApiServer} before any method here runs, so every query is user-scoped.
 */
public final class FinanceApi {

    private final FinanceService finance;
    private final ReportService reports;

    public FinanceApi(FinanceService finance, ReportService reports) {
        this.finance = finance;
        this.reports = reports;
    }

    public void handle(String userId, String method, String path, Map<String, String> query,
                       HttpExchange exchange) {
        /* Dashboard ------------------------------------------------------- */
        if ("/api/overview".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, finance.overview(userId, query.get("month")));
            return;
        }

        /* Transactions ---------------------------------------------------- */
        if ("/api/transactions".equals(path)) {
            if ("GET".equals(method)) {
                Http.sendJson(exchange, 200, wrap("transactions", finance.queryTransactions(userId, query)));
                return;
            }
            if ("POST".equals(method)) {
                Http.sendJson(exchange, 201, wrap("transaction", finance.createTransaction(userId, Http.body(exchange))));
                return;
            }
            if ("DELETE".equals(method)) {
                Http.sendJson(exchange, 200, wrap("removed", finance.clearTransactions(userId)));
                return;
            }
            throw methodNotAllowed("GET, POST or DELETE");
        }
        if ("/api/transactions/bulk-delete".equals(path)) {
            allow(method, "POST");
            Map<String, Object> payload = Http.body(exchange);
            List<Object> ids = payload.get("ids") instanceof List<?> list
                    ? new java.util.ArrayList<Object>(list) : List.of();
            Http.sendJson(exchange, 200, wrap("removed", finance.bulkDeleteTransactions(userId, ids)));
            return;
        }
        if ("/api/transactions/restore-last".equals(path)) {
            allow(method, "POST");
            Http.sendJson(exchange, 200, wrap("restored", finance.restoreLastDeleted(userId)));
            return;
        }
        if ("/api/transactions/undo-count".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, wrap("count", finance.undoCount(userId)));
            return;
        }
        if ("/api/transactions/recurring-info".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, finance.recurringInfo(userId));
            return;
        }
        if ("/api/transactions/process-recurring".equals(path)) {
            allow(method, "POST");
            Http.sendJson(exchange, 200, wrap("posted", finance.processRecurring(userId)));
            return;
        }
        if (path.startsWith("/api/transactions/")) {
            String id = path.substring("/api/transactions/".length());
            if (!id.isEmpty() && !id.contains("/")) {
                if ("GET".equals(method)) {
                    Http.sendJson(exchange, 200, wrap("transaction", finance.getTransaction(userId, id)));
                    return;
                }
                if ("PATCH".equals(method) || "PUT".equals(method)) {
                    Http.sendJson(exchange, 200,
                            wrap("transaction", finance.updateTransaction(userId, id, Http.body(exchange))));
                    return;
                }
                if ("DELETE".equals(method)) {
                    Http.sendJson(exchange, 200,
                            wrap("transaction", finance.deleteTransaction(userId, id)));
                    return;
                }
                throw methodNotAllowed("GET, PATCH or DELETE");
            }
        }

        /* Categories ------------------------------------------------------ */
        if ("/api/categories".equals(path)) {
            if ("GET".equals(method)) {
                Http.sendJson(exchange, 200,
                        wrap("categories", finance.listCategories(userId, query.get("type"))));
                return;
            }
            if ("POST".equals(method)) {
                Http.sendJson(exchange, 201, wrap("category", finance.createCategory(userId, Http.body(exchange))));
                return;
            }
            throw methodNotAllowed("GET or POST");
        }
        if ("/api/categories/usage".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, finance.categoryUsage(userId));
            return;
        }
        if (path.startsWith("/api/categories/")) {
            String id = path.substring("/api/categories/".length());
            if (!id.isEmpty() && !id.contains("/")) {
                if ("PATCH".equals(method) || "PUT".equals(method)) {
                    Http.sendJson(exchange, 200,
                            wrap("category", finance.updateCategory(userId, id, Http.body(exchange))));
                    return;
                }
                if ("DELETE".equals(method)) {
                    finance.deleteCategory(userId, id);
                    Http.sendJson(exchange, 200, ok());
                    return;
                }
                throw methodNotAllowed("PATCH or DELETE");
            }
        }

        /* Budgets --------------------------------------------------------- */
        if ("/api/budgets".equals(path)) {
            if ("GET".equals(method)) {
                Http.sendJson(exchange, 200, wrap("budget", finance.budgetForMonth(userId, query.get("month"))));
                return;
            }
            if ("POST".equals(method) || "PUT".equals(method)) {
                Http.sendJson(exchange, 200, wrap("budget", finance.saveBudget(userId, Http.body(exchange))));
                return;
            }
            throw methodNotAllowed("GET, POST or PUT");
        }
        if ("/api/budgets/months".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, wrap("months", finance.budgetMonths(userId)));
            return;
        }
        if ("/api/budgets/copy-previous".equals(path)) {
            allow(method, "POST");
            Map<String, Object> payload = Http.body(exchange);
            Http.sendJson(exchange, 200, wrap("created", finance.copyPreviousBudgets(userId,
                    Json.text(payload, "month"))));
            return;
        }
        if (path.startsWith("/api/budgets/")) {
            String id = path.substring("/api/budgets/".length());
            if (!id.isEmpty() && !id.contains("/") && "DELETE".equals(method)) {
                finance.deleteBudget(userId, id);
                Http.sendJson(exchange, 200, ok());
                return;
            }
            if (!id.isEmpty() && !id.contains("/")) {
                throw methodNotAllowed("DELETE");
            }
        }

        /* Goals ----------------------------------------------------------- */
        if ("/api/goals".equals(path)) {
            if ("GET".equals(method)) {
                Http.sendJson(exchange, 200, wrap("goals", finance.listGoals(userId)));
                return;
            }
            if ("POST".equals(method)) {
                Http.sendJson(exchange, 201, wrap("goal", finance.createGoal(userId, Http.body(exchange))));
                return;
            }
            throw methodNotAllowed("GET or POST");
        }
        if ("/api/goals/summary".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, finance.goalSummary(userId));
            return;
        }
        if (path.startsWith("/api/goals/")) {
            String rest = path.substring("/api/goals/".length());
            if (rest.endsWith("/contributions")) {
                String id = rest.substring(0, rest.length() - "/contributions".length());
                if (!id.isEmpty() && !id.contains("/")) {
                    allow(method, "POST");
                    Http.sendJson(exchange, 200,
                            wrap("goal", finance.contributeToGoal(userId, id, Http.body(exchange))));
                    return;
                }
            }
            if (!rest.isEmpty() && !rest.contains("/")) {
                if ("PATCH".equals(method) || "PUT".equals(method)) {
                    Http.sendJson(exchange, 200,
                            wrap("goal", finance.updateGoal(userId, rest, Http.body(exchange))));
                    return;
                }
                if ("DELETE".equals(method)) {
                    finance.deleteGoal(userId, rest);
                    Http.sendJson(exchange, 200, ok());
                    return;
                }
                throw methodNotAllowed("PATCH or DELETE");
            }
        }

        /* Reports --------------------------------------------------------- */
        if ("/api/reports/overview".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200,
                    wrap("overview", reports.overview(userId, query.get("from"), query.get("to"))));
            return;
        }
        if ("/api/reports/by-category".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200,
                    wrap("categories", reports.byCategory(userId, query.get("from"), query.get("to"))));
            return;
        }
        if ("/api/reports/trend".equals(path)) {
            allow(method, "GET");
            int months = parseInt(query.get("months"), 6);
            Http.sendJson(exchange, 200,
                    wrap("months", reports.trend(userId, months, query.get("endMonth"))));
            return;
        }
        if ("/api/reports/top-merchants".equals(path)) {
            allow(method, "GET");
            int limit = parseInt(query.get("limit"), 6);
            Http.sendJson(exchange, 200,
                    wrap("merchants", reports.topMerchants(userId, query.get("from"), query.get("to"), limit)));
            return;
        }
        if ("/api/reports/monthly-counts".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, wrap("counts", reports.monthlyCounts(userId)));
            return;
        }

        /* Settings -------------------------------------------------------- */
        if ("/api/settings".equals(path)) {
            if ("GET".equals(method)) {
                Http.sendJson(exchange, 200, wrap("settings", finance.getSettings(userId)));
                return;
            }
            if ("PATCH".equals(method) || "PUT".equals(method)) {
                Http.sendJson(exchange, 200,
                        wrap("settings", finance.updateSettings(userId, Http.body(exchange))));
                return;
            }
            throw methodNotAllowed("GET or PATCH");
        }

        /* Notifications --------------------------------------------------- */
        if ("/api/notifications".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, wrap("notifications", reports.notifications(userId)));
            return;
        }
        if ("/api/notifications/read-all".equals(path)) {
            allow(method, "POST");
            Map<String, Object> payload = Http.body(exchange);
            List<Object> ids = payload.get("ids") instanceof List<?> list
                    ? new java.util.ArrayList<Object>(list) : List.of();
            Http.sendJson(exchange, 200, wrap("count", reports.markAllNotificationsRead(userId, ids)));
            return;
        }
        if (path.startsWith("/api/notifications/")) {
            String rest = path.substring("/api/notifications/".length());
            if (rest.endsWith("/read")) {
                String id = rest.substring(0, rest.length() - "/read".length());
                if (!id.isEmpty()) {
                    allow(method, "POST");
                    reports.markNotificationRead(userId, id);
                    Http.sendJson(exchange, 200, ok());
                    return;
                }
            }
            if (rest.endsWith("/dismiss")) {
                String id = rest.substring(0, rest.length() - "/dismiss".length());
                if (!id.isEmpty()) {
                    allow(method, "POST");
                    reports.dismissNotification(userId, id);
                    Http.sendJson(exchange, 200, ok());
                    return;
                }
            }
        }

        /* Backup / export ------------------------------------------------- */
        if ("/api/backup/json".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, reports.backupJson(userId));
            return;
        }
        if ("/api/backup/transactions.csv".equals(path)) {
            allow(method, "GET");
            Http.sendText(exchange, 200, reports.transactionsCsv(userId, query.get("from"), query.get("to")),
                    "text/csv; charset=UTF-8");
            return;
        }
        if ("/api/backup/import".equals(path)) {
            allow(method, "POST");
            Http.sendJson(exchange, 200, reports.importJson(userId, Http.body(exchange)));
            return;
        }
        if ("/api/backup/usage".equals(path)) {
            allow(method, "GET");
            Http.sendJson(exchange, 200, reports.usage(userId));
            return;
        }

        throw ApiException.notFound("Unknown API endpoint: " + path);
    }

    private static Map<String, Object> wrap(String key, Object value) {
        Map<String, Object> payload = Json.object();
        payload.put(key, value);
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
        throw methodNotAllowed(String.join(" or ", allowed));
    }

    private static ApiException methodNotAllowed(String allowed) {
        return new ApiException(405, "Use " + allowed + " for this endpoint.", null, "METHOD_NOT_ALLOWED");
    }

    private static int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException error) {
            return fallback;
        }
    }
}
