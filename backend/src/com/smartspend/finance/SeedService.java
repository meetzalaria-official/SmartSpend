package com.smartspend.finance;

import com.smartspend.json.Json;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/**
 * Creates the realistic starter workspace the browser demo used to generate.
 * A deterministic RNG seeded from the user id keeps every account reproducible
 * while still giving each user a different ledger.
 */
public final class SeedService {

    private record Category(
            String id, String name, String type, String color, String icon, long budgetRupees) {
    }

    private static final List<Category> CATEGORIES = List.of(
            new Category("cat_food", "Food & Dining", "expense", "#f97316", "coffee", 8_000),
            new Category("cat_groceries", "Groceries", "expense", "#16a34a", "shopping-bag", 12_000),
            new Category("cat_rent", "Rent & Housing", "expense", "#6366f1", "home", 22_000),
            new Category("cat_transport", "Transport", "expense", "#0ea5e9", "car", 3_500),
            new Category("cat_utilities", "Utilities", "expense", "#eab308", "zap", 4_500),
            new Category("cat_shopping", "Shopping", "expense", "#ec4899", "tag", 6_000),
            new Category("cat_entertainment", "Entertainment", "expense", "#8b5cf6", "play", 3_000),
            new Category("cat_health", "Health & Fitness", "expense", "#ef4444", "heart", 2_500),
            new Category("cat_education", "Education", "expense", "#14b8a6", "book", 3_000),
            new Category("cat_subscriptions", "Subscriptions", "expense", "#a855f7", "repeat", 1_500),
            new Category("cat_travel", "Travel", "expense", "#84cc16", "globe", 5_000),
            new Category("cat_other", "Other", "expense", "#64748b", "receipt", 2_000),
            new Category("cat_salary", "Salary", "income", "#0f9d76", "briefcase", 0),
            new Category("cat_freelance", "Freelance", "income", "#2563eb", "laptop", 0),
            new Category("cat_investments", "Investments", "income", "#eab308", "trending-up", 0),
            new Category("cat_gifts", "Gifts", "income", "#f43f5e", "gift", 0),
            new Category("cat_income_other", "Other income", "income", "#64748b", "wallet", 0)
    );

    private static final Map<String, List<String>> MERCHANTS = Map.ofEntries(
            Map.entry("cat_food", List.of("Swiggy", "Zomato", "Cafe Coffee Day", "Pizza Hut", "Chai Point", "Local Dhaba")),
            Map.entry("cat_groceries", List.of("BigBasket", "DMart", "Reliance Fresh", "Zepto", "Local Kirana", "Blinkit")),
            Map.entry("cat_rent", List.of("Landlord", "Society Maintenance")),
            Map.entry("cat_transport", List.of("Uber", "Ola", "Metro Card", "Rapido", "Indian Oil")),
            Map.entry("cat_utilities", List.of("Airtel", "Jio", "BESCOM", "Water Board", "ACT Fibernet")),
            Map.entry("cat_shopping", List.of("Amazon", "Flipkart", "Myntra", "Decathlon", "Croma")),
            Map.entry("cat_entertainment", List.of("BookMyShow", "PVR Cinemas", "Steam", "Gaming Zone")),
            Map.entry("cat_health", List.of("Apollo Pharmacy", "Practo", "Cult.fit", "1mg")),
            Map.entry("cat_education", List.of("Udemy", "Coursera", "Campus Books", "Stationery Mart")),
            Map.entry("cat_subscriptions", List.of("Netflix", "Spotify", "Google One", "iCloud")),
            Map.entry("cat_travel", List.of("IRCTC", "MakeMyTrip", "IndiGo", "OYO", "RedBus")),
            Map.entry("cat_other", List.of("ATM Withdrawal", "Miscellaneous", "Local Shop")),
            Map.entry("cat_salary", List.of("Acme Technologies")),
            Map.entry("cat_freelance", List.of("Design client", "Freelance project", "Consulting call")),
            Map.entry("cat_investments", List.of("Mutual fund dividend", "Bank interest", "Stock dividend")),
            Map.entry("cat_gifts", List.of("Family gift", "Birthday gift", "Cashback reward")),
            Map.entry("cat_income_other", List.of("Refund", "Reimbursement", "Other credit"))
    );

    private static final Map<String, List<String>> NOTES = Map.ofEntries(
            Map.entry("cat_food", List.of("Lunch with team", "Weekend dinner", "Coffee run", "Family meal")),
            Map.entry("cat_groceries", List.of("Weekly groceries", "Monthly stock-up", "Fruit and vegetables")),
            Map.entry("cat_rent", List.of("Monthly rent", "Society charges")),
            Map.entry("cat_transport", List.of("Cab to office", "Weekend trip", "Fuel refill")),
            Map.entry("cat_utilities", List.of("Electricity bill", "Broadband bill", "Mobile recharge")),
            Map.entry("cat_shopping", List.of("New shoes", "Home essentials", "Office wear")),
            Map.entry("cat_entertainment", List.of("Movie night", "Streaming plan", "Weekend outing")),
            Map.entry("cat_health", List.of("Pharmacy", "Doctor visit", "Gym membership")),
            Map.entry("cat_education", List.of("Online course", "Reference book", "Certification")),
            Map.entry("cat_subscriptions", List.of("Monthly plan", "Cloud storage")),
            Map.entry("cat_travel", List.of("Train tickets", "Hotel stay", "Weekend getaway")),
            Map.entry("cat_other", List.of("Cash withdrawal", "Small purchase")),
            Map.entry("cat_salary", List.of("Monthly salary")),
            Map.entry("cat_freelance", List.of("Project milestone", "Consulting invoice")),
            Map.entry("cat_investments", List.of("Quarterly dividend", "Savings interest")),
            Map.entry("cat_gifts", List.of("Festival gift", "Reward points")),
            Map.entry("cat_income_other", List.of("Refund credited", "Expense reimbursement"))
    );

    private static final List<String> PAYMENT_METHODS =
            List.of("UPI", "Card", "Cash", "Net Banking", "Auto-debit");

    private final List<String> statementCache = new ArrayList<>();

    public SeedService() {
    }

    public void seedUser(Connection connection, String userId, String fullName) throws SQLException {
        Random random = new Random(userId.hashCode() * 31L + 17L);
        String now = Instant.now().toString();
        LocalDate today = LocalDate.now();
        YearMonth current = YearMonth.now();
        String seededAt = now;

        insertCategories(connection, userId, now);

        List<Object[]> transactions = new ArrayList<>();
        for (int offset = 7; offset >= 0; offset -= 1) {
            YearMonth month = current.minusMonths(offset);
            boolean isCurrent = offset == 0;

            long salary = 84_000_00L + money(random, -2_500, 4_500, 500);
            add(transactions, userId, "income", salary, "cat_salary",
                    day(month, 1 + random.nextInt(3), today), "Acme Technologies", "Monthly salary",
                    "Net Banking", true, now);

            if (random.nextDouble() > 0.55) {
                add(transactions, userId, "income", money(random, 4_500, 18_000, 500), "cat_freelance",
                        day(month, 10 + random.nextInt(14), today), pick(random, "cat_freelance"), null, "UPI", false, now);
            }
            if (random.nextDouble() > 0.70) {
                add(transactions, userId, "income", money(random, 600, 3_200, 100), "cat_investments",
                        day(month, 15 + random.nextInt(10), today), pick(random, "cat_investments"), null,
                        "Net Banking", false, now);
            }

            add(transactions, userId, "expense", 22_000_00L, "cat_rent", day(month, 3, today),
                    "Landlord", "Monthly rent", "Net Banking", true, now);
            add(transactions, userId, "expense", money(random, 1_600, 3_800, 50), "cat_utilities",
                    day(month, 8, today), "BESCOM", "Electricity bill", "UPI", false, now);
            add(transactions, userId, "expense", money(random, 799, 1_499, 100), "cat_utilities",
                    day(month, 6, today), "Airtel", "Broadband bill", "Auto-debit", true, now);
            add(transactions, userId, "expense", 649_00L, "cat_subscriptions", day(month, 5, today),
                    "Netflix", "Monthly plan", "Auto-debit", true, now);

            for (int index = 0; index < 4 + random.nextInt(3); index += 1) {
                add(transactions, userId, "expense", money(random, 500, 3_200, 50), "cat_groceries",
                        day(month, 2 + random.nextInt(26), today), pick(random, "cat_groceries"), null,
                        pick(random, PAYMENT_METHODS), false, now);
            }
            for (int index = 0; index < 4 + random.nextInt(4); index += 1) {
                add(transactions, userId, "expense", money(random, 180, 1_800, 20), "cat_food",
                        day(month, 1 + random.nextInt(27), today), pick(random, "cat_food"), null,
                        pick(random, PAYMENT_METHODS), false, now);
            }
            for (int index = 0; index < 2 + random.nextInt(4); index += 1) {
                add(transactions, userId, "expense", money(random, 80, 900, 10), "cat_transport",
                        day(month, 1 + random.nextInt(27), today), pick(random, "cat_transport"), null,
                        pick(random, PAYMENT_METHODS), false, now);
            }
            for (int index = 0; index < 1 + random.nextInt(3); index += 1) {
                add(transactions, userId, "expense", money(random, 600, 5_500, 100), "cat_shopping",
                        day(month, 4 + random.nextInt(24), today), pick(random, "cat_shopping"), null,
                        pick(random, PAYMENT_METHODS), false, now);
            }
            if (random.nextDouble() > 0.25) {
                add(transactions, userId, "expense", money(random, 250, 1_600, 50), "cat_entertainment",
                        day(month, 5 + random.nextInt(22), today), pick(random, "cat_entertainment"), null,
                        pick(random, PAYMENT_METHODS), false, now);
            }
            if (random.nextDouble() > 0.55) {
                add(transactions, userId, "expense", money(random, 250, 2_200, 50), "cat_health",
                        day(month, 8 + random.nextInt(18), today), pick(random, "cat_health"), null,
                        pick(random, PAYMENT_METHODS), false, now);
            }
            if (random.nextDouble() > 0.60) {
                add(transactions, userId, "expense", money(random, 400, 2_600, 100), "cat_education",
                        day(month, 6 + random.nextInt(18), today), pick(random, "cat_education"), null,
                        pick(random, PAYMENT_METHODS), false, now);
            }
            if (random.nextDouble() > 0.78) {
                add(transactions, userId, "expense", money(random, 1_800, 9_000, 100), "cat_travel",
                        day(month, 12 + random.nextInt(14), today), pick(random, "cat_travel"), null,
                        pick(random, PAYMENT_METHODS), false, now);
            }
            if (isCurrent) {
                add(transactions, userId, "expense", money(random, 220, 780, 20), "cat_food",
                        today.toString(), "Cafe Coffee Day", "Coffee and snack", "UPI", false, now);
            }
        }

        insertTransactions(connection, transactions);

        insertBudgets(connection, userId);
        insertGoals(connection, userId, random, today, now);

        insertSettings(connection, userId, now);
        insertState(connection, userId, seededAt, now);
    }

    public void resetUser(Connection connection, String userId, String fullName) throws SQLException {
        String[] deletes = {
                "DELETE FROM transactions WHERE user_id = ?",
                "DELETE FROM budgets WHERE user_id = ?",
                "DELETE FROM goal_contributions WHERE user_id = ?",
                "DELETE FROM goals WHERE user_id = ?",
                "DELETE FROM categories WHERE user_id = ?",
                "DELETE FROM user_settings WHERE user_id = ?",
                "DELETE FROM user_state WHERE user_id = ?"
        };
        for (String sql : deletes) {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, userId);
                statement.executeUpdate();
            }
        }
        seedUser(connection, userId, fullName);
    }

    /* ---------------------------------------------------------------------
       Insert helpers
       --------------------------------------------------------------------- */

    private void insertCategories(Connection connection, String userId, String now) throws SQLException {
        String sql = "INSERT INTO categories(id, user_id, name, type, color, icon, is_system, sort_order, created_at) "
                + "VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            int order = 0;
            for (Category category : CATEGORIES) {
                statement.setString(1, category.id());
                statement.setString(2, userId);
                statement.setString(3, category.name());
                statement.setString(4, category.type());
                statement.setString(5, category.color());
                statement.setString(6, category.icon());
                statement.setInt(7, order++);
                statement.setString(8, now);
                statement.addBatch();
            }
            statement.executeBatch();
        }
    }

    private void insertTransactions(Connection connection, List<Object[]> rows) throws SQLException {
        if (rows.isEmpty()) {
            return;
        }
        String sql = "INSERT INTO transactions(id, user_id, type, amount_cents, category_id, tx_date, merchant, "
                + "note, method, recurring, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (Object[] row : rows) {
                statement.setString(1, id("tx"));
                statement.setString(2, (String) row[0]);
                statement.setString(3, (String) row[1]);
                statement.setLong(4, (Long) row[2]);
                statement.setString(5, (String) row[3]);
                statement.setString(6, (String) row[4]);
                statement.setString(7, (String) row[5]);
                statement.setString(8, (String) row[6]);
                statement.setString(9, (String) row[7]);
                statement.setInt(10, Boolean.TRUE.equals(row[8]) ? 1 : 0);
                statement.setString(11, (String) row[9]);
                statement.setString(12, (String) row[9]);
                statement.addBatch();
            }
            statement.executeBatch();
        }
    }

    private void insertBudgets(Connection connection, String userId) throws SQLException {
        String sql = "INSERT INTO budgets(id, user_id, month_key, category_key, amount_cents) VALUES (?, ?, ?, ?, ?)";
        YearMonth current = YearMonth.now();
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int offset = 2; offset >= 0; offset -= 1) {
                String month = current.minusMonths(offset).toString();
                statement.setString(1, id("bud"));
                statement.setString(2, userId);
                statement.setString(3, month);
                statement.setString(4, "");
                statement.setLong(5, 65_000_00L);
                statement.addBatch();

                for (Category category : CATEGORIES) {
                    if (!"expense".equals(category.type()) || category.budgetRupees() <= 0) {
                        continue;
                    }
                    statement.setString(1, id("bud"));
                    statement.setString(2, userId);
                    statement.setString(3, month);
                    statement.setString(4, category.id());
                    statement.setLong(5, category.budgetRupees() * 100);
                    statement.addBatch();
                }
            }
            statement.executeBatch();
        }
    }

    private void insertGoals(Connection connection, String userId, Random random, LocalDate today, String now)
            throws SQLException {
        record SeedGoal(String name, long target, long saved, int months, String color, String icon) {
        }
        List<SeedGoal> goals = List.of(
                new SeedGoal("Emergency fund", 200_000, 86_000, 8, "#0f9d76", "shield"),
                new SeedGoal("Goa trip", 60_000, 22_500, 4, "#0ea5e9", "globe"),
                new SeedGoal("New laptop", 120_000, 48_000, 6, "#8b5cf6", "laptop")
        );

        String goalSql = "INSERT INTO goals(id, user_id, name, target_cents, saved_cents, deadline, color, icon, "
                + "note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        String contributionSql = "INSERT INTO goal_contributions(id, goal_id, user_id, amount_cents, con_date, note, "
                + "created_at) VALUES (?, ?, ?, ?, ?, ?, ?)";

        try (PreparedStatement goalStatement = connection.prepareStatement(goalSql);
             PreparedStatement contributionStatement = connection.prepareStatement(contributionSql)) {
            for (SeedGoal goal : goals) {
                String goalId = id("goal");
                LocalDate deadline = YearMonth.now().plusMonths(goal.months()).atEndOfMonth();
                goalStatement.setString(1, goalId);
                goalStatement.setString(2, userId);
                goalStatement.setString(3, goal.name());
                goalStatement.setLong(4, goal.target() * 100);
                goalStatement.setLong(5, goal.saved() * 100);
                goalStatement.setString(6, deadline.toString());
                goalStatement.setString(7, goal.color());
                goalStatement.setString(8, goal.icon());
                goalStatement.setString(9, "");
                goalStatement.setString(10, today.minusDays(90).toString());
                goalStatement.setString(11, now);
                goalStatement.executeUpdate();

                long first = Math.round(goal.saved() * 0.55) * 100;
                long second = goal.saved() * 100 - first;
                if (first > 0) {
                    addContribution(contributionStatement, goalId, userId, first, today.minusDays(70), "Starting deposit", now);
                }
                if (second > 0) {
                    addContribution(contributionStatement, goalId, userId, second, today.minusDays(24), "Monthly transfer", now);
                }
            }
        }
    }

    private void addContribution(PreparedStatement statement, String goalId, String userId, long cents,
                                 LocalDate date, String note, String now) throws SQLException {
        statement.setString(1, id("con"));
        statement.setString(2, goalId);
        statement.setString(3, userId);
        statement.setLong(4, cents);
        statement.setString(5, date.toString());
        statement.setString(6, note);
        statement.setString(7, now);
        statement.executeUpdate();
    }

    private void insertSettings(Connection connection, String userId, String now) throws SQLException {
        String sql = "INSERT OR IGNORE INTO user_settings(user_id, currency, date_format, month_start, week_start, "
                + "theme, profile_note, monthly_income_cents, notify_budget_alerts, notify_goal_reminders, "
                + "notify_weekly_digest, notify_recurring_reminders, updated_at) "
                + "VALUES (?, 'INR', 'DD MMM YYYY', 1, 'mon', 'light', '', 0, 1, 1, 1, 1, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, userId);
            statement.setString(2, now);
            statement.executeUpdate();
        }
    }

    private void insertState(Connection connection, String userId, String seededAt, String now) throws SQLException {
        String sql = "INSERT OR REPLACE INTO user_state(user_id, read_notifications, dismissed_notifications, "
                + "last_deleted, recurring_queue, seeded_at, updated_at) VALUES (?, '[]', '[]', '[]', '[]', ?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, userId);
            statement.setString(2, seededAt);
            statement.setString(3, now);
            statement.executeUpdate();
        }
    }

    /* ---------------------------------------------------------------------
       Small value helpers
       --------------------------------------------------------------------- */

    private static void add(List<Object[]> target, String userId, String type, long cents, String categoryId,
                            String date, String merchant, String note, String method, boolean recurring,
                            String now) {
        if (date == null || cents <= 0) {
            return;
        }
        target.add(new Object[]{userId, type, cents, categoryId, date, merchant, note == null ? "" : note,
                method, recurring, now});
    }

    private static String day(YearMonth month, int wantedDay, LocalDate today) {
        int day = Math.min(wantedDay, month.lengthOfMonth());
        LocalDate date = month.atDay(day);
        return date.isAfter(today) ? null : date.toString();
    }

    private static long money(Random random, long minRupees, long maxRupees, long stepRupees) {
        long raw = minRupees + (long) (random.nextDouble() * (maxRupees - minRupees));
        long step = Math.max(1, stepRupees);
        long rounded = Math.max(step, Math.round((double) raw / step) * step);
        return rounded * 100;
    }

    private static String pick(Random random, String categoryId) {
        List<String> list = MERCHANTS.getOrDefault(categoryId, List.of("SmartSpend"));
        return list.get(random.nextInt(list.size()));
    }

    private static String pick(Random random, List<String> list) {
        return list.get(random.nextInt(list.size()));
    }

    private static String id(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
    }

    /** Convenience for the auth layer: a freshly created state map. */
    public static Map<String, Object> emptyState(String seededAt) {
        Map<String, Object> state = Json.object();
        state.put("readNotifications", Json.array());
        state.put("dismissedNotifications", Json.array());
        state.put("lastDeleted", Json.array());
        state.put("recurringQueue", Json.array());
        state.put("createdAt", seededAt);
        return state;
    }

    /** Kept for callers that want the category ids without opening the database. */
    public static List<Map<String, Object>> defaultCategories() {
        List<Map<String, Object>> result = new ArrayList<>();
        Map<String, Long> budgets = new LinkedHashMap<>();
        for (Category category : CATEGORIES) {
            if (category.budgetRupees() > 0) {
                budgets.put(category.id(), category.budgetRupees());
            }
        }
        for (Category category : CATEGORIES) {
            Map<String, Object> json = Json.object();
            json.put("id", category.id());
            json.put("name", category.name());
            json.put("type", category.type());
            json.put("color", category.color());
            json.put("icon", category.icon());
            json.put("system", true);
            if (budgets.containsKey(category.id())) {
                json.put("budget", budgets.get(category.id()));
            }
            result.add(json);
        }
        return result;
    }
}
