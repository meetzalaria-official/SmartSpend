package com.smartspend.finance;

import com.smartspend.auth.Validation;
import com.smartspend.db.Db;
import com.smartspend.json.Json;
import com.smartspend.server.ApiException;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.YearMonth;
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
 * Business logic for transactions, categories, budgets, goals, settings and
 * the dashboard overview. All data is scoped by the signed-in user id, and all
 * amounts are stored as integer cents.
 */
public final class FinanceService {

    private static final Set<String> CURRENCIES =
            Set.of("INR", "USD", "EUR", "GBP", "AED", "SGD");
    private static final Set<String> DATE_FORMATS =
            Set.of("DD MMM YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD");
    private static final Set<String> THEMES = Set.of("light", "dark", "system");

    private final Db db;

    public FinanceService(Db db) {
        this.db = db;
    }

    /* =====================================================================
       Dashboard overview
       ===================================================================== */

    public Map<String, Object> overview(String userId, String month) {
        String key = Validation.requireMonth(month);
        return db.read(connection -> {
            Map<String, Object> budget = buildBudget(connection, userId, key);
            List<Map<String, Object>> rows = transactionsInRange(connection, userId,
                    Rows.monthStart(key), Rows.monthEnd(key));
            rows.sort(Comparator
                    .comparing((Map<String, Object> row) -> String.valueOf(row.get("date"))).reversed()
                    .thenComparing(Comparator
                            .comparing((Map<String, Object> row) -> String.valueOf(row.get("createdAt"))).reversed()));

            Map<String, Object> result = Json.object();
            result.put("summary", Rows.summarize(rows));
            result.put("budget", budget);
            result.put("recent", rows.size() > 5 ? new ArrayList<>(rows.subList(0, 5)) : rows);
            return result;
        });
    }

    /* =====================================================================
       Transactions
       ===================================================================== */

    public List<Map<String, Object>> queryTransactions(String userId, Map<String, String> query) {
        String from = optionalDate(query.get("from"), "from");
        String to = optionalDate(query.get("to"), "to");
        String type = value(query.get("type"));
        String categoryId = value(query.get("categoryId"));
        boolean recurringOnly = "true".equalsIgnoreCase(value(query.get("recurringOnly")))
                || "1".equals(value(query.get("recurringOnly")));
        String search = value(query.get("search")).trim().toLowerCase(Locale.ROOT);
        String sort = value(query.get("sort"));

        StringBuilder sql = new StringBuilder("SELECT * FROM transactions WHERE user_id = ?");
        List<Object> parameters = new ArrayList<>();
        parameters.add(userId);
        if (from != null) {
            sql.append(" AND tx_date >= ?");
            parameters.add(from);
        }
        if (to != null) {
            sql.append(" AND tx_date <= ?");
            parameters.add(to);
        }
        if ("income".equals(type) || "expense".equals(type)) {
            sql.append(" AND type = ?");
            parameters.add(type);
        }
        if (!categoryId.isEmpty() && !"all".equals(categoryId)) {
            sql.append(" AND category_id = ?");
            parameters.add(categoryId);
        }
        if (recurringOnly) {
            sql.append(" AND recurring = 1");
        }
        if (!search.isEmpty()) {
            String like = "%" + search + "%";
            sql.append(" AND (lower(merchant) LIKE ? OR lower(note) LIKE ? OR lower(method) LIKE ? "
                    + "OR lower(type) LIKE ?)");
            parameters.add(like);
            parameters.add(like);
            parameters.add(like);
            parameters.add(like);
        }
        sql.append(orderBy(sort));

        return db.read(connection -> selectTransactions(connection, sql.toString(), parameters));
    }

    public Map<String, Object> getTransaction(String userId, String id) {
        return db.read(connection -> {
            Map<String, Object> row = findTransaction(connection, userId, id);
            if (row == null) {
                throw ApiException.notFound("That transaction no longer exists.");
            }
            return row;
        });
    }

    public Map<String, Object> createTransaction(String userId, Map<String, Object> payload) {
        return db.tx(connection -> {
            Map<String, Object> category = requireCategory(connection, userId, Json.text(payload, "categoryId"),
                    "categoryId");
            double amount = Json.number(payload, "amount", -1);
            if (!Double.isFinite(amount) || amount <= 0) {
                throw ApiException.badRequest("Enter an amount greater than zero.", "amount", "INVALID_AMOUNT");
            }
            long cents = Rows.cents(amount);
            if (cents <= 0) {
                throw ApiException.badRequest("Enter an amount greater than zero.", "amount", "INVALID_AMOUNT");
            }
            String date = dateOrToday(Json.text(payload, "date"));
            String type = "income".equals(Json.text(payload, "type")) ? "income" : "expense";
            String note = Rows.truncate(Json.text(payload, "note"), 240);
            String merchant = Json.text(payload, "merchant");
            if (merchant.isBlank()) {
                merchant = note.isBlank() ? String.valueOf(category.get("name")) : note;
            }
            merchant = Rows.truncate(merchant, 90);
            String method = Rows.truncate(Json.text(payload, "method", "UPI"), 40);
            boolean recurring = Json.bool(payload, "recurring", false);

            String id = Rows.newId("tx");
            String now = Rows.now();
            insertTransaction(connection, id, userId, type, cents, String.valueOf(category.get("id")),
                    date, merchant, note, method, recurring, now, now);

            if (recurring && Json.bool(payload, "queueNext", true)) {
                appendRecurring(connection, userId, id, type, cents,
                        String.valueOf(category.get("id")), merchant, note, method, date);
            }

            return Rows.transaction(id, type, cents, String.valueOf(category.get("id")),
                    date, merchant, note, method, recurring, now, now);
        });
    }

    public Map<String, Object> updateTransaction(String userId, String id, Map<String, Object> payload) {
        return db.tx(connection -> {
            Map<String, Object> existing = findTransaction(connection, userId, id);
            if (existing == null) {
                throw ApiException.notFound("That transaction no longer exists.");
            }
            String categoryId = payload.containsKey("categoryId")
                    ? Json.text(payload, "categoryId")
                    : String.valueOf(existing.get("categoryId"));
            Map<String, Object> category = requireCategory(connection, userId, categoryId, "categoryId");

            double amount = Json.number(payload, "amount", Rows.number(existing.get("amount")));
            if (!Double.isFinite(amount) || amount <= 0) {
                throw ApiException.badRequest("Enter an amount greater than zero.", "amount", "INVALID_AMOUNT");
            }
            long cents = Rows.cents(amount);
            if (cents <= 0) {
                throw ApiException.badRequest("Enter an amount greater than zero.", "amount", "INVALID_AMOUNT");
            }

            String date = payload.containsKey("date")
                    ? Validation.requireDate(Json.text(payload, "date"), "date")
                    : String.valueOf(existing.get("date"));
            String type = payload.containsKey("type")
                    ? ("income".equals(Json.text(payload, "type")) ? "income" : "expense")
                    : String.valueOf(existing.get("type"));
            String note = payload.containsKey("note")
                    ? Rows.truncate(Json.text(payload, "note"), 240)
                    : String.valueOf(existing.get("note"));
            String merchant = Json.text(payload, "merchant");
            if (merchant.isBlank()) {
                merchant = note.isBlank() ? String.valueOf(category.get("name")) : note;
            }
            merchant = Rows.truncate(merchant, 90);
            String method = payload.containsKey("method")
                    ? Rows.truncate(Json.text(payload, "method", "UPI"), 40)
                    : String.valueOf(existing.get("method"));
            boolean recurring = payload.containsKey("recurring")
                    ? Json.bool(payload, "recurring", false)
                    : Boolean.TRUE.equals(existing.get("recurring"));
            String now = Rows.now();
            String createdAt = String.valueOf(existing.get("createdAt"));

            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE transactions SET type = ?, amount_cents = ?, category_id = ?, tx_date = ?, merchant = ?, "
                            + "note = ?, method = ?, recurring = ?, updated_at = ? WHERE id = ? AND user_id = ?")) {
                statement.setString(1, type);
                statement.setLong(2, cents);
                statement.setString(3, categoryId);
                statement.setString(4, date);
                statement.setString(5, merchant);
                statement.setString(6, note);
                statement.setString(7, method);
                statement.setInt(8, recurring ? 1 : 0);
                statement.setString(9, now);
                statement.setString(10, id);
                statement.setString(11, userId);
                statement.executeUpdate();
            }

            return Rows.transaction(id, type, cents, categoryId, date, merchant, note, method,
                    recurring, createdAt, now);
        });
    }

    public Map<String, Object> deleteTransaction(String userId, String id) {
        return db.tx(connection -> {
            Map<String, Object> existing = findTransaction(connection, userId, id);
            if (existing == null) {
                throw ApiException.notFound("That transaction no longer exists.");
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "DELETE FROM transactions WHERE id = ? AND user_id = ?")) {
                statement.setString(1, id);
                statement.setString(2, userId);
                statement.executeUpdate();
            }
            Map<String, Object> state = readState(connection, userId);
            List<Object> lastDeleted = new ArrayList<>();
            lastDeleted.add(existing);
            state.put("lastDeleted", lastDeleted);
            removeFromRecurringQueue(state, Set.of(id));
            writeState(connection, userId, state);
            return existing;
        });
    }

    public int bulkDeleteTransactions(String userId, List<Object> rawIds) {
        Set<String> ids = new HashSet<>();
        for (Object raw : rawIds) {
            if (raw != null) {
                ids.add(String.valueOf(raw));
            }
        }
        if (ids.isEmpty()) {
            return 0;
        }
        return db.tx(connection -> {
            String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
            StringBuilder sql = new StringBuilder("SELECT * FROM transactions WHERE user_id = ? AND id IN (")
                    .append(placeholders).append(")");
            List<Object> parameters = new ArrayList<>();
            parameters.add(userId);
            parameters.addAll(ids);
            List<Map<String, Object>> rows = selectTransactions(connection, sql.toString(), parameters);
            if (rows.isEmpty()) {
                return 0;
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "DELETE FROM transactions WHERE user_id = ? AND id IN (" + placeholders + ")")) {
                statement.setString(1, userId);
                int index = 2;
                for (String id : ids) {
                    statement.setString(index++, id);
                }
                statement.executeUpdate();
            }
            Map<String, Object> state = readState(connection, userId);
            state.put("lastDeleted", new ArrayList<Object>(rows));
            removeFromRecurringQueue(state, ids);
            writeState(connection, userId, state);
            return rows.size();
        });
    }

    public int clearTransactions(String userId) {
        return db.tx(connection -> {
            int count;
            try (PreparedStatement countStatement = connection.prepareStatement(
                    "SELECT COUNT(*) FROM transactions WHERE user_id = ?")) {
                countStatement.setString(1, userId);
                try (ResultSet rows = countStatement.executeQuery()) {
                    count = rows.next() ? rows.getInt(1) : 0;
                }
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "DELETE FROM transactions WHERE user_id = ?")) {
                statement.setString(1, userId);
                statement.executeUpdate();
            }
            Map<String, Object> state = readState(connection, userId);
            state.put("lastDeleted", new ArrayList<>());
            state.put("recurringQueue", new ArrayList<>());
            writeState(connection, userId, state);
            return count;
        });
    }

    public int restoreLastDeleted(String userId) {
        return db.tx(connection -> {
            Map<String, Object> state = readState(connection, userId);
            List<Object> deleted = stateArray(state, "lastDeleted");
            if (deleted.isEmpty()) {
                return 0;
            }
            int restored = 0;
            for (Map<String, Object> row : Rows.maps(deleted)) {
                String id = Json.text(row, "id");
                if (id.isBlank() || findTransaction(connection, userId, id) != null) {
                    continue;
                }
                String categoryId = Json.text(row, "categoryId");
                Map<String, Object> category = findCategory(connection, userId, categoryId);
                if (category == null) {
                    category = firstCategory(connection, userId, Json.text(row, "type", "expense"));
                }
                if (category == null) {
                    continue;
                }
                try {
                    insertTransaction(connection, id, userId, Json.text(row, "type", "expense"),
                            Rows.cents(Json.number(row, "amount", 0)),
                            String.valueOf(category.get("id")),
                            Validation.requireDate(Json.text(row, "date"), "date"),
                            Json.text(row, "merchant"), Json.text(row, "note"), Json.text(row, "method", "UPI"),
                            Json.bool(row, "recurring", false),
                            Json.text(row, "createdAt", Rows.now()), Json.text(row, "updatedAt", Rows.now()));
                    restored += 1;
                } catch (ApiException | SQLException ignored) {
                    // Skip rows that no longer fit the current ledger.
                }
            }
            state.put("lastDeleted", new ArrayList<>());
            writeState(connection, userId, state);
            return restored;
        });
    }

    public int undoCount(String userId) {
        return db.read(connection -> stateArray(readState(connection, userId), "lastDeleted").size());
    }

    public Map<String, Object> recurringInfo(String userId) {
        return db.read(connection -> {
            List<Object> queue = stateArray(readState(connection, userId), "recurringQueue");
            String today = Rows.today();
            int due = 0;
            String next = null;
            for (Map<String, Object> item : Rows.maps(queue)) {
                String nextDate = Json.text(item, "nextDate");
                if (next == null) {
                    next = nextDate;
                }
                if (nextDate.compareTo(today) <= 0) {
                    due += 1;
                }
            }
            Map<String, Object> result = Json.object();
            result.put("total", queue.size());
            result.put("due", due);
            result.put("nextDate", next);
            return result;
        });
    }

    public int processRecurring(String userId) {
        return db.tx(connection -> {
            Map<String, Object> state = readState(connection, userId);
            List<Object> queue = stateArray(state, "recurringQueue");
            String today = Rows.today();
            int posted = 0;
            for (Map<String, Object> item : Rows.maps(queue)) {
                String nextDate = Json.text(item, "nextDate");
                if (nextDate.compareTo(today) > 0) {
                    continue;
                }
                Map<String, Object> payload = item.get("payload") instanceof Map<?, ?>
                        ? Json.requireObject(item.get("payload")) : Json.object();
                Map<String, Object> category = findCategory(connection, userId, Json.text(payload, "categoryId"));
                if (category == null) {
                    item.put("nextDate", Rows.advanceMonth(nextDate));
                    continue;
                }
                long cents = Rows.cents(Json.number(payload, "amount", 0));
                if (cents <= 0) {
                    item.put("nextDate", Rows.advanceMonth(nextDate));
                    continue;
                }
                String now = Rows.now();
                insertTransaction(connection, Rows.newId("tx"), userId,
                        "income".equals(Json.text(payload, "type")) ? "income" : "expense",
                        cents, String.valueOf(category.get("id")), nextDate,
                        Rows.truncate(Json.text(payload, "merchant", "Recurring transaction"), 90),
                        Rows.truncate(Json.text(payload, "note", "Recurring"), 240),
                        Rows.truncate(Json.text(payload, "method", "Auto-debit"), 40),
                        true, now, now);
                item.put("nextDate", Rows.advanceMonth(nextDate));
                posted += 1;
            }
            state.put("recurringQueue", new ArrayList<Object>(queue));
            writeState(connection, userId, state);
            return posted;
        });
    }

    /* =====================================================================
       Categories
       ===================================================================== */

    public List<Map<String, Object>> listCategories(String userId, String type) {
        return db.read(connection -> {
            String filter = "all".equals(type) || type == null || type.isBlank() ? null : type;
            StringBuilder sql = new StringBuilder("SELECT * FROM categories WHERE user_id = ?");
            List<Object> parameters = new ArrayList<>();
            parameters.add(userId);
            if ("income".equals(filter) || "expense".equals(filter)) {
                sql.append(" AND type = ?");
                parameters.add(filter);
            }
            sql.append(" ORDER BY lower(name) ASC");
            List<Map<String, Object>> result = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(sql.toString())) {
                Db.bind(statement, parameters.toArray());
                try (ResultSet rows = statement.executeQuery()) {
                    while (rows.next()) {
                        result.add(Rows.category(rows));
                    }
                }
            }
            return result;
        });
    }

    List<Map<String, Object>> listCategoriesFor(Connection connection, String userId) throws SQLException {
        List<Map<String, Object>> result = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM categories WHERE user_id = ? ORDER BY lower(name) ASC")) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    result.add(Rows.category(rows));
                }
            }
        }
        return result;
    }

    public Map<String, Object> createCategory(String userId, Map<String, Object> payload) {
        String name = Json.text(payload, "name").trim();
        if (name.length() < 2) {
            throw ApiException.badRequest("Use at least 2 characters for the category name.", "name",
                    "INVALID_CATEGORY_NAME");
        }
        if (name.length() > 32) {
            throw ApiException.badRequest("Keep the category name under 32 characters.", "name",
                    "INVALID_CATEGORY_NAME");
        }
        String type = "income".equals(Json.text(payload, "type")) ? "income" : "expense";
        String color = Json.text(payload, "color", "#6366f1");
        String icon = Json.text(payload, "icon", "tag");

        return db.tx(connection -> {
            if (categoryNameTaken(connection, userId, type, name, null)) {
                throw ApiException.conflict("A category with this name already exists.", "name",
                        "DUPLICATE_CATEGORY");
            }
            String id = Rows.newId("cat");
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO categories(id, user_id, name, type, color, icon, is_system, sort_order, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)")) {
                statement.setString(1, id);
                statement.setString(2, userId);
                statement.setString(3, name);
                statement.setString(4, type);
                statement.setString(5, color);
                statement.setString(6, icon);
                statement.setInt(7, nextCategoryOrder(connection, userId));
                statement.setString(8, Rows.now());
                statement.executeUpdate();
            }
            Map<String, Object> json = Json.object();
            json.put("id", id);
            json.put("name", name);
            json.put("type", type);
            json.put("color", color);
            json.put("icon", icon);
            json.put("system", false);
            return json;
        });
    }

    public Map<String, Object> updateCategory(String userId, String id, Map<String, Object> payload) {
        return db.tx(connection -> {
            Map<String, Object> existing = findCategory(connection, userId, id);
            if (existing == null) {
                throw ApiException.notFound("That category no longer exists.");
            }
            String name = payload.containsKey("name")
                    ? Json.text(payload, "name").trim()
                    : String.valueOf(existing.get("name"));
            if (name.length() < 2) {
                throw ApiException.badRequest("Use at least 2 characters for the category name.", "name",
                        "INVALID_CATEGORY_NAME");
            }
            if (name.length() > 32) {
                throw ApiException.badRequest("Keep the category name under 32 characters.", "name",
                        "INVALID_CATEGORY_NAME");
            }
            String type = String.valueOf(existing.get("type"));
            if (categoryNameTaken(connection, userId, type, name, id)) {
                throw ApiException.conflict("A category with this name already exists.", "name",
                        "DUPLICATE_CATEGORY");
            }
            String color = Json.text(payload, "color", String.valueOf(existing.get("color")));
            String icon = Json.text(payload, "icon", String.valueOf(existing.get("icon")));
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ? AND user_id = ?")) {
                statement.setString(1, name);
                statement.setString(2, color);
                statement.setString(3, icon);
                statement.setString(4, id);
                statement.setString(5, userId);
                statement.executeUpdate();
            }
            Map<String, Object> json = Json.object();
            json.put("id", id);
            json.put("name", name);
            json.put("type", type);
            json.put("color", color);
            json.put("icon", icon);
            json.put("system", Boolean.TRUE.equals(existing.get("system")));
            return json;
        });
    }

    public boolean deleteCategory(String userId, String id) {
        return db.tx(connection -> {
            Map<String, Object> existing = findCategory(connection, userId, id);
            if (existing == null) {
                throw ApiException.notFound("That category no longer exists.");
            }
            if (Boolean.TRUE.equals(existing.get("system"))) {
                throw ApiException.badRequest(
                        "This category cannot be deleted. Rename or recolour it instead.",
                        null, "SYSTEM_CATEGORY");
            }
            int usage = count(connection, "SELECT COUNT(*) FROM transactions WHERE user_id = ? AND category_id = ?",
                    userId, id);
            int budgets = count(connection, "SELECT COUNT(*) FROM budgets WHERE user_id = ? AND category_key = ?",
                    userId, id);
            if (usage > 0 || budgets > 0) {
                throw ApiException.badRequest(
                        "This category is used by " + usage + " transaction" + (usage == 1 ? "" : "s")
                                + " and " + budgets + " budget" + (budgets == 1 ? "" : "s")
                                + ". Move those entries first.",
                        null, "CATEGORY_IN_USE");
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "DELETE FROM categories WHERE id = ? AND user_id = ?")) {
                statement.setString(1, id);
                statement.setString(2, userId);
                statement.executeUpdate();
            }
            return true;
        });
    }

    public Map<String, Object> categoryUsage(String userId) {
        return db.read(connection -> {
            Map<String, Object> counts = Json.object();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT category_id, COUNT(*) AS total FROM transactions WHERE user_id = ? GROUP BY category_id")) {
                statement.setString(1, userId);
                try (ResultSet rows = statement.executeQuery()) {
                    while (rows.next()) {
                        counts.put(rows.getString("category_id"), rows.getInt("total"));
                    }
                }
            }
            return counts;
        });
    }

    /* =====================================================================
       Budgets
       ===================================================================== */

    public Map<String, Object> budgetForMonth(String userId, String month) {
        String key = Validation.requireMonth(month);
        return db.read(connection -> buildBudget(connection, userId, key));
    }

    public Map<String, Object> saveBudget(String userId, Map<String, Object> payload) {
        String month = Validation.requireMonth(Json.text(payload, "month"));
        String categoryId = Json.text(payload, "categoryId");
        double amount = Json.number(payload, "amount", -1);
        if (!Double.isFinite(amount) || amount < 0) {
            throw ApiException.badRequest("Enter a budget amount of zero or more.", "amount", "INVALID_AMOUNT");
        }
        long cents = Rows.cents(amount);
        String categoryKey = categoryId.isBlank() ? "" : categoryId;

        return db.tx(connection -> {
            if (!categoryKey.isEmpty()) {
                requireCategory(connection, userId, categoryKey, "categoryId");
            }
            String existingId = null;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT id FROM budgets WHERE user_id = ? AND month_key = ? AND category_key = ?")) {
                statement.setString(1, userId);
                statement.setString(2, month);
                statement.setString(3, categoryKey);
                try (ResultSet rows = statement.executeQuery()) {
                    if (rows.next()) {
                        existingId = rows.getString("id");
                    }
                }
            }
            if (existingId != null) {
                try (PreparedStatement statement = connection.prepareStatement(
                        "UPDATE budgets SET amount_cents = ? WHERE id = ? AND user_id = ?")) {
                    statement.setLong(1, cents);
                    statement.setString(2, existingId);
                    statement.setString(3, userId);
                    statement.executeUpdate();
                }
            } else if (cents > 0) {
                try (PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO budgets(id, user_id, month_key, category_key, amount_cents) VALUES (?, ?, ?, ?, ?)")) {
                    statement.setString(1, Rows.newId("bud"));
                    statement.setString(2, userId);
                    statement.setString(3, month);
                    statement.setString(4, categoryKey);
                    statement.setLong(5, cents);
                    statement.executeUpdate();
                }
            }
            return buildBudget(connection, userId, month);
        });
    }

    public boolean deleteBudget(String userId, String id) {
        db.execute("DELETE FROM budgets WHERE id = ? AND user_id = ?", id, userId);
        return true;
    }

    public int copyPreviousBudgets(String userId, String month) {
        String target = Validation.requireMonth(month);
        String source = Rows.addMonths(target, -1);
        return db.tx(connection -> {
            int created = 0;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT * FROM budgets WHERE user_id = ? AND month_key = ?")) {
                statement.setString(1, userId);
                statement.setString(2, source);
                try (ResultSet rows = statement.executeQuery()) {
                    while (rows.next()) {
                        String categoryKey = rows.getString("category_key");
                        long cents = rows.getLong("amount_cents");
                        try (PreparedStatement exists = connection.prepareStatement(
                                "SELECT 1 FROM budgets WHERE user_id = ? AND month_key = ? AND category_key = ?")) {
                            exists.setString(1, userId);
                            exists.setString(2, target);
                            exists.setString(3, categoryKey);
                            try (ResultSet check = exists.executeQuery()) {
                                if (check.next()) {
                                    continue;
                                }
                            }
                        }
                        try (PreparedStatement insert = connection.prepareStatement(
                                "INSERT INTO budgets(id, user_id, month_key, category_key, amount_cents) "
                                        + "VALUES (?, ?, ?, ?, ?)")) {
                            insert.setString(1, Rows.newId("bud"));
                            insert.setString(2, userId);
                            insert.setString(3, target);
                            insert.setString(4, categoryKey);
                            insert.setLong(5, cents);
                            insert.executeUpdate();
                        }
                        created += 1;
                    }
                }
            }
            return created;
        });
    }

    public List<String> budgetMonths(String userId) {
        return db.read(connection -> {
            List<String> months = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT DISTINCT month_key FROM budgets WHERE user_id = ? ORDER BY month_key DESC")) {
                statement.setString(1, userId);
                try (ResultSet rows = statement.executeQuery()) {
                    while (rows.next()) {
                        months.add(rows.getString(1));
                    }
                }
            }
            return months;
        });
    }

    Map<String, Object> buildBudget(Connection connection, String userId, String month) throws SQLException {
        Map<String, Map<String, Object>> categories = categoryMap(connection, userId);

        long totalSpent = 0;
        Map<String, Long> spentByCategory = new HashMap<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT category_id, SUM(amount_cents) AS spent FROM transactions WHERE user_id = ? "
                        + "AND type = 'expense' AND substr(tx_date, 1, 7) = ? GROUP BY category_id")) {
            statement.setString(1, userId);
            statement.setString(2, month);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    long spent = rows.getLong("spent");
                    spentByCategory.put(rows.getString("category_id"), spent);
                    totalSpent += spent;
                }
            }
        }

        String overallId = null;
        long totalAmount = 0;
        List<Map<String, Object>> categoryBudgets = new ArrayList<>();
        Set<String> budgeted = new HashSet<>();

        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM budgets WHERE user_id = ? AND month_key = ?")) {
            statement.setString(1, userId);
            statement.setString(2, month);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    String categoryKey = rows.getString("category_key");
                    long amountCents = rows.getLong("amount_cents");
                    if (categoryKey == null || categoryKey.isEmpty()) {
                        overallId = rows.getString("id");
                        totalAmount = amountCents;
                        continue;
                    }
                    Map<String, Object> category = categories.get(categoryKey);
                    if (category == null) {
                        continue;
                    }
                    budgeted.add(categoryKey);
                    long spent = spentByCategory.getOrDefault(categoryKey, 0L);
                    categoryBudgets.add(decorateBudgetEntry(rows.getString("id"), month, categoryKey,
                            amountCents, category, spent));
                }
            }
        }

        categoryBudgets.sort(Comparator.comparingDouble(
                (Map<String, Object> entry) -> Rows.number(entry.get("percent"))).reversed());

        List<Map<String, Object>> unbudgeted = new ArrayList<>();
        for (Map<String, Object> category : categories.values()) {
            if (!"expense".equals(category.get("type")) || budgeted.contains(category.get("id"))) {
                continue;
            }
            Map<String, Object> entry = Json.object();
            entry.put("id", category.get("id"));
            entry.put("name", category.get("name"));
            entry.put("color", category.get("color"));
            entry.put("icon", category.get("icon"));
            entry.put("spent", Rows.money(spentByCategory.getOrDefault(String.valueOf(category.get("id")), 0L)));
            unbudgeted.add(entry);
        }
        unbudgeted.sort(Comparator
                .comparingDouble((Map<String, Object> entry) -> Rows.number(entry.get("spent"))).reversed()
                .thenComparing(entry -> String.valueOf(entry.get("name"))));

        double percent = totalAmount > 0 ? (double) totalSpent / totalAmount * 100.0 : 0;
        Map<String, Object> total = Json.object();
        total.put("id", overallId);
        total.put("amount", Rows.money(totalAmount));
        total.put("spent", Rows.money(totalSpent));
        total.put("remaining", Rows.money(totalAmount - totalSpent));
        total.put("percent", Rows.round2(percent));
        total.put("progress", Math.min(100, Math.max(0, Rows.round2(percent))));
        total.put("status", Rows.statusFor(totalSpent, totalAmount));

        Map<String, Object> result = Json.object();
        result.put("month", month);
        result.put("total", total);
        result.put("categories", categoryBudgets);
        result.put("unbudgeted", unbudgeted);
        return result;
    }

    private Map<String, Object> decorateBudgetEntry(String id, String month, String categoryId, long amountCents,
                                                    Map<String, Object> category, long spentCents) {
        double amount = Rows.money(amountCents);
        double spent = Rows.money(spentCents);
        double percent = amount > 0 ? spent / amount * 100.0 : 0;
        Map<String, Object> entry = Json.object();
        entry.put("id", id);
        entry.put("month", month);
        entry.put("categoryId", categoryId);
        entry.put("categoryName", category.get("name"));
        entry.put("categoryColor", category.get("color"));
        entry.put("categoryIcon", category.get("icon"));
        entry.put("amount", amount);
        entry.put("spent", Rows.round2(spent));
        entry.put("remaining", Rows.round2(amount - spent));
        entry.put("percent", Rows.round2(percent));
        entry.put("progress", Math.min(100, Math.max(0, Rows.round2(percent))));
        entry.put("status", Rows.statusFor(spent, amount));
        return entry;
    }

    /* =====================================================================
       Goals
       ===================================================================== */

    public List<Map<String, Object>> listGoals(String userId) {
        return db.read(connection -> {
            List<Map<String, Object>> goals = goalsWithContributions(connection, userId);
            goals.forEach(this::decorateGoal);
            goals.sort((first, second) -> {
                String firstStatus = String.valueOf(first.get("status"));
                String secondStatus = String.valueOf(second.get("status"));
                if (!firstStatus.equals(secondStatus)) {
                    if ("completed".equals(firstStatus)) {
                        return 1;
                    }
                    if ("completed".equals(secondStatus)) {
                        return -1;
                    }
                }
                return String.valueOf(first.get("deadline")).compareTo(String.valueOf(second.get("deadline")));
            });
            return goals;
        });
    }

    public Map<String, Object> createGoal(String userId, Map<String, Object> payload) {
        String name = Json.text(payload, "name").trim();
        if (name.length() < 2) {
            throw ApiException.badRequest("Give your goal a name.", "name", "INVALID_GOAL_NAME");
        }
        if (name.length() > 42) {
            throw ApiException.badRequest("Keep the goal name under 42 characters.", "name", "INVALID_GOAL_NAME");
        }
        double target = Json.number(payload, "target", -1);
        if (!Double.isFinite(target) || target <= 0) {
            throw ApiException.badRequest("Enter a target greater than zero.", "target", "INVALID_TARGET");
        }
        double saved = Json.number(payload, "saved", 0);
        if (!Double.isFinite(saved) || saved < 0) {
            throw ApiException.badRequest("Starting saved amount cannot be negative.", "saved", "INVALID_AMOUNT");
        }
        String deadline = Validation.requireDate(Json.text(payload, "deadline"), "deadline");
        String color = Json.text(payload, "color", "#6366f1");
        String icon = Json.text(payload, "icon", "target");
        String note = Rows.truncate(Json.text(payload, "note"), 200);
        String id = Rows.newId("goal");
        String now = Rows.now();

        return db.tx(connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO goals(id, user_id, name, target_cents, saved_cents, deadline, color, icon, note, "
                            + "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
                statement.setString(1, id);
                statement.setString(2, userId);
                statement.setString(3, name);
                statement.setLong(4, Rows.cents(target));
                statement.setLong(5, Rows.cents(saved));
                statement.setString(6, deadline);
                statement.setString(7, color);
                statement.setString(8, icon);
                statement.setString(9, note);
                statement.setString(10, now);
                statement.setString(11, now);
                statement.executeUpdate();
            }
            List<Object> contributions = new ArrayList<>();
            if (saved > 0) {
                Map<String, Object> entry = insertContribution(connection, id, userId, Rows.cents(saved),
                        Rows.today(), "Starting amount");
                contributions.add(entry);
            }
            Map<String, Object> goal = Rows.goalRow(id, name, Rows.cents(target), Rows.cents(saved), deadline,
                    color, icon, note, now, now, contributions);
            return decorateGoal(goal);
        });
    }

    public Map<String, Object> updateGoal(String userId, String id, Map<String, Object> payload) {
        return db.tx(connection -> {
            Map<String, Object> existing = findGoal(connection, userId, id);
            if (existing == null) {
                throw ApiException.notFound("That goal no longer exists.");
            }
            String name = payload.containsKey("name")
                    ? Json.text(payload, "name").trim() : String.valueOf(existing.get("name"));
            if (name.length() < 2) {
                throw ApiException.badRequest("Give your goal a name.", "name", "INVALID_GOAL_NAME");
            }
            if (name.length() > 42) {
                throw ApiException.badRequest("Keep the goal name under 42 characters.", "name", "INVALID_GOAL_NAME");
            }
            double target = Json.number(payload, "target", Rows.number(existing.get("target")));
            if (!Double.isFinite(target) || target <= 0) {
                throw ApiException.badRequest("Enter a target greater than zero.", "target", "INVALID_TARGET");
            }
            String deadline = payload.containsKey("deadline")
                    ? Validation.requireDate(Json.text(payload, "deadline"), "deadline")
                    : String.valueOf(existing.get("deadline"));
            String color = Json.text(payload, "color", String.valueOf(existing.get("color")));
            String icon = Json.text(payload, "icon", String.valueOf(existing.get("icon")));
            String note = payload.containsKey("note")
                    ? Rows.truncate(Json.text(payload, "note"), 200) : String.valueOf(existing.get("note"));
            String now = Rows.now();
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE goals SET name = ?, target_cents = ?, deadline = ?, color = ?, icon = ?, note = ?, "
                            + "updated_at = ? WHERE id = ? AND user_id = ?")) {
                statement.setString(1, name);
                statement.setLong(2, Rows.cents(target));
                statement.setString(3, deadline);
                statement.setString(4, color);
                statement.setString(5, icon);
                statement.setString(6, note);
                statement.setString(7, now);
                statement.setString(8, id);
                statement.setString(9, userId);
                statement.executeUpdate();
            }
            Map<String, Object> goal = goalsWithContributions(connection, userId).stream()
                    .filter(item -> id.equals(item.get("id")))
                    .findFirst()
                    .orElseThrow(() -> ApiException.notFound("That goal no longer exists."));
            return decorateGoal(goal);
        });
    }

    public Map<String, Object> contributeToGoal(String userId, String id, Map<String, Object> payload) {
        double amount = Json.number(payload, "amount", -1);
        if (!Double.isFinite(amount) || amount <= 0) {
            throw ApiException.badRequest("Enter a contribution greater than zero.", "amount", "INVALID_AMOUNT");
        }
        long cents = Rows.cents(amount);
        if (cents <= 0) {
            throw ApiException.badRequest("Enter a contribution greater than zero.", "amount", "INVALID_AMOUNT");
        }
        String date = Json.text(payload, "date").isBlank()
                ? Rows.today() : Validation.requireDate(Json.text(payload, "date"), "date");
        String note = Rows.truncate(Json.text(payload, "note", "Contribution"), 120);

        return db.tx(connection -> {
            Map<String, Object> goal = findGoal(connection, userId, id);
            if (goal == null) {
                throw ApiException.notFound("That goal no longer exists.");
            }
            insertContribution(connection, id, userId, cents, date, note);
            long saved = Rows.cents(Rows.number(goal.get("saved"))) + cents;
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE goals SET saved_cents = ?, updated_at = ? WHERE id = ? AND user_id = ?")) {
                statement.setLong(1, saved);
                statement.setString(2, Rows.now());
                statement.setString(3, id);
                statement.setString(4, userId);
                statement.executeUpdate();
            }
            Map<String, Object> updated = goalsWithContributions(connection, userId).stream()
                    .filter(item -> id.equals(item.get("id")))
                    .findFirst()
                    .orElseThrow(() -> ApiException.notFound("That goal no longer exists."));
            return decorateGoal(updated);
        });
    }

    public boolean deleteGoal(String userId, String id) {
        return db.tx(connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "DELETE FROM goals WHERE id = ? AND user_id = ?")) {
                statement.setString(1, id);
                statement.setString(2, userId);
                if (statement.executeUpdate() == 0) {
                    throw ApiException.notFound("That goal no longer exists.");
                }
            }
            return true;
        });
    }

    public Map<String, Object> goalSummary(String userId) {
        List<Map<String, Object>> goals = listGoals(userId);
        double target = 0;
        double saved = 0;
        double remaining = 0;
        double monthlyNeeded = 0;
        int completed = 0;
        int active = 0;

        for (Map<String, Object> goal : goals) {
            target += Rows.number(goal.get("target"));
            saved += Rows.number(goal.get("saved"));
            remaining += Rows.number(goal.get("remaining"));
            if ("completed".equals(goal.get("status"))) {
                completed += 1;
            } else {
                active += 1;
                monthlyNeeded += Rows.number(goal.get("monthlyNeeded"));
            }
        }

        Map<String, Object> summary = Json.object();
        summary.put("count", goals.size());
        summary.put("active", active);
        summary.put("completed", completed);
        summary.put("target", Rows.round2(target));
        summary.put("saved", Rows.round2(saved));
        summary.put("remaining", Rows.round2(remaining));
        summary.put("monthlyNeeded", Rows.round2(monthlyNeeded));
        summary.put("goals", goals);
        return summary;
    }

    Map<String, Object> decorateGoal(Map<String, Object> goal) {
        double target = Rows.number(goal.get("target"));
        double saved = Rows.number(goal.get("saved"));
        double remaining = Math.max(0, target - saved);
        double percent = target > 0 ? Math.min(100, saved / target * 100.0) : 0;
        int daysLeft = Rows.daysBetween(Rows.today(), String.valueOf(goal.get("deadline")));
        int monthsLeft = Math.max(1, (int) Math.ceil(daysLeft / 30.0));
        boolean completed = target > 0 && saved >= target;

        goal.put("remaining", Rows.round2(remaining));
        goal.put("percent", Rows.round2(percent));
        goal.put("progress", Math.min(100, Math.max(0, Rows.round2(percent))));
        goal.put("daysLeft", daysLeft);
        goal.put("monthsLeft", monthsLeft);
        goal.put("monthlyNeeded", completed ? 0 : Rows.round2(remaining / monthsLeft));
        goal.put("status", completed ? "completed" : daysLeft < 0 ? "overdue" : "active");
        return goal;
    }

    List<Map<String, Object>> goalsWithContributions(Connection connection, String userId) throws SQLException {
        List<Map<String, Object>> goals = new ArrayList<>();
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM goals WHERE user_id = ? ORDER BY deadline ASC")) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    Map<String, Object> goal = Rows.goal(rows);
                    goals.add(goal);
                    byId.put(String.valueOf(goal.get("id")), goal);
                }
            }
        }
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM goal_contributions WHERE user_id = ? ORDER BY con_date ASC, created_at ASC")) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    Map<String, Object> goal = byId.get(rows.getString("goal_id"));
                    if (goal == null) {
                        continue;
                    }
                    @SuppressWarnings("unchecked")
                    List<Object> contributions = (List<Object>) goal.get("contributions");
                    contributions.add(Rows.contribution(rows));
                }
            }
        }
        return goals;
    }

    /* =====================================================================
       Settings
       ===================================================================== */

    public Map<String, Object> getSettings(String userId) {
        return db.read(connection -> {
            ensureSettingsRow(connection, userId);
            return settingsFromRow(connection, userId);
        });
    }

    public Map<String, Object> updateSettings(String userId, Map<String, Object> patch) {
        return db.tx(connection -> {
            ensureSettingsRow(connection, userId);
            Map<String, Object> current = settingsFromRow(connection, userId);

            String currency = Json.text(patch, "currency", String.valueOf(current.get("currency")));
            if (!CURRENCIES.contains(currency)) {
                currency = "INR";
            }
            String dateFormat = Json.text(patch, "dateFormat", String.valueOf(current.get("dateFormat")));
            if (!DATE_FORMATS.contains(dateFormat)) {
                dateFormat = "DD MMM YYYY";
            }
            String theme = Json.text(patch, "theme", String.valueOf(current.get("theme")));
            if (!THEMES.contains(theme)) {
                theme = "light";
            }
            String weekStart = Json.text(patch, "weekStart", String.valueOf(current.get("weekStart")));
            if (!"mon".equals(weekStart) && !"sun".equals(weekStart)) {
                weekStart = "mon";
            }
            int monthStart = (int) Math.min(28, Math.max(1,
                    Json.integer(patch, "monthStart", Math.round(Rows.number(current.get("monthStart"))))));
            String profileNote = Rows.truncate(Json.text(patch, "profileNote",
                    String.valueOf(current.get("profileNote"))), 500);
            double incomeTarget = Json.number(patch, "monthlyIncomeTarget",
                    Rows.number(current.get("monthlyIncomeTarget")));

            @SuppressWarnings("unchecked")
            Map<String, Object> currentNotifications = (Map<String, Object>) current.get("notifications");
            Map<String, Object> notifications = new LinkedHashMap<>(currentNotifications);
            if (patch.get("notifications") instanceof Map<?, ?> incoming) {
                Map<String, Object> typed = Json.requireObject(incoming);
                for (String key : List.of("budgetAlerts", "goalReminders", "weeklyDigest", "recurringReminders")) {
                    notifications.put(key, Json.bool(typed, key, Boolean.TRUE.equals(notifications.get(key))));
                }
            }

            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE user_settings SET currency = ?, date_format = ?, month_start = ?, week_start = ?, "
                            + "theme = ?, profile_note = ?, monthly_income_cents = ?, notify_budget_alerts = ?, "
                            + "notify_goal_reminders = ?, notify_weekly_digest = ?, notify_recurring_reminders = ?, "
                            + "updated_at = ? WHERE user_id = ?")) {
                statement.setString(1, currency);
                statement.setString(2, dateFormat);
                statement.setInt(3, monthStart);
                statement.setString(4, weekStart);
                statement.setString(5, theme);
                statement.setString(6, profileNote);
                statement.setLong(7, Rows.cents(incomeTarget));
                statement.setInt(8, Boolean.TRUE.equals(notifications.get("budgetAlerts")) ? 1 : 0);
                statement.setInt(9, Boolean.TRUE.equals(notifications.get("goalReminders")) ? 1 : 0);
                statement.setInt(10, Boolean.TRUE.equals(notifications.get("weeklyDigest")) ? 1 : 0);
                statement.setInt(11, Boolean.TRUE.equals(notifications.get("recurringReminders")) ? 1 : 0);
                statement.setString(12, Rows.now());
                statement.setString(13, userId);
                statement.executeUpdate();
            }
            return settingsFromRow(connection, userId);
        });
    }

    Map<String, Object> settingsFromRow(Connection connection, String userId) throws SQLException {
        Map<String, Object> settings = defaultSettings();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM user_settings WHERE user_id = ?")) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                if (rows.next()) {
                    settings.put("currency", rows.getString("currency"));
                    settings.put("dateFormat", rows.getString("date_format"));
                    settings.put("monthStart", rows.getInt("month_start"));
                    settings.put("weekStart", rows.getString("week_start"));
                    settings.put("theme", rows.getString("theme"));
                    settings.put("profileNote", rows.getString("profile_note"));
                    settings.put("monthlyIncomeTarget", Rows.money(rows.getLong("monthly_income_cents")));
                    Map<String, Object> notifications = Json.object();
                    notifications.put("budgetAlerts", rows.getInt("notify_budget_alerts") == 1);
                    notifications.put("goalReminders", rows.getInt("notify_goal_reminders") == 1);
                    notifications.put("weeklyDigest", rows.getInt("notify_weekly_digest") == 1);
                    notifications.put("recurringReminders", rows.getInt("notify_recurring_reminders") == 1);
                    settings.put("notifications", notifications);
                }
            }
        }
        return settings;
    }

    private Map<String, Object> defaultSettings() {
        Map<String, Object> settings = Json.object();
        settings.put("currency", "INR");
        settings.put("dateFormat", "DD MMM YYYY");
        settings.put("monthStart", 1);
        settings.put("weekStart", "mon");
        settings.put("theme", "light");
        settings.put("profileNote", "");
        settings.put("monthlyIncomeTarget", 0);
        Map<String, Object> notifications = Json.object();
        notifications.put("budgetAlerts", true);
        notifications.put("goalReminders", true);
        notifications.put("weeklyDigest", true);
        notifications.put("recurringReminders", true);
        settings.put("notifications", notifications);
        return settings;
    }

    private void ensureSettingsRow(Connection connection, String userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT OR IGNORE INTO user_settings(user_id, currency, date_format, month_start, week_start, "
                        + "theme, profile_note, monthly_income_cents, notify_budget_alerts, notify_goal_reminders, "
                        + "notify_weekly_digest, notify_recurring_reminders, updated_at) "
                        + "VALUES (?, 'INR', 'DD MMM YYYY', 1, 'mon', 'light', '', 0, 1, 1, 1, 1, ?)")) {
            statement.setString(1, userId);
            statement.setString(2, Rows.now());
            statement.executeUpdate();
        }
    }

    /* =====================================================================
       Shared helpers used by ReportService
       ===================================================================== */

    Map<String, Map<String, Object>> categoryMap(Connection connection, String userId) throws SQLException {
        Map<String, Map<String, Object>> map = new LinkedHashMap<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM categories WHERE user_id = ?")) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    Map<String, Object> category = Rows.category(rows);
                    map.put(String.valueOf(category.get("id")), category);
                }
            }
        }
        return map;
    }

    List<Map<String, Object>> transactionsInRange(Connection connection, String userId, String from, String to)
            throws SQLException {
        StringBuilder sql = new StringBuilder("SELECT * FROM transactions WHERE user_id = ?");
        List<Object> parameters = new ArrayList<>();
        parameters.add(userId);
        if (from != null) {
            sql.append(" AND tx_date >= ?");
            parameters.add(from);
        }
        if (to != null) {
            sql.append(" AND tx_date <= ?");
            parameters.add(to);
        }
        sql.append(" ORDER BY tx_date ASC, created_at ASC");
        return selectTransactions(connection, sql.toString(), parameters);
    }

    Map<String, Object> readState(Connection connection, String userId) throws SQLException {
        Map<String, Object> state = Json.object();
        state.put("readNotifications", new ArrayList<>());
        state.put("dismissedNotifications", new ArrayList<>());
        state.put("lastDeleted", new ArrayList<>());
        state.put("recurringQueue", new ArrayList<>());
        String seededAt = Rows.now();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM user_state WHERE user_id = ?")) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                if (rows.next()) {
                    seededAt = rows.getString("seeded_at");
                    state.put("readNotifications", parseList(rows.getString("read_notifications")));
                    state.put("dismissedNotifications", parseList(rows.getString("dismissed_notifications")));
                    state.put("lastDeleted", parseList(rows.getString("last_deleted")));
                    state.put("recurringQueue", parseList(rows.getString("recurring_queue")));
                }
            }
        }
        state.put("seededAt", seededAt);
        state.put("createdAt", seededAt);
        return state;
    }

    void writeState(Connection connection, String userId, Map<String, Object> state) throws SQLException {
        String seededAt = state.get("seededAt") == null ? Rows.now() : String.valueOf(state.get("seededAt"));
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO user_state(user_id, read_notifications, dismissed_notifications, last_deleted, "
                        + "recurring_queue, seeded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) "
                        + "ON CONFLICT(user_id) DO UPDATE SET read_notifications = excluded.read_notifications, "
                        + "dismissed_notifications = excluded.dismissed_notifications, "
                        + "last_deleted = excluded.last_deleted, recurring_queue = excluded.recurring_queue, "
                        + "updated_at = excluded.updated_at")) {
            statement.setString(1, userId);
            statement.setString(2, Json.stringify(stateArray(state, "readNotifications")));
            statement.setString(3, Json.stringify(stateArray(state, "dismissedNotifications")));
            statement.setString(4, Json.stringify(stateArray(state, "lastDeleted")));
            statement.setString(5, Json.stringify(stateArray(state, "recurringQueue")));
            statement.setString(6, seededAt);
            statement.setString(7, Rows.now());
            statement.executeUpdate();
        }
    }

    @SuppressWarnings("unchecked")
    List<Object> stateArray(Map<String, Object> state, String key) {
        Object value = state.get(key);
        if (value instanceof List<?> list) {
            return new ArrayList<Object>(list);
        }
        return new ArrayList<>();
    }

    /* =====================================================================
       SQL helpers
       ===================================================================== */

    private List<Map<String, Object>> selectTransactions(Connection connection, String sql, List<Object> parameters)
            throws SQLException {
        List<Map<String, Object>> result = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            Db.bind(statement, parameters.toArray());
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    result.add(Rows.transaction(rows));
                }
            }
        }
        return result;
    }

    private Map<String, Object> findTransaction(Connection connection, String userId, String id) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM transactions WHERE id = ? AND user_id = ?")) {
            statement.setString(1, id);
            statement.setString(2, userId);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? Rows.transaction(rows) : null;
            }
        }
    }

    private Map<String, Object> findCategory(Connection connection, String userId, String id) throws SQLException {
        if (id == null || id.isBlank()) {
            return null;
        }
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM categories WHERE id = ? AND user_id = ?")) {
            statement.setString(1, id);
            statement.setString(2, userId);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? Rows.category(rows) : null;
            }
        }
    }

    private Map<String, Object> requireCategory(Connection connection, String userId, String id, String field)
            throws SQLException {
        Map<String, Object> category = findCategory(connection, userId, id);
        if (category == null) {
            throw ApiException.badRequest("Choose a category for this transaction.", field, "INVALID_CATEGORY");
        }
        return category;
    }

    private Map<String, Object> firstCategory(Connection connection, String userId, String type) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM categories WHERE user_id = ? AND type = ? ORDER BY sort_order ASC LIMIT 1")) {
            statement.setString(1, userId);
            statement.setString(2, "income".equals(type) ? "income" : "expense");
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? Rows.category(rows) : null;
            }
        }
    }

    private Map<String, Object> findGoal(Connection connection, String userId, String id) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT * FROM goals WHERE id = ? AND user_id = ?")) {
            statement.setString(1, id);
            statement.setString(2, userId);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? Rows.goal(rows) : null;
            }
        }
    }

    private static boolean categoryNameTaken(Connection connection, String userId, String type, String name,
                                             String excludeId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT 1 FROM categories WHERE user_id = ? AND type = ? AND lower(name) = lower(?) "
                        + "AND id <> ?")) {
            statement.setString(1, userId);
            statement.setString(2, type);
            statement.setString(3, name);
            statement.setString(4, excludeId == null ? "" : excludeId);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next();
            }
        }
    }

    private static int nextCategoryOrder(Connection connection, String userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE user_id = ?")) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? rows.getInt(1) : 1;
            }
        }
    }

    private static int count(Connection connection, String sql, String userId, String value) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, userId);
            statement.setString(2, value);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? rows.getInt(1) : 0;
            }
        }
    }

    private static void insertTransaction(Connection connection, String id, String userId, String type, long cents,
                                          String categoryId, String date, String merchant, String note,
                                          String method, boolean recurring, String createdAt, String updatedAt)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO transactions(id, user_id, type, amount_cents, category_id, tx_date, merchant, note, "
                        + "method, recurring, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
            statement.setString(1, id);
            statement.setString(2, userId);
            statement.setString(3, "income".equals(type) ? "income" : "expense");
            statement.setLong(4, cents);
            statement.setString(5, categoryId);
            statement.setString(6, date);
            statement.setString(7, merchant);
            statement.setString(8, note);
            statement.setString(9, method);
            statement.setInt(10, recurring ? 1 : 0);
            statement.setString(11, createdAt);
            statement.setString(12, updatedAt);
            statement.executeUpdate();
        }
    }

    private Map<String, Object> insertContribution(Connection connection, String goalId, String userId, long cents,
                                                   String date, String note) throws SQLException {
        String id = Rows.newId("con");
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO goal_contributions(id, goal_id, user_id, amount_cents, con_date, note, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?)")) {
            statement.setString(1, id);
            statement.setString(2, goalId);
            statement.setString(3, userId);
            statement.setLong(4, cents);
            statement.setString(5, date);
            statement.setString(6, note);
            statement.setString(7, Rows.now());
            statement.executeUpdate();
        }
        Map<String, Object> entry = Json.object();
        entry.put("id", id);
        entry.put("amount", Rows.money(cents));
        entry.put("date", date);
        entry.put("note", note);
        return entry;
    }

    private void appendRecurring(Connection connection, String userId, String transactionId, String type, long cents,
                                 String categoryId, String merchant, String note, String method, String date)
            throws SQLException {
        Map<String, Object> state = readState(connection, userId);
        List<Object> queue = stateArray(state, "recurringQueue");
        Map<String, Object> payload = Json.object();
        payload.put("type", type);
        payload.put("amount", Rows.money(cents));
        payload.put("categoryId", categoryId);
        payload.put("merchant", merchant);
        payload.put("note", note);
        payload.put("method", method);
        payload.put("recurring", true);

        Map<String, Object> item = Json.object();
        item.put("id", Rows.newId("rec"));
        item.put("transactionId", transactionId);
        item.put("payload", payload);
        item.put("nextDate", Rows.advanceMonth(date));
        queue.add(item);
        state.put("recurringQueue", queue);
        writeState(connection, userId, state);
    }

    private static void removeFromRecurringQueue(Map<String, Object> state, Set<String> transactionIds) {
        List<Object> queue = new ArrayList<>();
        Object raw = state.get("recurringQueue");
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Object transactionId = map.get("transactionId");
                    if (transactionId != null && transactionIds.contains(String.valueOf(transactionId))) {
                        continue;
                    }
                }
                queue.add(item);
            }
        }
        state.put("recurringQueue", queue);
    }

    private static List<Object> parseList(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            Object value = Json.parse(json);
            if (value instanceof List<?> list) {
                return new ArrayList<Object>(list);
            }
        } catch (RuntimeException ignored) {
            // A corrupt state row should not take the whole account down.
        }
        return new ArrayList<>();
    }

    private static String orderBy(String sort) {
        return switch (sort == null ? "" : sort) {
            case "date-asc" -> " ORDER BY tx_date ASC, created_at ASC";
            case "amount-desc" -> " ORDER BY amount_cents DESC, tx_date DESC";
            case "amount-asc" -> " ORDER BY amount_cents ASC, tx_date DESC";
            case "description" -> " ORDER BY lower(COALESCE(NULLIF(merchant, ''), note)) ASC";
            default -> " ORDER BY tx_date DESC, created_at DESC";
        };
    }

    private static String optionalDate(String value, String field) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return Validation.requireDate(value, field);
    }

    private static String dateOrToday(String value) {
        if (value == null || value.isBlank()) {
            return Rows.today();
        }
        return Validation.requireDate(value, "date");
    }

    private static String value(String raw) {
        return raw == null ? "" : raw.trim();
    }

}
