package com.smartspend.finance;

import com.smartspend.json.Json;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Shared value conversion for the finance layer: cents-to-money, row mappers
 * and date helpers that mirror {@code frontend/js/money.js}.
 */
public final class Rows {

    private Rows() {
    }

    public static long cents(double amount) {
        return Math.round(amount * 100.0);
    }

    public static double money(long cents) {
        return cents / 100.0;
    }

    public static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    public static String now() {
        return Instant.now().toString();
    }

    public static String today() {
        return LocalDate.now().toString();
    }

    public static String currentMonth() {
        return YearMonth.now().toString();
    }

    public static String monthOf(String date) {
        return date == null || date.length() < 7 ? "" : date.substring(0, 7);
    }

    public static String monthStart(String month) {
        return month + "-01";
    }

    public static String monthEnd(String month) {
        return YearMonth.parse(month).atEndOfMonth().toString();
    }

    public static String addMonths(String month, int delta) {
        return YearMonth.parse(month).plusMonths(delta).toString();
    }

    public static String addDays(String date, int delta) {
        return LocalDate.parse(date).plusDays(delta).toString();
    }

    public static String advanceMonth(String date) {
        LocalDate parsed = LocalDate.parse(date);
        YearMonth next = YearMonth.from(parsed).plusMonths(1);
        return next.atDay(Math.min(parsed.getDayOfMonth(), next.lengthOfMonth())).toString();
    }

    public static int daysBetween(String from, String to) {
        try {
            return (int) ChronoUnit.DAYS.between(LocalDate.parse(from), LocalDate.parse(to));
        } catch (DateTimeParseException error) {
            return 0;
        }
    }

    public static String statusFor(double spent, double amount) {
        if (amount <= 0) {
            return "unset";
        }
        double percent = spent / amount * 100.0;
        if (percent >= 100) {
            return "over";
        }
        if (percent >= 80) {
            return "warning";
        }
        return "ok";
    }

    public static String truncate(String value, int max) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    public static String newId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
    }

    /* ---------------------------------------------------------------------
       Row mappers
       --------------------------------------------------------------------- */

    public static Map<String, Object> transaction(ResultSet rows) throws SQLException {
        return transaction(
                rows.getString("id"),
                rows.getString("type"),
                rows.getLong("amount_cents"),
                rows.getString("category_id"),
                rows.getString("tx_date"),
                rows.getString("merchant"),
                rows.getString("note"),
                rows.getString("method"),
                rows.getInt("recurring") == 1,
                rows.getString("created_at"),
                rows.getString("updated_at")
        );
    }

    public static Map<String, Object> transaction(String id, String type, long amountCents, String categoryId,
                                                  String date, String merchant, String note, String method,
                                                  boolean recurring, String createdAt, String updatedAt) {
        Map<String, Object> json = Json.object();
        json.put("id", id);
        json.put("type", type);
        json.put("amount", money(amountCents));
        json.put("categoryId", categoryId);
        json.put("date", date);
        json.put("merchant", merchant == null ? "" : merchant);
        json.put("note", note == null ? "" : note);
        json.put("method", method == null ? "UPI" : method);
        json.put("recurring", recurring);
        json.put("createdAt", createdAt);
        json.put("updatedAt", updatedAt);
        return json;
    }

    public static Map<String, Object> category(ResultSet rows) throws SQLException {
        Map<String, Object> json = Json.object();
        json.put("id", rows.getString("id"));
        json.put("name", rows.getString("name"));
        json.put("type", rows.getString("type"));
        json.put("color", rows.getString("color"));
        json.put("icon", rows.getString("icon"));
        json.put("system", rows.getInt("is_system") == 1);
        return json;
    }

    public static Map<String, Object> goal(ResultSet rows) throws SQLException {
        Map<String, Object> json = Json.object();
        json.put("id", rows.getString("id"));
        json.put("name", rows.getString("name"));
        json.put("target", money(rows.getLong("target_cents")));
        json.put("saved", money(rows.getLong("saved_cents")));
        json.put("deadline", rows.getString("deadline"));
        json.put("color", rows.getString("color"));
        json.put("icon", rows.getString("icon"));
        json.put("note", rows.getString("note"));
        json.put("createdAt", rows.getString("created_at"));
        json.put("updatedAt", rows.getString("updated_at"));
        json.put("contributions", new ArrayList<>());
        return json;
    }

    public static Map<String, Object> goalRow(String id, String name, long targetCents, long savedCents,
                                              String deadline, String color, String icon, String note,
                                              String createdAt, String updatedAt, List<Object> contributions) {
        Map<String, Object> json = Json.object();
        json.put("id", id);
        json.put("name", name);
        json.put("target", money(targetCents));
        json.put("saved", money(savedCents));
        json.put("deadline", deadline);
        json.put("color", color);
        json.put("icon", icon);
        json.put("note", note == null ? "" : note);
        json.put("createdAt", createdAt);
        json.put("updatedAt", updatedAt);
        json.put("contributions", contributions);
        return json;
    }

    public static Map<String, Object> contribution(ResultSet rows) throws SQLException {
        Map<String, Object> json = Json.object();
        json.put("id", rows.getString("id"));
        json.put("amount", money(rows.getLong("amount_cents")));
        json.put("date", rows.getString("con_date"));
        json.put("note", rows.getString("note"));
        return json;
    }

    /* ---------------------------------------------------------------------
       Summaries
       --------------------------------------------------------------------- */

    public static Map<String, Object> summarize(List<Map<String, Object>> rows) {
        double income = 0;
        double expense = 0;
        int incomeCount = 0;
        int expenseCount = 0;
        Map<String, Object> biggest = null;
        Set<String> days = new LinkedHashSet<>();

        for (Map<String, Object> row : rows) {
            double amount = number(row.get("amount"));
            days.add(String.valueOf(row.get("date")));
            if ("income".equals(row.get("type"))) {
                income += amount;
                incomeCount += 1;
            } else {
                expense += amount;
                expenseCount += 1;
                if (biggest == null || amount > number(biggest.get("amount"))) {
                    biggest = row;
                }
            }
        }

        double net = income - expense;
        Map<String, Object> summary = Json.object();
        summary.put("income", round2(income));
        summary.put("expense", round2(expense));
        summary.put("net", round2(net));
        summary.put("savingsRate", income > 0 ? round2(net / income * 100.0) : 0);
        summary.put("count", rows.size());
        summary.put("incomeCount", incomeCount);
        summary.put("expenseCount", expenseCount);
        summary.put("activeDays", days.size());
        summary.put("biggest", biggest);
        return summary;
    }

    public static double number(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text) {
            try {
                return Double.parseDouble(text);
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return 0;
    }

    public static List<Map<String, Object>> maps(List<Object> raw) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : raw) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> typed = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    typed.put(String.valueOf(entry.getKey()), entry.getValue());
                }
                result.add(typed);
            }
        }
        return result;
    }
}
