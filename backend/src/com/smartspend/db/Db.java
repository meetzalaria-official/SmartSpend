package com.smartspend.db;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * SQLite connection factory and schema bootstrap.
 *
 * <p>Every request opens a short-lived connection (cheap for SQLite), enables
 * foreign keys and a busy timeout, and the database itself runs in WAL mode so
 * the HTTP thread pool can read while another request writes.</p>
 */
public final class Db {

    public static final String SCHEMA_VERSION = "1";

    private final String url;
    private final Path file;

    public Db(Path file) {
        try {
            Class.forName("org.sqlite.JDBC");
        } catch (ClassNotFoundException error) {
            throw new IllegalStateException(
                    "The SQLite JDBC driver is missing. Make sure backend/lib/sqlite-jdbc-3.54.1.0.jar "
                            + "is on the runtime classpath.", error);
        }
        this.file = file.toAbsolutePath().normalize();
        try {
            Path parent = this.file.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
        } catch (Exception error) {
            throw new IllegalStateException("Could not create the database folder: " + this.file, error);
        }
        this.url = "jdbc:sqlite:" + this.file;
        migrate();
    }

    public Path file() {
        return file;
    }

    public Connection open() {
        try {
            Connection connection = DriverManager.getConnection(url);
            try (Statement statement = connection.createStatement()) {
                statement.execute("PRAGMA foreign_keys = ON");
                statement.execute("PRAGMA busy_timeout = 5000");
            }
            return connection;
        } catch (SQLException error) {
            throw new DbException("Could not open the SmartSpend database.", error);
        }
    }

    public <T> T read(Work<T> work) {
        try (Connection connection = open()) {
            return work.run(connection);
        } catch (RuntimeException error) {
            throw error;
        } catch (Exception error) {
            throw new DbException("Database read failed.", error);
        }
    }

    public <T> T tx(Work<T> work) {
        try (Connection connection = open()) {
            connection.setAutoCommit(false);
            try {
                T result = work.run(connection);
                connection.commit();
                return result;
            } catch (Exception error) {
                try {
                    connection.rollback();
                } catch (SQLException ignored) {
                    // The original error is more useful.
                }
                if (error instanceof RuntimeException runtime) {
                    throw runtime;
                }
                throw new DbException("Database transaction failed.", error);
            } finally {
                try {
                    connection.setAutoCommit(true);
                } catch (SQLException ignored) {
                    // Connection is closing anyway.
                }
            }
        } catch (SQLException error) {
            throw new DbException("Could not open the SmartSpend database.", error);
        }
    }

    public void execute(String sql, Object... parameters) {
        tx(connection -> {
            try (var statement = connection.prepareStatement(sql)) {
                bind(statement, parameters);
                statement.executeUpdate();
            }
            return null;
        });
    }

    public static void bind(java.sql.PreparedStatement statement, Object... parameters) throws SQLException {
        for (int index = 0; index < parameters.length; index++) {
            Object value = parameters[index];
            if (value == null) {
                statement.setObject(index + 1, null);
            } else if (value instanceof Integer integer) {
                statement.setInt(index + 1, integer);
            } else if (value instanceof Long longValue) {
                statement.setLong(index + 1, longValue);
            } else if (value instanceof Boolean bool) {
                statement.setInt(index + 1, bool ? 1 : 0);
            } else if (value instanceof Number number) {
                statement.setDouble(index + 1, number.doubleValue());
            } else {
                statement.setString(index + 1, String.valueOf(value));
            }
        }
    }

    public interface Work<T> {
        T run(Connection connection) throws Exception;
    }

    public static final class DbException extends RuntimeException {
        public DbException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private void migrate() {
        List<String> statements = schema();
        try (Connection connection = open(); Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA journal_mode = WAL");
            for (String sql : statements) {
                statement.execute(sql);
            }
            try (var insert = connection.prepareStatement(
                    "INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('schema_version', ?)")) {
                insert.setString(1, SCHEMA_VERSION);
                insert.executeUpdate();
            }
        } catch (SQLException error) {
            throw new DbException("Could not initialise the SQLite schema.", error);
        }
    }

    private static List<String> schema() {
        List<String> statements = new ArrayList<>();
        statements.add("""
                CREATE TABLE IF NOT EXISTS schema_meta (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """);
        statements.add("""
                CREATE TABLE IF NOT EXISTS users (
                    id                  TEXT PRIMARY KEY,
                    full_name           TEXT NOT NULL,
                    username            TEXT NOT NULL,
                    email               TEXT NOT NULL,
                    password_hash       TEXT NOT NULL,
                    created_at          TEXT NOT NULL,
                    updated_at          TEXT NOT NULL,
                    last_login_at       TEXT,
                    password_changed_at TEXT NOT NULL
                )
                """);
        statements.add("CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(lower(username))");
        statements.add("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(lower(email))");
        statements.add("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    remember   INTEGER NOT NULL DEFAULT 0,
                    user_agent TEXT NOT NULL DEFAULT ''
                )
                """);
        statements.add("CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)");
        statements.add("CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)");
        statements.add("""
                CREATE TABLE IF NOT EXISTS categories (
                    id         TEXT NOT NULL,
                    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name       TEXT NOT NULL,
                    type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
                    color      TEXT NOT NULL DEFAULT '#6366f1',
                    icon       TEXT NOT NULL DEFAULT 'tag',
                    is_system  INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, id),
                    UNIQUE (user_id, type, name COLLATE NOCASE)
                )
                """);
        statements.add("CREATE INDEX IF NOT EXISTS categories_user ON categories(user_id)");
        statements.add("""
                CREATE TABLE IF NOT EXISTS transactions (
                    id           TEXT PRIMARY KEY,
                    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    type         TEXT NOT NULL CHECK (type IN ('income', 'expense')),
                    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
                    category_id  TEXT NOT NULL,
                    tx_date      TEXT NOT NULL,
                    merchant     TEXT NOT NULL DEFAULT '',
                    note         TEXT NOT NULL DEFAULT '',
                    method       TEXT NOT NULL DEFAULT 'UPI',
                    recurring    INTEGER NOT NULL DEFAULT 0,
                    created_at   TEXT NOT NULL,
                    updated_at   TEXT NOT NULL
                )
                """);
        statements.add("CREATE INDEX IF NOT EXISTS transactions_user_date ON transactions(user_id, tx_date DESC)");
        statements.add("CREATE INDEX IF NOT EXISTS transactions_user_category ON transactions(user_id, category_id)");
        statements.add("CREATE INDEX IF NOT EXISTS transactions_user_type ON transactions(user_id, type)");
        statements.add("""
                CREATE TABLE IF NOT EXISTS budgets (
                    id           TEXT PRIMARY KEY,
                    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    month_key    TEXT NOT NULL,
                    category_key TEXT NOT NULL DEFAULT '',
                    amount_cents INTEGER NOT NULL,
                    UNIQUE (user_id, month_key, category_key)
                )
                """);
        statements.add("CREATE INDEX IF NOT EXISTS budgets_user_month ON budgets(user_id, month_key)");
        statements.add("""
                CREATE TABLE IF NOT EXISTS goals (
                    id           TEXT PRIMARY KEY,
                    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name         TEXT NOT NULL,
                    target_cents INTEGER NOT NULL,
                    saved_cents  INTEGER NOT NULL DEFAULT 0,
                    deadline     TEXT NOT NULL,
                    color        TEXT NOT NULL DEFAULT '#6366f1',
                    icon         TEXT NOT NULL DEFAULT 'target',
                    note         TEXT NOT NULL DEFAULT '',
                    created_at   TEXT NOT NULL,
                    updated_at   TEXT NOT NULL
                )
                """);
        statements.add("CREATE INDEX IF NOT EXISTS goals_user ON goals(user_id)");
        statements.add("""
                CREATE TABLE IF NOT EXISTS goal_contributions (
                    id           TEXT PRIMARY KEY,
                    goal_id      TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
                    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    amount_cents INTEGER NOT NULL,
                    con_date     TEXT NOT NULL,
                    note         TEXT NOT NULL DEFAULT '',
                    created_at   TEXT NOT NULL
                )
                """);
        statements.add("CREATE INDEX IF NOT EXISTS goal_contributions_goal ON goal_contributions(goal_id)");
        statements.add("""
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id                    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    currency                   TEXT NOT NULL DEFAULT 'INR',
                    date_format                TEXT NOT NULL DEFAULT 'DD MMM YYYY',
                    month_start                INTEGER NOT NULL DEFAULT 1,
                    week_start                 TEXT NOT NULL DEFAULT 'mon',
                    theme                      TEXT NOT NULL DEFAULT 'light',
                    profile_note               TEXT NOT NULL DEFAULT '',
                    monthly_income_cents       INTEGER NOT NULL DEFAULT 0,
                    notify_budget_alerts       INTEGER NOT NULL DEFAULT 1,
                    notify_goal_reminders      INTEGER NOT NULL DEFAULT 1,
                    notify_weekly_digest       INTEGER NOT NULL DEFAULT 1,
                    notify_recurring_reminders INTEGER NOT NULL DEFAULT 1,
                    updated_at                 TEXT NOT NULL
                )
                """);
        statements.add("""
                CREATE TABLE IF NOT EXISTS user_state (
                    user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    read_notifications      TEXT NOT NULL DEFAULT '[]',
                    dismissed_notifications TEXT NOT NULL DEFAULT '[]',
                    last_deleted            TEXT NOT NULL DEFAULT '[]',
                    recurring_queue         TEXT NOT NULL DEFAULT '[]',
                    seeded_at               TEXT NOT NULL,
                    updated_at              TEXT NOT NULL
                )
                """);
        return statements;
    }
}
