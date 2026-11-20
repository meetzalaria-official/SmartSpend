package com.smartspend.server;

import com.smartspend.auth.AuthService;
import com.smartspend.auth.SessionService;
import com.smartspend.db.Db;
import com.smartspend.finance.FinanceService;
import com.smartspend.finance.ReportService;
import com.smartspend.finance.SeedService;
import com.sun.net.httpserver.HttpServer;

import java.awt.Desktop;
import java.io.IOException;
import java.net.BindException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

/**
 * SmartSpend Phase 8 application server.
 *
 * <p>Serves the vanilla HTML/CSS/JavaScript frontend and the Java REST API from
 * one origin, backed by SQLite through the bundled {@code sqlite-jdbc} driver.
 * Run from the project root:</p>
 *
 * <pre>
 *   java -cp "backend/bin;backend/lib/sqlite-jdbc-3.54.1.0.jar" \
 *        com.smartspend.server.PreviewServer --port 8080
 * </pre>
 */
public final class PreviewServer {

    private static final int DEFAULT_PORT = 8080;

    private PreviewServer() {
    }

    public static void main(String[] args) {
        int port = DEFAULT_PORT;
        boolean openBrowser = true;
        Path explicitData = null;
        Path explicitFrontend = null;

        for (int index = 0; index < args.length; index++) {
            String argument = args[index];
            switch (argument) {
                case "--no-open" -> openBrowser = false;
                case "--port" -> {
                    if (index + 1 >= args.length) {
                        usage("Missing a value after --port.");
                        return;
                    }
                    port = parsePort(args[++index]);
                }
                case "--data" -> {
                    if (index + 1 >= args.length) {
                        usage("Missing a path after --data.");
                        return;
                    }
                    explicitData = Path.of(args[++index]);
                }
                case "--frontend" -> {
                    if (index + 1 >= args.length) {
                        usage("Missing a path after --frontend.");
                        return;
                    }
                    explicitFrontend = Path.of(args[++index]);
                }
                case "--help", "-h" -> {
                    printUsage();
                    return;
                }
                default -> {
                    if (argument.startsWith("--port=")) {
                        port = parsePort(argument.substring("--port=".length()));
                    } else if (argument.startsWith("--data=")) {
                        explicitData = Path.of(argument.substring("--data=".length()));
                    } else if (argument.startsWith("--frontend=")) {
                        explicitFrontend = Path.of(argument.substring("--frontend=".length()));
                    } else {
                        usage("Unknown argument: " + argument);
                        return;
                    }
                }
            }
        }

        Path root = resolveFrontendRoot(explicitFrontend);
        if (root == null) {
            System.err.println("Could not find the frontend folder.");
            System.err.println("Run this server from the project root (the folder containing frontend/).");
            System.exit(1);
            return;
        }

        Path database = resolveDatabase(explicitData, root);
        Db db;
        try {
            db = new Db(database);
        } catch (RuntimeException error) {
            System.err.println("Could not start the SmartSpend database.");
            System.err.println(error.getMessage());
            System.err.println("Check that backend/lib/sqlite-jdbc-3.54.1.0.jar is on the classpath.");
            error.printStackTrace(System.err);
            System.exit(1);
            return;
        }

        SeedService seed = new SeedService();
        SessionService sessions = new SessionService(db);
        AuthService auth = new AuthService(db, seed, sessions);
        FinanceService finance = new FinanceService(db, seed);
        ReportService reports = new ReportService(db, finance);
        FinanceApi financeApi = new FinanceApi(finance, reports);
        ApiServer api = new ApiServer(db, auth, sessions, financeApi, root);

        HttpServer server;
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        } catch (BindException error) {
            System.err.println("Port " + port + " is already in use.");
            System.err.println("Try another port: .\\run.ps1 -Port " + (port + 1));
            System.exit(1);
            return;
        } catch (IOException error) {
            System.err.println("Could not start the server: " + error.getMessage());
            System.exit(1);
            return;
        }

        server.createContext("/", api::handle);
        server.setExecutor(Executors.newFixedThreadPool(Math.max(4, Runtime.getRuntime().availableProcessors())));

        CountDownLatch shutdown = new CountDownLatch(1);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            server.stop(0);
            shutdown.countDown();
        }, "smartspend-shutdown"));

        server.start();

        String url = "http://127.0.0.1:" + port + "/";
        System.out.println();
        System.out.println("  SmartSpend - Phase 8 backend");
        System.out.println("  ----------------------------");
        System.out.println("  Frontend : " + root);
        System.out.println("  Database : " + db.file());
        System.out.println("  URL      : " + url);
        System.out.println("  API      : " + url + "api/health");
        System.out.println("  Stop     : press Ctrl+C");
        System.out.println();

        if (openBrowser) {
            openBrowser(url);
        }

        try {
            shutdown.await();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            server.stop(0);
        }
    }

    private static int parsePort(String raw) {
        try {
            int port = Integer.parseInt(raw.trim());
            if (port < 1 || port > 65535) {
                throw new NumberFormatException("out of range");
            }
            return port;
        } catch (NumberFormatException error) {
            System.err.println("Invalid port: " + raw);
            printUsage();
            System.exit(2);
            return DEFAULT_PORT;
        }
    }

    private static void usage(String message) {
        System.err.println(message);
        printUsage();
        System.exit(2);
    }

    private static void printUsage() {
        System.out.println("Usage: java -cp \"backend/bin;backend/lib/sqlite-jdbc-3.54.1.0.jar\" "
                + "com.smartspend.server.PreviewServer [--port <1-65535>] [--no-open] "
                + "[--data <file>] [--frontend <folder>]");
    }

    private static Path resolveFrontendRoot(Path explicit) {
        List<Path> candidates = new ArrayList<>();
        if (explicit != null) {
            candidates.add(explicit);
        }
        String configured = System.getProperty("smartspend.frontend");
        if (configured != null && !configured.isBlank()) {
            candidates.add(Path.of(configured));
        }
        candidates.add(Path.of("frontend"));
        candidates.add(Path.of("..", "frontend"));

        for (Path candidate : candidates) {
            Path absolute = candidate.toAbsolutePath().normalize();
            if (Files.isRegularFile(absolute.resolve("login.html"))) {
                return absolute;
            }
        }
        return null;
    }

    private static Path resolveDatabase(Path explicit, Path frontendRoot) {
        if (explicit != null) {
            return explicit.toAbsolutePath().normalize();
        }
        String configured = System.getProperty("smartspend.data");
        if (configured == null || configured.isBlank()) {
            configured = System.getenv("SMARTSPEND_DATA");
        }
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured).toAbsolutePath().normalize();
        }
        Path parent = frontendRoot.getParent();
        Path base = parent == null ? Path.of(".") : parent;
        return base.resolve("backend").resolve("data").resolve("smartspend.db").toAbsolutePath().normalize();
    }

    private static void openBrowser(String url) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI.create(url));
                return;
            }
        } catch (Exception ignored) {
            // Fall through to the platform-specific helper.
        }

        try {
            String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
            if (os.contains("win")) {
                new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url).start();
            } else if (os.contains("mac")) {
                new ProcessBuilder("open", url).start();
            } else {
                new ProcessBuilder("xdg-open", url).start();
            }
        } catch (Exception error) {
            System.out.println("  Open this URL in your browser: " + url);
        }
    }
}
