# SmartSpend

**Personal finance management system — complete full-stack implementation (Phases 0–8)**

SmartSpend is a college project for tracking income, expenses, budgets and savings. It is a
small, dependency-light full stack:

- **Frontend:** HTML, CSS and vanilla JavaScript (no framework, no build step)
- **Backend:** Java 17 using the built-in `com.sun.net.httpserver` HTTP server
- **Database:** SQLite through the bundled `sqlite-jdbc` driver
- **Security:** salted PBKDF2 password hashing, opaque server-side sessions in HttpOnly
  cookies, user-scoped SQL queries, rate limiting and security headers

> **Status: complete.** Registration, login, sessions, profile editing, dashboard,
> transactions, budgets, savings goals, reports, settings, notifications, CSV/JSON export
> and backup import all run against the Java REST API and a persistent SQLite database.
> Every new account starts with an empty workspace: the user creates their own categories,
> transactions, budgets and goals. The offline browser adapters remain available by
> flipping two flags in `frontend/js/config.js`.

---

## 1. Quick start

### Requirements

- **JDK 17** or newer (`javac` and `java` on `PATH`)
- Windows PowerShell (the included scripts), or any terminal for the manual commands

The SQLite JDBC driver is already included at
`backend/lib/sqlite-jdbc-3.54.1.0.jar`. No Maven, Gradle, npm, bundler, servlet container or
database server is required.

### Windows (recommended)

Double-click **`run.bat`**.

It compiles the Java sources, starts the server at `http://127.0.0.1:8080`, and opens your
default browser.

Terminal alternatives:

```powershell
.\run.ps1                 # compile, run and open the browser
.\run.ps1 -NoOpen         # do not open a browser
.\run.ps1 -Port 8081      # use another port
.\build.ps1               # compile only
```

Stop the server with `Ctrl+C`.

### Manual build and run

```powershell
.\build.ps1

java -cp "backend/bin;backend/lib/sqlite-jdbc-3.54.1.0.jar" `
     com.smartspend.server.PreviewServer --port 8080
```

Server options:

| Option | Purpose |
|---|---|
| `--port <1-65535>` | HTTP port (default `8080`) |
| `--no-open` | Do not launch a browser |
| `--data <file>` | Use a different SQLite file |
| `--frontend <folder>` | Serve a different frontend folder |
| `--help`, `-h` | Print usage |

The data location can also be set with `SMARTSPEND_DATA` (environment variable) or the
`smartspend.data` Java system property. The frontend folder can use `smartspend.frontend`.

### Visual Studio Code

1. Install the **Extension Pack for Java**.
2. Open the `smartSpend` folder.
3. Press `F5` and choose **SmartSpend: Run server**, or run the
   **SmartSpend: Run server** task.
4. The browser opens at `http://127.0.0.1:8080`.

### Why serve through Java?

- The live app uses an **HttpOnly session cookie**, which only works when pages and API share
  an origin.
- The offline adapter uses the Web Crypto API, which browsers expose only in a secure
  context (`http://127.0.0.1` counts as secure).
- One origin keeps `login.html`, `register.html` and every app page on the same storage
  origin.

The server is a real application server: it serves the static frontend **and** the JSON API
from the same process.

---

## 2. New accounts start empty

Every registration creates an empty workspace. SmartSpend does **not** create sample
transactions, budgets, goals or categories, and it never copies data from another account.

To get started:

1. Register or sign in.
2. Open **Settings → Categories** and add the income/expense categories you use.
3. Add transactions from the dashboard, the ledger or the quick-add dialog.
4. Create budgets and savings goals when you are ready.

Because categories are user-defined, the transaction dialog asks you to create one first when
the workspace has no categories yet.

---

## 3. What the app includes

### Authentication

- Registration with full name, username, email, password and confirmation.
- Login using either **username or email**.
- Case-insensitive duplicate username and email protection.
- Inline, field-level validation with accessible error messages.
- Live username and email availability checks.
- Password strength meter and requirement checklist.
- Salted **PBKDF2-HMAC-SHA256** password hashing (210,000 iterations, 256-bit key).
- Constant-time hash comparison.
- Generic login errors: the screen never reveals whether an account exists.
- **Remember me** session (7 days) or browser-session-only login (24-hour server lifetime).
- Rate limiting: ten failed sign-ins per address in a five-minute window.
- Safe logout from the sidebar, account menu and security card.
- Protected pages redirect to login when the session is missing or expired.

### Account workspace

- Overview with profile facts, session information and links into every finance screen.
- Edit full name and email with duplicate-email protection.
- Change password with current-password verification, strength meter and confirmation.
- Copy account ID to the clipboard.
- Session information: sign-in time, expiry and remember mode.
- Quick add transaction and live notifications from the account page.

### Dashboard

- Month switcher, greeting, summary cards and a sidebar spending meter.
- Cash-flow line chart, spending-mix donut and budget health snapshot.
- Savings-goal progress, budget warnings, recent transactions and smart insights.
- Quick-add transaction dialog available from every page.

### Transactions

- Full ledger with search, type/category/period filters and custom date ranges.
- Sorting, pagination, row selection and bulk delete with undo.
- Add, edit and delete dialogs for recurring transactions.
- Recurring posting queue with a due-date notice.
- CSV export, empty states and accessible table controls.
- Merge-sort ranking and search helpers from the DSA module.

### Budgets

- Overall monthly limit plus per-category limits.
- Inline limit editing, add/remove dialogs and copy-forward from last month.
- 80% warning and over-budget states, allocation donut and unbudgeted list.

### Savings goals

- Goal cards with colour, icon, target, deadline and progress.
- Create/edit goals, record contributions and review contribution history.
- Monthly amount needed, overdue and completed states.

### Reports

- This month, last month, 3/6-month, year and custom ranges.
- Trend line chart, grouped bar chart, category mix donut and breakdown.
- Top merchants, summary facts, automatic insights, CSV export and print layout.

### Settings

- Currency, date format, monthly income target and workspace note.
- Light/dark/system theme and four notification switches.
- Category manager with colour and icon choices.
- JSON backup export/import, CSV export and usage statistics.
- Sign-out and links to the account/security page.

### Interface

- Modern fintech design with a split-screen authentication layout.
- Light and dark themes, remembered across pages.
- Responsive layouts for desktop, tablet and mobile.
- Toasts, inline alerts, loading states, password visibility toggles and modal dialogs.
- Keyboard focus styles, skip links, ARIA labels and reduced-motion support.
- Dependency-free SVG charts with text descriptions for screen readers.
- No external fonts, CDNs or JavaScript libraries.

---

## 4. Technology

| Technology | Purpose |
|---|---|
| HTML5 | Semantic page structure |
| CSS3 | Design tokens, light/dark themes, responsive layout |
| Vanilla JavaScript (ES2020+) | Forms, validation, finance logic, charts and UI behaviour |
| Web Crypto API | PBKDF2 hashing only in the optional offline adapter |
| Java 17 | REST API, static file server and business rules |
| `com.sun.net.httpserver` | Dependency-free HTTP server |
| SQLite + `sqlite-jdbc` | Persistent relational storage |
| PBKDF2-HMAC-SHA256 | Password hashing on the server |
| DSA helpers | Merge sort, binary search, stack, queue and category tree |

---

## 5. Project structure

```
smartSpend/
├── frontend/
│   ├── index.html              Session-aware entry redirect
│   ├── login.html              Sign-in screen
│   ├── register.html           Registration screen
│   ├── account.html            Account workspace
│   ├── dashboard.html          Monthly dashboard
│   ├── transactions.html       Transaction ledger
│   ├── budgets.html            Monthly and category budgets
│   ├── goals.html              Savings goals
│   ├── categories.html         Income and expense categories
│   ├── reports.html            Reports and analytics
│   ├── settings.html           Preferences, notifications and backup
│   ├── assets/                 favicon.svg, logo.svg
│   ├── css/                    base.css, auth.css, app.css, finance.css
│   └── js/
│       ├── config.js           App settings and adapter switches
│       ├── icons.js            Inline SVG icon sprite
│       ├── storage.js          Offline store, theme and flash messages
│       ├── crypto.js           PBKDF2 hashing for the offline adapter
│       ├── validators.js       Shared input rules and password strength
│       ├── api.js              Auth API facade + optional browser adapter
│       ├── auth.js             Route guards, flash messages, logout
│       ├── money.js            Currency and date formatting
│       ├── data.js             Offline finance store
│       ├── finance.js          Finance API facade + optional browser adapter
│       ├── dsa.js              Sorting, searching, stack, queue and tree helpers
│       ├── ui.js               Theme, toasts, fields, dialogs, formatting
│       ├── charts.js           Dependency-free SVG charts
│       ├── shell.js            Shared sidebar, topbar, notifications and quick add
│       ├── tx-dialog.js        Shared add/edit transaction dialog
│       └── *.js                Page controllers
├── backend/
│   ├── src/com/smartspend/
│   │   ├── auth/               AuthService, PasswordHasher, SessionService, User, Validation
│   │   ├── db/                 Db connection factory and SQLite schema
│   │   ├── finance/            FinanceService, ReportService, Rows
│   │   ├── json/               Small JSON reader/writer
│   │   └── server/             PreviewServer, ApiServer, FinanceApi, Http, ApiException
│   ├── lib/sqlite-jdbc-3.54.1.0.jar
│   └── data/smartspend.db      Created on first run (ignored by git)
├── .vscode/                    Java launch, tasks and project settings
├── build.ps1 / build.bat
├── run.ps1 / run.bat
├── .gitignore
└── README.md
```

Layering:

```
Pages → js/api.js (auth facade) ──┬─→ Java /api/auth/* → AuthService → SQLite
                                 └─→ offline browser adapter (optional)

Pages → js/finance.js (finance facade) ─┬─→ Java /api/* → Finance/Report services → SQLite
                                        └─→ offline browser adapter (optional)
```

No page talks to SQLite, cookies or `localStorage` for the live auth flow. That is what keeps
the UI adapter-agnostic.

---

## 6. Validation rules

| Field | Rule |
|---|---|
| Full name | 2–60 characters; letters, spaces, dots, apostrophes and hyphens |
| Username | 3–30 characters; starts with a letter or number; `a-z`, `0-9`, `.`, `_`, `-`; unique (case-insensitive) |
| Email | Valid `name@example.com` format; maximum 254 characters; unique (case-insensitive) |
| Password | 8–128 characters; at least one letter and one number |
| Confirmation | Must match the password |
| Login identifier | Required; username or email |
| Change password | Current password must be correct; new password must differ from the current one |
| Transaction | Positive amount, valid category and ISO date |
| Budget | Month key `YYYY-MM`, amount zero or more |
| Goal | Name 2–42 characters, positive target, valid deadline |

Validation runs live while typing, on blur and again on submit. The Java service layer
repeats every check before writing to SQLite; client validation is for user experience, not
for security.

---

## 7. Security model

### Passwords

- Salt: 16 random bytes from `SecureRandom`, unique per password.
- Algorithm: `PBKDF2WithHmacSHA256`.
- Iterations: 210,000.
- Derived key: 256 bits.
- Stored record: `pbkdf2-sha256$210000$<salt-base64>$<hash-base64>` — **never the plain password**.
- Verification uses constant-time comparison.
- Login failures use one generic message so the API does not reveal whether an account exists.
- A dummy hash is verified when the account is missing, reducing timing differences.
- Failed sign-ins are limited to ten per client address in a five-minute window.

### Sessions

- The browser receives a random 256-bit token in the `smartspend_session` cookie.
- The cookie is `HttpOnly` and `SameSite=Lax`, so page JavaScript cannot read the token.
- The database stores only the **SHA-256 hash** of the token.
- **Remember me** → 7-day cookie and database session.
- **Not checked** → browser-session cookie, with a 24-hour server lifetime.
- Expired sessions are deleted automatically when encountered.
- Logout deletes the server session and clears the cookie.
- Every finance query includes `user_id = ?`, so users cannot read or modify another
  account's data.

### Transport and headers

- All SQL uses prepared statements with bound parameters.
- The API returns `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` and a restrictive `Content-Security-Policy`.
- API responses are marked `no-store`.
- Static paths are normalised and checked against the frontend root.
- Request bodies are capped at 8 MiB.
- The server binds to `127.0.0.1` for local use.

> **Production note:** the local development build runs over HTTP. A real deployment would add HTTPS,
> the `Secure` cookie attribute, a production reverse proxy and an email service for password
> recovery.

---

## 8. REST API

All API responses are JSON except the CSV export. Errors use:

```json
{
  "message": "That username is already taken.",
  "field": "username",
  "code": "DUPLICATE_USERNAME"
}
```

### Auth and account

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health and database information |
| `POST` | `/api/auth/register` | Create an account and start a session |
| `POST` | `/api/auth/login` | Sign in by username or email |
| `POST` | `/api/auth/logout` | End the session |
| `GET` | `/api/auth/me` | Return the signed-in user |
| `GET` | `/api/auth/session` | Return session metadata |
| `POST` | `/api/auth/change-password` | Verify the current password and set a new one |
| `PATCH`, `PUT` | `/api/users/me` | Update full name and email |
| `GET` | `/api/auth/check-username?username=…` | Availability check |
| `GET` | `/api/auth/check-email?email=…` | Availability check |

The user shape is:

```json
{
  "user": {
    "id": "usr_…",
    "fullName": "Aarav Sharma",
    "username": "aarav.sharma",
    "email": "aarav@example.com",
    "createdAt": "2026-11-14T10:00:00Z",
    "updatedAt": "2026-11-14T10:00:00Z",
    "lastLoginAt": "2026-11-14T10:05:00Z",
    "passwordChangedAt": "2026-11-14T10:00:00Z"
  }
}
```

### Finance

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/overview?month=YYYY-MM` | Dashboard summary, budget and recent rows |
| `GET` | `/api/transactions?from=&to=&type=&categoryId=&search=&sort=&recurringOnly=` | Filtered ledger |
| `POST` | `/api/transactions` | Create a transaction |
| `DELETE` | `/api/transactions` | Clear the ledger |
| `GET` | `/api/transactions/{id}` | Read one transaction |
| `PATCH`, `PUT` | `/api/transactions/{id}` | Update a transaction |
| `DELETE` | `/api/transactions/{id}` | Delete one transaction |
| `POST` | `/api/transactions/bulk-delete` | Delete many by id (undoable) |
| `POST` | `/api/transactions/restore-last` | Restore the last deleted batch |
| `GET` | `/api/transactions/undo-count` | Number of undoable rows |
| `GET` | `/api/transactions/recurring-info` | Recurring queue summary |
| `POST` | `/api/transactions/process-recurring` | Post due recurring rows |
| `GET` | `/api/categories?type=` | List categories |
| `POST` | `/api/categories` | Create a category |
| `GET` | `/api/categories/usage` | Transaction counts per category |
| `PATCH`, `PUT` | `/api/categories/{id}` | Rename/recolour a category |
| `DELETE` | `/api/categories/{id}` | Delete an unused category |
| `GET` | `/api/budgets?month=YYYY-MM` | Month budget with spend status |
| `POST`, `PUT` | `/api/budgets` | Create/update an overall or category limit |
| `GET` | `/api/budgets/months` | Months that have budget rows |
| `POST` | `/api/budgets/copy-previous` | Copy the previous month forward |
| `DELETE` | `/api/budgets/{id}` | Remove a limit |
| `GET` | `/api/goals` | List goals |
| `POST` | `/api/goals` | Create a goal |
| `GET` | `/api/goals/summary` | Goal totals |
| `PATCH`, `PUT` | `/api/goals/{id}` | Update a goal |
| `POST` | `/api/goals/{id}/contributions` | Record a contribution |
| `DELETE` | `/api/goals/{id}` | Remove a goal |
| `GET` | `/api/reports/overview?from=&to=` | Summary facts |
| `GET` | `/api/reports/by-category?from=&to=` | Category breakdown |
| `GET` | `/api/reports/trend?months=&endMonth=` | Monthly income/expense trend |
| `GET` | `/api/reports/top-merchants?from=&to=&limit=` | Merchant ranking |
| `GET` | `/api/reports/monthly-counts` | Rows per month |
| `GET`, `PATCH` | `/api/settings` | Preferences and notification flags |
| `GET` | `/api/notifications` | Generated budget/goal/digest alerts |
| `POST` | `/api/notifications/read-all` | Mark all (or listed) alerts read |
| `POST` | `/api/notifications/{id}/read` | Mark one read |
| `POST` | `/api/notifications/{id}/dismiss` | Dismiss one |
| `GET` | `/api/backup/json` | Complete JSON backup |
| `GET` | `/api/backup/transactions.csv?from=&to=` | CSV export |
| `POST` | `/api/backup/import` | Replace the workspace from a backup |
| `GET` | `/api/backup/usage` | Row counts and backup size |

Money is stored as integer paise/cents in SQLite and converted to decimal amounts in the API,
so calculations stay exact.

---

## 9. Database

The SQLite file is created automatically at `backend/data/smartspend.db` (ignored by git).
Schema version `1` contains:

| Table | Purpose |
|---|---|
| `schema_meta` | Schema version marker |
| `users` | Accounts, PBKDF2 records and profile dates |
| `sessions` | SHA-256 token hashes, expiry and remember flag |
| `categories` | Per-user income/expense categories |
| `transactions` | Ledger rows in integer cents |
| `budgets` | Per-month overall and category limits |
| `goals` | Savings targets |
| `goal_contributions` | Contribution history |
| `user_settings` | Currency, date format, theme and notification preferences |
| `user_state` | Read/dismissed alerts, undo stack and recurring queue |

Foreign keys and `PRAGMA busy_timeout` are enabled per connection, and the database runs in WAL
mode so reads and writes can proceed together.

To start over, stop the server and delete `backend/data/smartspend.db` (plus `-wal`/`-shm`
files if present). The next run creates a fresh, empty database; new accounts begin with an
empty workspace and add their own categories and finance records.

---

## 10. Offline mode

To run the UI without a backend, open `frontend/js/config.js` and set:

```js
useMockAuth: true,
useMockData: true,
```

Then serve the `frontend` folder with any static server. Accounts and finance data are then
stored in the browser's `localStorage`, and Web Crypto handles password hashing. This mode
uses the same page controllers and validation rules, and new accounts also start empty.

The default configuration is the live Java + SQLite stack:

```js
useMockAuth: false,
useMockData: false,
apiBaseUrl: "/api",
```

---

## 11. Manual test checklist

Run `.\run.ps1`, then check:

**Registration**

- [ ] Submit the empty form → every required field shows an error.
- [ ] Enter a 1-character name, invalid username, bad email → specific messages appear.
- [ ] Enter a 7-character password → length error appears.
- [ ] Enter a password without a number → number rule is highlighted.
- [ ] Enter mismatched passwords → confirmation error appears.
- [ ] Register successfully → redirected to the account workspace with a welcome toast.
- [ ] Confirm the new account has no transactions, budgets, goals or categories.
- [ ] Log out and try to register the same username/email → duplicate errors appear.
- [ ] Type an existing username and tab away → “already taken” message appears.

**Login and sessions**

- [ ] Wrong password → single generic error, no field reveals which part was wrong.
- [ ] Correct password with username → signs in.
- [ ] Correct password with email → signs in.
- [ ] Remember me checked → cookie survives a browser restart.
- [ ] Remember me unchecked → session ends with the browser session.
- [ ] Visit `account.html` after logout → redirected to login.
- [ ] Open `http://127.0.0.1:8080/` while signed in → dashboard without a manual click.

**Account**

- [ ] Profile shows the correct name, username, email, account ID and dates.
- [ ] Edit profile name and email → sidebar, top bar and profile update immediately.
- [ ] Try another account's email → duplicate-email error.
- [ ] Change password with a wrong current password → error.
- [ ] Change password to the same value → “choose a different password” error.
- [ ] Change password successfully → toast, last-changed date updates.
- [ ] Log out, old password fails, new password works.
- [ ] Copy account ID → clipboard contains the full ID.
- [ ] Notification bell and user menu open/close; Escape closes them.

**Finance**

- [ ] With no categories yet, the transaction dialog explains that a category must be created first.
- [ ] Add, edit and delete a transaction from the ledger and from the quick-add dialog.
- [ ] Bulk select, delete, then use Undo.
- [ ] Filter by type, category, period and search text; change sort order.
- [ ] Export CSV and open it in a spreadsheet.
- [ ] Edit an inline budget limit; copy last month's budgets; check warning/over states.
- [ ] Create a goal, contribute to it and review the contribution history.
- [ ] Switch report ranges and confirm charts, totals, merchants and insights update.
- [ ] Change currency/date format in Settings → every screen reformats immediately.
- [ ] Toggle each notification switch → the bell updates after saving.
- [ ] Add/rename/delete a category; deleting an in-use category is blocked.
- [ ] Export a JSON backup, import it and confirm the counts.

**Interface**

- [ ] Toggle light/dark theme on all pages → choice persists.
- [ ] Resize to tablet/mobile → sidebar becomes an off-canvas menu.
- [ ] Tab through forms → visible focus rings, password toggles work.
- [ ] Reload with a reduced-motion OS setting → animations are suppressed.

---

## 12. Roadmap status

| Phase | Scope | Status |
|---|---|---|
| 0 | Project setup, Java tooling, database foundation | Complete |
| 1 | Registration, login, validation, hashing, logout, user isolation | Complete |
| 2 | Dashboard, recent transactions, finance data model | Complete |
| 3 | Transaction create/edit/delete, search, filter, sort, bulk actions | Complete |
| 4 | Monthly and category budgets, warnings, copy-forward | Complete |
| 5 | DSA helpers: merge sort, binary search, stack, queue, tree | Complete |
| 6 | Reports, analytics, charts, merchant ranking and insights | Complete |
| 7 | Savings goals, notifications, settings, CSV, backup/restore | Complete |
| 8 | Java REST API, SQLite schema/DAO, adapter switch and final testing | Complete |

The project is finished end to end. Possible future extensions are outside the college-project
scope: HTTPS deployment, email-based password reset, multi-device session management, database
migrations beyond schema version 1, and automated browser/API test suites.

---

## 13. Troubleshooting

| Problem | Fix |
|---|---|
| `javac` not found | Install a **JDK 17** (not only a JRE) and reopen the terminal. |
| `run.bat` closes immediately | Run `.\run.ps1` in PowerShell to see the error, or run `.\build.ps1` first. |
| Port 8080 is busy | Use `.\run.ps1 -Port 8081`. |
| “Could not start the SmartSpend database” | Check that `backend/lib/sqlite-jdbc-3.54.1.0.jar` exists and is on the classpath. |
| “The database file is locked” | Make sure only one SmartSpend server is running against the same `.db` file. |
| “Cannot reach the Java server” | Start the backend with `run.ps1`; the pages are served from the same origin. |
| Login loop or stale page | The server sends `no-store`; reload with `Ctrl+F5`. Check the server console for errors. |
| “Secure hashing is not available” | Only applies to offline mode: open the app through `http://127.0.0.1`, not as a `file://` page. |
| Fonts look different | The app uses the system UI font stack; no download is needed. |
| Sidebar is open on desktop | Resize the window or reload; the mobile sidebar resets above 980px. |

---

## 14. Notes for the viva

1. Explain the layered design: **pages → auth/finance facades → Java REST API → services → SQLite**.
2. Show that passwords are stored only as `PBKDF2-SHA256` records with a unique salt.
3. Show that the browser never sees the session token: it is an `HttpOnly` cookie and the
   database stores a SHA-256 hash of it.
4. Point out that the validation rules exist in `validators.js` and are repeated by the Java
   service layer before any database write.
5. Demonstrate user separation: every finance query is scoped by `user_id`, so two accounts
   have independent ledgers.
6. Show the adapter seam: two flags in `config.js` switch between the live Java API and the
   offline adapter without touching page controllers.
7. Show the DSA helpers in `dsa.js` (merge sort, binary search, stack, queue, category tree)
   used by the ledger and reports.
8. Mention the exact-money design: SQLite stores integer cents, avoiding floating-point
   rounding errors in budgets and reports.
