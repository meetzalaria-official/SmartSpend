package com.smartspend.finance;

import com.smartspend.auth.Validation;
import com.smartspend.db.Db;
import com.smartspend.json.Json;
import com.smartspend.server.ApiException;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.text.NumberFormat;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Reports, notifications, CSV export and JSON backup/restore.
 */
public final class ReportService {

    private final Db db;
    private final FinanceService finance;

    public ReportService(Db db, FinanceService finance) {
        this.db = db;
        this.finance = finance;
    }

    /* =====================================================================
       Reports
       ===================================================================== */

    public Map<String, Object> overview(String userId, String from, String to) {
        String rangeFrom = optionalDate(from, "from");
        String rangeTo = optionalDate(to, "to");
        return db.read(connection -> {
            List<Map<String, Object>> rows = finance.transactionsInRange(connection, userId, rangeFrom, rangeTo);
            Map<String, Object> summary = Rows.summarize(rows);
            int activeDays = (int) Math.round(Rows.number(summary.get("activeDays")));
            int days = rangeFrom != null && rangeTo != null
                    ? Math.max(1, Rows.daysBetween(rangeFrom, rangeTo) + 1)
                    : Math.max(1, activeDays);
            double expense = Rows.number(summary.get("expense"));
            int expenseCount = (int) Math.round(Rows.number(summary.get("expenseCount")));
            summary.put("avgDaily", Rows.round2(expense / days));
            summary.put("avgTransaction", expenseCount > 0 ? Rows.round2(expense / expenseCount) : 0);
            Map<String, Object> range = Json.object();
            range.put("from", rangeFrom);
            range.put("to", rangeTo);
            summary.put("range", range);
            return summary;
        });
    }

    public List<Map<String, Object>> byCategory(String userId, String from, String to) {
        String rangeFrom = optionalDate(from, "from");
        String rangeTo = optionalDate(to, "to");
        return db.read(connection -> {
            Map<String, Map<String, Object>> categories = finance.categoryMap(connection, userId);
            List<Map<String, Object>> rows = finance.transactionsInRange(connection, userId, rangeFrom, rangeTo);

            Map<String, double[]> grouped = new LinkedHashMap<>();
            for (Map<String, Object> row : rows) {
                if (!"expense".equals(row.get("type"))) {
                    continue;
                }
                String key = Json.text(row, "categoryId");
                if (key.isEmpty()) {
                    key = "cat_other";
                }
                double[] value = grouped.computeIfAbsent(key, ignored -> new double[]{0, 0});
                value[0] += Rows.number(row.get("amount"));
                value[1] += 1;
            }
            double total = grouped.values().stream().mapToDouble(value -> value[0]).sum();

            List<Map<String, Object>> result = new ArrayList<>();
            for (Map.Entry<String, double[]> entry : grouped.entrySet()) {
                Map<String, Object> category = categories.get(entry.getKey());
                Map<String, Object> item = Json.object();
                item.put("categoryId", entry.getKey());
                item.put("name", category == null ? "Other" : category.get("name"));
                item.put("color", category == null ? "#64748b" : category.get("color"));
                item.put("icon", category == null ? "receipt" : category.get("icon"));
                item.put("total", Rows.round2(entry.getValue()[0]));
                item.put("count", (int) entry.getValue()[1]);
                item.put("percent", total > 0 ? Rows.round2(entry.getValue()[0] / total * 100.0) : 0);
                result.add(item);
            }
            result.sort(Comparator.comparingDouble(
                    (Map<String, Object> item) -> Rows.number(item.get("total"))).reversed());
            return result;
        });
    }

    public List<Map<String, Object>> trend(String userId, int monthCount, String endMonth) {
        String end = Validation.requireMonth(endMonth);
        int count = Math.max(1, Math.min(36, monthCount));
        List<String> months = new ArrayList<>();
        for (int index = count - 1; index >= 0; index -= 1) {
            months.add(Rows.addMonths(end, -index));
        }
        return db.read(connection -> {
            List<Map<String, Object>> result = new ArrayList<>();
            for (String month : months) {
                List<Map<String, Object>> rows = finance.transactionsInRange(connection, userId,
                        Rows.monthStart(month), Rows.monthEnd(month));
                Map<String, Object> summary = Rows.summarize(rows);
                Map<String, Object> item = Json.object();
                item.put("month", month);
                item.put("label", YearMonth.parse(month).getMonth()
                        .getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
                item.put("income", summary.get("income"));
                item.put("expense", summary.get("expense"));
                item.put("net", summary.get("net"));
                item.put("savingsRate", summary.get("savingsRate"));
                item.put("count", summary.get("count"));
                result.add(item);
            }
            return result;
        });
    }

    public List<Map<String, Object>> topMerchants(String userId, String from, String to, int limit) {
        String rangeFrom = optionalDate(from, "from");
        String rangeTo = optionalDate(to, "to");
        int max = Math.max(1, Math.min(50, limit <= 0 ? 6 : limit));
        return db.read(connection -> {
            List<Map<String, Object>> rows = finance.transactionsInRange(connection, userId, rangeFrom, rangeTo);
            Map<String, Map<String, Object>> grouped = new LinkedHashMap<>();
            for (Map<String, Object> row : rows) {
                if (!"expense".equals(row.get("type"))) {
                    continue;
                }
                String name = Json.text(row, "merchant", "Unknown").trim();
                String key = name.toLowerCase(Locale.ROOT);
                Map<String, Object> entry = grouped.get(key);
                if (entry == null) {
                    entry = Json.object();
                    entry.put("name", name);
                    entry.put("total", 0.0);
                    entry.put("count", 0);
                    entry.put("lastDate", Json.text(row, "date"));
                    grouped.put(key, entry);
                }
                entry.put("total", Rows.round2(Rows.number(entry.get("total")) + Rows.number(row.get("amount"))));
                entry.put("count", Math.round(Rows.number(entry.get("count"))) + 1);
                if (Json.text(row, "date").compareTo(Json.text(entry, "lastDate")) > 0) {
                    entry.put("lastDate", Json.text(row, "date"));
                }
            }
            List<Map<String, Object>> result = new ArrayList<>(grouped.values());
            result.sort(Comparator.comparingDouble(
                    (Map<String, Object> item) -> Rows.number(item.get("total"))).reversed());
            return result.size() > max ? new ArrayList<>(result.subList(0, max)) : result;
        });
    }

    public Map<String, Object> monthlyCounts(String userId) {
        return db.read(connection -> {
            Map<String, Object> counts = Json.object();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT substr(tx_date, 1, 7) AS month, COUNT(*) AS total FROM transactions "
                            + "WHERE user_id = ? GROUP BY month ORDER BY month ASC")) {
                statement.setString(1, userId);
                try (ResultSet rows = statement.executeQuery()) {
                    while (rows.next()) {
                        counts.put(rows.getString("month"), rows.getInt("total"));
                    }
                }
            }
            return counts;
        });
    }

    /* =====================================================================
       Notifications
       ===================================================================== */

    public List<Map<String, Object>> notifications(String userId) {
        return db.read(connection -> {
            Map<String, Object> settings = finance.settingsFromRow(connection, userId);
            Map<String, Object> prefs = settings.get("notifications") instanceof Map<?, ?>
                    ? Json.requireObject(settings.get("notifications")) : Json.object();
            String month = Rows.currentMonth();
            String monthEnd = Rows.monthEnd(month);
            String today = Rows.today();
            String money = currencySymbol(settings) + " ";

            List<Map<String, Object>> items = new ArrayList<>();

            if (Json.bool(prefs, "budgetAlerts", true)) {
                Map<String, Object> budget = finance.buildBudget(connection, userId, month);
                Map<String, Object> total = Json.requireObject(budget.get("total"));
                if ("over".equals(total.get("status"))) {
                    items.add(notification("budget:" + month + ":overall", "danger", "alert",
                            "Overall budget exceeded",
                            "You have spent " + formatMoney(money, Rows.number(total.get("spent")))
                                    + " of your " + formatMoney(money, Rows.number(total.get("amount")))
                                    + " budget for " + monthLabel(month) + ".",
                            "budgets.html?month=" + month, monthEnd + "T09:00:00", 0));
                }
                for (Map<String, Object> entry : Rows.maps(Json.requireArray(budget.get("categories")))) {
                    if ("over".equals(entry.get("status"))) {
                        items.add(notification("budget:" + month + ":" + entry.get("categoryId"), "danger",
                                "alert", entry.get("categoryName") + " budget exceeded",
                                formatMoney(money, Rows.number(entry.get("spent"))) + " spent against "
                                        + formatMoney(money, Rows.number(entry.get("amount")))
                                        + ". Review this category to get back on track.",
                                "budgets.html?month=" + month, monthEnd + "T08:00:00", 0));
                    } else if ("warning".equals(entry.get("status"))) {
                        items.add(notification("budget:" + month + ":" + entry.get("categoryId"), "warning",
                                "target", entry.get("categoryName") + " budget at "
                                        + Math.round(Rows.number(entry.get("percent"))) + "%",
                                formatMoney(money, Rows.number(entry.get("remaining")))
                                        + " left this month. Consider slowing down this category.",
                                "budgets.html?month=" + month, monthEnd + "T08:00:00", 1));
                    }
                }
            }

            if (Json.bool(prefs, "goalReminders", true)) {
                List<Map<String, Object>> goals = finance.goalsWithContributions(connection, userId);
                for (Map<String, Object> goal : goals) {
                    finance.decorateGoal(goal);
                    String status = String.valueOf(goal.get("status"));
                    if ("completed".equals(status)) {
                        items.add(notification("goal:" + goal.get("id") + ":complete", "success",
                                "check-circle", goal.get("name") + " is fully funded",
                                "You reached " + formatMoney(money, Rows.number(goal.get("target")))
                                        + ". Create a new goal when you are ready.",
                                "goals.html", today + "T07:00:00", 3));
                    } else {
                        int daysLeft = (int) Math.round(Rows.number(goal.get("daysLeft")));
                        if (daysLeft >= 0 && daysLeft <= 45 && Rows.number(goal.get("percent")) < 85) {
                            items.add(notification("goal:" + goal.get("id") + ":deadline", "warning",
                                    "piggy-bank", goal.get("name") + " needs attention",
                                    daysLeft + " day" + (daysLeft == 1 ? "" : "s") + " left. Save about "
                                            + formatMoney(money, Rows.number(goal.get("monthlyNeeded")))
                                            + " per month to finish on time.",
                                    "goals.html", today + "T07:00:00", 2));
                        }
                    }
                }
            }

            Map<String, Object> state = finance.readState(connection, userId);
            if (Json.bool(prefs, "recurringReminders", true)) {
                int due = 0;
                for (Map<String, Object> item : Rows.maps(finance.stateArray(state, "recurringQueue"))) {
                    if (Json.text(item, "nextDate").compareTo(today) <= 0) {
                        due += 1;
                    }
                }
                if (due > 0) {
                    items.add(notification("recurring:" + due + ":" + today, "info", "repeat",
                            due + " recurring transaction" + (due == 1 ? "" : "s") + " due",
                            "Open transactions to post the scheduled entries to your ledger.",
                            "transactions.html", today + "T06:00:00", 2));
                }
            }

            if (Json.bool(prefs, "weeklyDigest", true)) {
                List<Map<String, Object>> rows = finance.transactionsInRange(connection, userId,
                        Rows.monthStart(month), monthEnd);
                if (!rows.isEmpty()) {
                    Map<String, Object> summary = Rows.summarize(rows);
                    items.add(notification("digest:" + month + ":" + today, "info", "chart",
                            "This month at a glance",
                            summary.get("count") + " transactions · "
                                    + formatMoney(money, Rows.number(summary.get("expense"))) + " spent · "
                                    + formatMoney(money, Rows.number(summary.get("net"))) + " net.",
                            "reports.html", today + "T05:00:00", 4));
                }
            }

            String seededAt = Json.text(state, "seededAt", Rows.now());
            items.add(notification("welcome:" + seededAt, "info", "sparkles",
                    "Your demo workspace is ready",
                    "Explore every screen with realistic sample data, or reset it any time in Settings.",
                    "dashboard.html", seededAt, 5));

            Set<String> read = new HashSet<>(stringList(finance.stateArray(state, "readNotifications")));
            Set<String> dismissed = new HashSet<>(
                    stringList(finance.stateArray(state, "dismissedNotifications")));

            List<Map<String, Object>> result = new ArrayList<>();
            for (Map<String, Object> item : items) {
                String id = Json.text(item, "id");
                if (dismissed.contains(id)) {
                    continue;
                }
                item.put("read", read.contains(id));
                result.add(item);
            }
            result.sort((first, second) -> {
                int firstPriority = (int) Rows.number(first.get("priority"));
                int secondPriority = (int) Rows.number(second.get("priority"));
                if (firstPriority != secondPriority) {
                    return Integer.compare(firstPriority, secondPriority);
                }
                return Json.text(second, "createdAt").compareTo(Json.text(first, "createdAt"));
            });
            return result;
        });
    }

    public void markNotificationRead(String userId, String id) {
        db.tx(connection -> {
            Map<String, Object> state = finance.readState(connection, userId);
            List<Object> read = finance.stateArray(state, "readNotifications");
            if (!stringList(read).contains(id)) {
                read.add(id);
            }
            state.put("readNotifications", read);
            finance.writeState(connection, userId, state);
            return null;
        });
    }

    public int markAllNotificationsRead(String userId, List<Object> ids) {
        List<Object> target = new ArrayList<>();
        if (ids != null && !ids.isEmpty()) {
            target.addAll(ids);
        } else {
            for (Map<String, Object> item : notifications(userId)) {
                target.add(item.get("id"));
            }
        }
        return db.tx(connection -> {
            Map<String, Object> state = finance.readState(connection, userId);
            List<Object> read = finance.stateArray(state, "readNotifications");
            Set<String> merged = new HashSet<>(stringList(read));
            for (Object id : target) {
                merged.add(String.valueOf(id));
            }
            state.put("readNotifications", new ArrayList<Object>(merged));
            finance.writeState(connection, userId, state);
            return merged.size();
        });
    }

    public void dismissNotification(String userId, String id) {
        db.tx(connection -> {
            Map<String, Object> state = finance.readState(connection, userId);
            List<Object> dismissed = finance.stateArray(state, "dismissedNotifications");
            if (!stringList(dismissed).contains(id)) {
                dismissed.add(id);
            }
            state.put("dismissedNotifications", dismissed);
            List<Object> read = new ArrayList<>();
            for (Object item : finance.stateArray(state, "readNotifications")) {
                if (!id.equals(String.valueOf(item))) {
                    read.add(item);
                }
            }
            state.put("readNotifications", read);
            finance.writeState(connection, userId, state);
            return null;
        });
    }

    /* =====================================================================
       Backup and export
       ===================================================================== */

    public Map<String, Object> backupJson(String userId) {
        return db.read(connection -> {
            Map<String, Object> state = finance.readState(connection, userId);
            String seededAt = Json.text(state, "seededAt", Rows.now());

            Map<String, Object> data = Json.object();
            data.put("version", 1);
            data.put("userId", userId);
            data.put("seededAt", seededAt);
            data.put("updatedAt", Rows.now());
            Map<String, Object> profile = Json.object();
            profile.put("fullName", fullName(connection, userId));
            data.put("profile", profile);
            data.put("settings", finance.settingsFromRow(connection, userId));
            data.put("categories", finance.listCategoriesFor(connection, userId));
            data.put("transactions", finance.transactionsInRange(connection, userId, null, null));
            data.put("budgets", budgets(connection, userId));
            data.put("goals", finance.goalsWithContributions(connection, userId));
            data.put("notifications", new ArrayList<>());
            Map<String, Object> exportState = Json.object();
            exportState.put("readNotifications", finance.stateArray(state, "readNotifications"));
            exportState.put("dismissedNotifications", finance.stateArray(state, "dismissedNotifications"));
            exportState.put("lastDeleted", new ArrayList<>());
            exportState.put("recurringQueue", finance.stateArray(state, "recurringQueue"));
            exportState.put("createdAt", seededAt);
            data.put("state", exportState);

            Map<String, Object> backup = Json.object();
            backup.put("app", "SmartSpend");
            backup.put("format", "smartspend-backup");
            backup.put("version", 1);
            backup.put("exportedAt", Rows.now());
            backup.put("data", data);
            return backup;
        });
    }

    public String transactionsCsv(String userId, String from, String to) {
        String rangeFrom = optionalDate(from, "from");
        String rangeTo = optionalDate(to, "to");
        return db.read(connection -> {
            Map<String, Map<String, Object>> categories = finance.categoryMap(connection, userId);
            List<Map<String, Object>> rows = finance.transactionsInRange(connection, userId, rangeFrom, rangeTo);
            StringBuilder csv = new StringBuilder();
            csv.append("Date,Type,Category,Description,Merchant,Payment method,Amount,Notes\r\n");
            for (Map<String, Object> row : rows) {
                Map<String, Object> category = categories.get(Json.text(row, "categoryId"));
                String note = Json.text(row, "note");
                String merchant = Json.text(row, "merchant");
                String description = note.isEmpty() ? merchant : note;
                csv.append(csvValue(Json.text(row, "date"))).append(',')
                        .append(csvValue(Json.text(row, "type"))).append(',')
                        .append(csvValue(category == null ? "Other" : String.valueOf(category.get("name")))).append(',')
                        .append(csvValue(description)).append(',')
                        .append(csvValue(merchant)).append(',')
                        .append(csvValue(Json.text(row, "method"))).append(',')
                        .append(String.format(Locale.ROOT, "%.2f", Rows.number(row.get("amount")))).append(',')
                        .append(csvValue(note)).append("\r\n");
            }
            return csv.toString();
        });
    }

    public Map<String, Object> importJson(String userId, Map<String, Object> payload) {
        Map<String, Object> source = payload.get("data") instanceof Map<?, ?>
                ? Json.requireObject(payload.get("data")) : payload;

        List<Object> categories;
        List<Object> transactions;
        try {
            categories = Json.requireArray(source.get("categories"));
            transactions = Json.requireArray(source.get("transactions"));
        } catch (RuntimeException error) {
            throw ApiException.badRequest(
                    "This file is not a SmartSpend backup. Choose a JSON backup exported from Settings.",
                    null, "INVALID_BACKUP");
        }
        if (categories.isEmpty()) {
            throw ApiException.badRequest("The backup has no categories.", null, "INVALID_BACKUP");
        }
        List<Map<String, Object>> budgets = source.get("budgets") instanceof List<?> list
                ? Rows.maps(new ArrayList<Object>(list)) : new ArrayList<>();
        List<Map<String, Object>> goals = source.get("goals") instanceof List<?> list
                ? Rows.maps(new ArrayList<Object>(list)) : new ArrayList<>();

        int[] counts = db.tx(connection -> {
            for (String sql : new String[]{
                    "DELETE FROM transactions WHERE user_id = ?",
                    "DELETE FROM budgets WHERE user_id = ?",
                    "DELETE FROM goal_contributions WHERE user_id = ?",
                    "DELETE FROM goals WHERE user_id = ?",
                    "DELETE FROM categories WHERE user_id = ?"}) {
                try (PreparedStatement statement = connection.prepareStatement(sql)) {
                    statement.setString(1, userId);
                    statement.executeUpdate();
                }
            }

            Set<String> categoryIds = new HashSet<>();
            Map<String, String> fallbackByType = new HashMap<>();
            for (Map<String, Object> item : Rows.maps(categories)) {
                String id = Json.text(item, "id");
                String name = Rows.truncate(Json.text(item, "name"), 32);
                if (id.isBlank() || name.length() < 2) {
                    continue;
                }
                String type = "income".equals(Json.text(item, "type")) ? "income" : "expense";
                String color = Json.text(item, "color", "#6366f1");
                String icon = Json.text(item, "icon", "tag");
                try (PreparedStatement statement = connection.prepareStatement(
                        "INSERT OR IGNORE INTO categories(id, user_id, name, type, color, icon, is_system, "
                                + "sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
                    statement.setString(1, id);
                    statement.setString(2, userId);
                    statement.setString(3, name);
                    statement.setString(4, type);
                    statement.setString(5, color);
                    statement.setString(6, icon);
                    statement.setInt(7, Json.bool(item, "system", false) ? 1 : 0);
                    statement.setInt(8, categoryIds.size());
                    statement.setString(9, Rows.now());
                    if (statement.executeUpdate() > 0) {
                        categoryIds.add(id);
                        fallbackByType.putIfAbsent(type, id);
                    }
                }
            }
            if (categoryIds.isEmpty()) {
                throw ApiException.badRequest("The backup has no usable categories.", null, "INVALID_BACKUP");
            }

            int importedTransactions = 0;
            for (Map<String, Object> item : Rows.maps(transactions)) {
                String id = Json.text(item, "id");
                String date = Json.text(item, "date");
                double amount = Json.number(item, "amount", 0);
                if (id.isBlank() || !Validation.isIsoDate(date) || Rows.cents(amount) <= 0) {
                    continue;
                }
                String type = "income".equals(Json.text(item, "type")) ? "income" : "expense";
                String categoryId = Json.text(item, "categoryId");
                if (!categoryIds.contains(categoryId)) {
                    categoryId = fallbackByType.get(type);
                }
                if (categoryId == null) {
                    continue;
                }
                try (PreparedStatement statement = connection.prepareStatement(
                        "INSERT OR IGNORE INTO transactions(id, user_id, type, amount_cents, category_id, tx_date, "
                                + "merchant, note, method, recurring, created_at, updated_at) "
                                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
                    statement.setString(1, id);
                    statement.setString(2, userId);
                    statement.setString(3, type);
                    statement.setLong(4, Rows.cents(amount));
                    statement.setString(5, categoryId);
                    statement.setString(6, date);
                    statement.setString(7, Rows.truncate(Json.text(item, "merchant", "Imported"), 90));
                    statement.setString(8, Rows.truncate(Json.text(item, "note"), 240));
                    statement.setString(9, Rows.truncate(Json.text(item, "method", "UPI"), 40));
                    statement.setInt(10, Json.bool(item, "recurring", false) ? 1 : 0);
                    statement.setString(11, Json.text(item, "createdAt", Rows.now()));
                    statement.setString(12, Json.text(item, "updatedAt", Rows.now()));
                    importedTransactions += statement.executeUpdate();
                }
            }

            for (Map<String, Object> item : budgets) {
                String month = Json.text(item, "month");
                if (!month.matches("^\\d{4}-(0[1-9]|1[0-2])$")) {
                    continue;
                }
                String categoryKey = Json.text(item, "categoryId");
                if (!categoryKey.isEmpty() && !categoryIds.contains(categoryKey)) {
                    categoryKey = "";
                }
                long cents = Rows.cents(Json.number(item, "amount", 0));
                if (cents < 0) {
                    continue;
                }
                try (PreparedStatement statement = connection.prepareStatement(
                        "INSERT OR IGNORE INTO budgets(id, user_id, month_key, category_key, amount_cents) "
                                + "VALUES (?, ?, ?, ?, ?)")) {
                    statement.setString(1, Rows.newId("bud"));
                    statement.setString(2, userId);
                    statement.setString(3, month);
                    statement.setString(4, categoryKey);
                    statement.setLong(5, cents);
                    statement.executeUpdate();
                }
            }

            int importedGoals = 0;
            for (Map<String, Object> item : goals) {
                String id = Json.text(item, "id");
                String deadline = Json.text(item, "deadline");
                double target = Json.number(item, "target", 0);
                if (id.isBlank() || !Validation.isIsoDate(deadline) || Rows.cents(target) <= 0) {
                    continue;
                }
                double saved = Math.max(0, Json.number(item, "saved", 0));
                String now = Rows.now();
                try (PreparedStatement statement = connection.prepareStatement(
                        "INSERT OR IGNORE INTO goals(id, user_id, name, target_cents, saved_cents, deadline, color, "
                                + "icon, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
                    statement.setString(1, id);
                    statement.setString(2, userId);
                    statement.setString(3, Rows.truncate(Json.text(item, "name", "Imported goal"), 42));
                    statement.setLong(4, Rows.cents(target));
                    statement.setLong(5, Rows.cents(saved));
                    statement.setString(6, deadline);
                    statement.setString(7, Json.text(item, "color", "#6366f1"));
                    statement.setString(8, Json.text(item, "icon", "target"));
                    statement.setString(9, Rows.truncate(Json.text(item, "note"), 200));
                    statement.setString(10, Json.text(item, "createdAt", now));
                    statement.setString(11, Json.text(item, "updatedAt", now));
                    if (statement.executeUpdate() == 0) {
                        continue;
                    }
                }
                importedGoals += 1;

                List<Map<String, Object>> contributions = item.get("contributions") instanceof List<?> list
                        ? Rows.maps(new ArrayList<Object>(list)) : new ArrayList<>();
                if (contributions.isEmpty() && saved > 0) {
                    insertContribution(connection, id, userId, Rows.cents(saved), Rows.today(), "Starting amount");
                } else {
                    for (Map<String, Object> entry : contributions) {
                        double amount = Json.number(entry, "amount", 0);
                        String date = Json.text(entry, "date");
                        if (Rows.cents(amount) <= 0) {
                            continue;
                        }
                        insertContribution(connection, id, userId, Rows.cents(amount),
                                Validation.isIsoDate(date) ? date : Rows.today(),
                                Rows.truncate(Json.text(entry, "note", "Contribution"), 120));
                    }
                }
            }

            Map<String, Object> current = finance.readState(connection, userId);
            Map<String, Object> importedState = source.get("state") instanceof Map<?, ?>
                    ? Json.requireObject(source.get("state")) : Json.object();
            Map<String, Object> state = Json.object();
            state.put("seededAt", Json.text(importedState, "seededAt",
                    Json.text(current, "seededAt", Rows.now())));
            state.put("readNotifications", safeArray(importedState.get("readNotifications")));
            state.put("dismissedNotifications", safeArray(importedState.get("dismissedNotifications")));
            state.put("lastDeleted", new ArrayList<>());
            state.put("recurringQueue", safeArray(importedState.get("recurringQueue")));
            finance.writeState(connection, userId, state);

            return new int[]{importedTransactions, categoryIds.size(), importedGoals};
        });

        if (source.get("settings") instanceof Map<?, ?> incomingSettings) {
            finance.updateSettings(userId, Json.requireObject(incomingSettings));
        }

        Map<String, Object> result = Json.object();
        result.put("transactions", counts[0]);
        result.put("categories", counts[1]);
        result.put("goals", counts[2]);
        return result;
    }

    public Map<String, Object> usage(String userId) {
        Map<String, Object> backup = backupJson(userId);
        int bytes = Json.stringify(backup).getBytes(StandardCharsets.UTF_8).length;
        return db.read(connection -> {
            Map<String, Object> result = Json.object();
            result.put("bytes", bytes);
            result.put("transactions", countRows(connection,
                    "SELECT COUNT(*) FROM transactions WHERE user_id = ?", userId));
            result.put("categories", countRows(connection,
                    "SELECT COUNT(*) FROM categories WHERE user_id = ?", userId));
            result.put("budgets", countRows(connection,
                    "SELECT COUNT(*) FROM budgets WHERE user_id = ?", userId));
            result.put("goals", countRows(connection,
                    "SELECT COUNT(*) FROM goals WHERE user_id = ?", userId));
            return result;
        });
    }

    public void resetDemo(String userId) {
        finance.resetDemo(userId);
    }

    /* =====================================================================
       Helpers
       ===================================================================== */

    private static Map<String, Object> notification(String id, String tone, String icon, String title,
                                                     String message, String link, String createdAt, int priority) {
        Map<String, Object> item = Json.object();
        item.put("id", id);
        item.put("tone", tone);
        item.put("icon", icon);
        item.put("title", title);
        item.put("message", message);
        item.put("link", link);
        item.put("createdAt", createdAt);
        item.put("priority", priority);
        return item;
    }

    private static String monthLabel(String month) {
        YearMonth parsed = YearMonth.parse(month);
        return parsed.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH) + " " + parsed.getYear();
    }

    private static String currencySymbol(Map<String, Object> settings) {
        String code = Json.text(settings, "currency", "INR");
        return switch (code) {
            case "USD" -> "$";
            case "EUR" -> "€";
            case "GBP" -> "£";
            case "AED" -> "د.إ";
            case "SGD" -> "S$";
            default -> "₹";
        };
    }

    private static String formatMoney(String prefix, double amount) {
        NumberFormat format = NumberFormat.getNumberInstance(Locale.US);
        format.setMaximumFractionDigits(0);
        format.setMinimumFractionDigits(0);
        return prefix + format.format(amount);
    }

    private List<Object> budgets(Connection connection, String userId) throws SQLException {
        List<Object> result = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM budgets WHERE user_id = ? ORDER BY month_key ASC")) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    Map<String, Object> entry = Json.object();
                    entry.put("id", rows.getString("id"));
                    entry.put("month", rows.getString("month_key"));
                    String category = rows.getString("category_key");
                    entry.put("categoryId", category == null || category.isEmpty() ? null : category);
                    entry.put("amount", Rows.money(rows.getLong("amount_cents")));
                    result.add(entry);
                }
            }
        }
        return result;
    }

    private static String fullName(Connection connection, String userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT full_name FROM users WHERE id = ?")) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? rows.getString(1) : "SmartSpend user";
            }
        }
    }

    private static int countRows(Connection connection, String sql, String userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? rows.getInt(1) : 0;
            }
        }
    }

    private static void insertContribution(Connection connection, String goalId, String userId, long cents,
                                           String date, String note) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO goal_contributions(id, goal_id, user_id, amount_cents, con_date, note, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?)")) {
            statement.setString(1, Rows.newId("con"));
            statement.setString(2, goalId);
            statement.setString(3, userId);
            statement.setLong(4, cents);
            statement.setString(5, date);
            statement.setString(6, note);
            statement.setString(7, Rows.now());
            statement.executeUpdate();
        }
    }

    private static List<Object> safeArray(Object value) {
        if (value instanceof List<?> list) {
            return new ArrayList<Object>(list);
        }
        return new ArrayList<>();
    }

    private static List<String> stringList(List<Object> values) {
        List<String> result = new ArrayList<>();
        for (Object value : values) {
            if (value != null) {
                result.add(String.valueOf(value));
            }
        }
        return result;
    }

    private static String csvValue(String value) {
        String text = value == null ? "" : value;
        if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) {
            return "\"" + text.replace("\"", "\"\"") + "\"";
        }
        return text;
    }

    private static String optionalDate(String value, String field) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return Validation.requireDate(value, field);
    }
}
