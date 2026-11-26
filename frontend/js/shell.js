/* ==========================================================================
   SmartSpend · Shared application shell
   Renders the sidebar, top bar, notifications and account menu for every
   signed-in screen. Pages only provide their main content.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const money = SS.money;
  const dates = SS.dates;

  const NAV_GROUPS = [
    {
      label: "Money",
      items: [
        { id: "dashboard", label: "Dashboard", href: "dashboard.html", icon: "grid" },
        { id: "transactions", label: "Transactions", href: "transactions.html", icon: "wallet" },
        { id: "budgets", label: "Budgets", href: "budgets.html", icon: "target" },
        { id: "goals", label: "Savings goals", href: "goals.html", icon: "piggy-bank" },
        { id: "categories", label: "Categories", href: "categories.html", icon: "tag" },
        { id: "reports", label: "Reports", href: "reports.html", icon: "pie" },
      ],
    },
    {
      label: "Workspace",
      items: [
        { id: "account", label: "Account", href: "account.html", icon: "user" },
        { id: "settings", label: "Settings", href: "settings.html", icon: "settings" },
      ],
    },
  ];

  let mountPromise = null;
  let context = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function navHtml(active) {
    return NAV_GROUPS.map(
      (group) => `
        <p class="nav-label">${group.label}</p>
        ${group.items
          .map(
            (item) => `
            <a class="nav-item${item.id === active ? " is-active" : ""}" href="${item.href}" data-nav="${
              item.id
            }"${item.id === active ? ' aria-current="page"' : ""}>
              <svg class="icon" aria-hidden="true"><use href="#i-${item.icon}"></use></svg>
              ${item.label}
            </a>`
          )
          .join("")}`
    ).join("");
  }

  function sidebarHtml(state) {
    const name = escapeHtml(state.user.fullName || "SmartSpend user");
    const email = escapeHtml(state.user.email || "");
    const initials = escapeHtml(ui.initials(state.user.fullName));
    const budget = state.overview.budget.total;
    const spent = budget.spent || 0;
    const amount = budget.amount || 0;
    const percent = money.clampPercent(budget.percent);

    return `
      <a class="sidebar__brand" href="dashboard.html">
        <span class="brand__mark">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" fill="currentColor" opacity=".25"/>
            <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
            <path d="M4 9h15M15.5 13.5h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
        </span>
        <span>
          SmartSpend
          <small>Personal finance</small>
        </span>
      </a>

      <nav class="sidebar__nav" aria-label="Main navigation">
        ${navHtml(state.active)}
      </nav>

      <div class="sidebar__spacer"></div>

      <div class="sidebar__help" id="sidebar-summary">
        <span class="sidebar__help-label">${escapeHtml(dates.monthLabel(dates.currentMonth(), { year: false }))} spending</span>
        <strong>${money.format(spent)}</strong>
        <div class="sidebar__meter" role="img" aria-label="${Math.round(percent)} percent of the monthly budget used">
          <span style="width:${percent}%"></span>
        </div>
        <p>${amount > 0 ? `of ${money.format(amount)} budget` : "No monthly budget set yet"}</p>
        <a href="budgets.html">Review budgets <svg class="icon icon--sm" aria-hidden="true"><use href="#i-arrow-right"></use></svg></a>
      </div>

      <div class="sidebar__profile">
        <span class="avatar avatar--sm" data-user-initials>${initials}</span>
        <div class="sidebar__profile-copy">
          <strong data-user-field="fullName">${name}</strong>
          <span data-user-field="email">${email}</span>
        </div>
        <button class="sidebar__logout" type="button" data-logout aria-label="Sign out" title="Sign out">
          <svg class="icon" aria-hidden="true"><use href="#i-logout"></use></svg>
        </button>
      </div>`;
  }

  function topbarHtml(state) {
    const name = escapeHtml(state.user.fullName || "SmartSpend user");
    const email = escapeHtml(state.user.email || "");
    const initials = escapeHtml(ui.initials(state.user.fullName));
    return `
      <div class="topbar__left">
        <button class="btn btn--icon sidebar-toggle" id="sidebar-toggle" type="button" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">
          <svg class="icon icon--lg" aria-hidden="true"><use href="#i-menu"></use></svg>
        </button>
        <div class="topbar__title">
          <strong>${escapeHtml(state.title || "Dashboard")}</strong>
          <span>${escapeHtml(state.subtitle || "Your money at a glance")}</span>
        </div>
      </div>

      <div class="topbar__actions">
        <button class="btn btn--primary btn--sm topbar__add" type="button" data-quick-add>
          <svg class="icon icon--sm" aria-hidden="true"><use href="#i-plus"></use></svg>
          <span>Add transaction</span>
        </button>

        <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch theme">
          <svg class="icon icon-sun" aria-hidden="true"><use href="#i-sun"></use></svg>
          <svg class="icon icon-moon" aria-hidden="true"><use href="#i-moon"></use></svg>
        </button>

        <div class="popover" id="notifications-popover">
          <button class="btn btn--icon notif-trigger" type="button" data-popover-trigger aria-expanded="false" aria-label="Notifications" title="Notifications">
            <svg class="icon icon--lg" aria-hidden="true"><use href="#i-bell"></use></svg>
            <span class="notif-dot" id="notif-dot" hidden></span>
          </button>
          <div class="popover__panel popover__panel--notifications" role="dialog" aria-label="Notifications">
            <div class="popover__head popover__head--row">
              <div>
                <strong>Notifications</strong>
                <span id="notif-summary">Budget and savings alerts</span>
              </div>
              <button class="link-button" type="button" id="notif-mark-all">Mark all read</button>
            </div>
            <div class="notif-list" id="notif-list"></div>
          </div>
        </div>

        <div class="popover" id="user-popover">
          <button class="user-trigger" type="button" data-popover-trigger aria-expanded="false">
            <span class="avatar avatar--sm" data-user-initials>${initials}</span>
            <span class="visually-hidden">Account menu</span>
            <svg class="icon" aria-hidden="true"><use href="#i-chevron-down"></use></svg>
          </button>
          <div class="popover__panel" role="menu" aria-label="Account menu">
            <div class="popover__user">
              <span class="avatar" data-user-initials>${initials}</span>
              <div class="popover__user-copy">
                <strong data-user-field="fullName">${name}</strong>
                <span data-user-field="email">${email}</span>
              </div>
            </div>
            <div class="popover__divider"></div>
            <a class="popover__item" href="dashboard.html" role="menuitem">
              <svg class="icon" aria-hidden="true"><use href="#i-grid"></use></svg>
              Dashboard
            </a>
            <a class="popover__item" href="account.html" role="menuitem">
              <svg class="icon" aria-hidden="true"><use href="#i-user"></use></svg>
              My account
            </a>
            <a class="popover__item" href="settings.html" role="menuitem">
              <svg class="icon" aria-hidden="true"><use href="#i-settings"></use></svg>
              Settings
            </a>
            <div class="popover__divider"></div>
            <button class="popover__item popover__item--danger" type="button" role="menuitem" data-logout>
              <svg class="icon" aria-hidden="true"><use href="#i-logout"></use></svg>
              Sign out
            </button>
          </div>
        </div>
      </div>`;
  }

  function notifItemHtml(item) {
    const tone = item.tone || "info";
    return `
      <div class="notif-item notif-item--${tone}${item.read ? "" : " is-unread"}" data-notif-id="${escapeHtml(
      item.id
    )}" data-notif-link="${escapeHtml(item.link || "")}" role="button" tabindex="0">
        <span class="notif-item__icon">
          <svg class="icon" aria-hidden="true"><use href="#i-${escapeHtml(item.icon || "bell")}"></use></svg>
        </span>
        <span class="notif-item__body">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.message)}</span>
          <small>${escapeHtml(ui.relativeTime(item.createdAt))}</small>
        </span>
        <button class="notif-item__dismiss" type="button" data-notif-dismiss="${escapeHtml(
          item.id
        )}" aria-label="Dismiss notification">
          <svg class="icon icon--sm" aria-hidden="true"><use href="#i-x"></use></svg>
        </button>
      </div>`;
  }

  function renderNotifications(items) {
    const list = document.getElementById("notif-list");
    const dot = document.getElementById("notif-dot");
    const summary = document.getElementById("notif-summary");
    if (!list) return;

    const unread = items.filter((item) => !item.read).length;
    if (dot) dot.hidden = unread === 0;
    if (summary) {
      summary.textContent = unread
        ? `${unread} unread notification${unread === 1 ? "" : "s"}`
        : "You are all caught up";
    }

    list.innerHTML = items.length
      ? items.slice(0, 12).map(notifItemHtml).join("")
      : `<div class="notif-empty">
           <svg class="icon" aria-hidden="true"><use href="#i-bell"></use></svg>
           <strong>All quiet for now</strong>
           <span>Budget warnings, goal reminders and weekly digests will appear here.</span>
         </div>`;

    list.querySelectorAll("[data-notif-id]").forEach((node) => {
      const open = () => {
        const id = node.getAttribute("data-notif-id");
        const link = node.getAttribute("data-notif-link");
        SS.finance.notifications.markRead(id).catch(() => {});
        if (link) window.location.href = link;
      };
      node.addEventListener("click", open);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });

    list.querySelectorAll("[data-notif-dismiss]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const id = button.getAttribute("data-notif-dismiss");
        await SS.finance.notifications.dismiss(id);
        refreshNotifications();
      });
    });
  }

  async function refreshNotifications() {
    if (!context) return [];
    const items = await SS.finance.notifications.list();
    context.notifications = items;
    renderNotifications(items);
    return items;
  }

  async function refreshSummary() {
    if (!context) return;
    const overview = await SS.finance.getOverview(dates.currentMonth());
    context.overview = overview;
    const holder = document.getElementById("sidebar-summary");
    if (holder) {
      const budget = overview.budget.total;
      const percent = money.clampPercent(budget.percent);
      holder.innerHTML = `
        <span class="sidebar__help-label">${escapeHtml(
          dates.monthLabel(dates.currentMonth(), { year: false })
        )} spending</span>
        <strong>${money.format(budget.spent)}</strong>
        <div class="sidebar__meter" role="img" aria-label="${Math.round(
          percent
        )} percent of the monthly budget used"><span style="width:${percent}%"></span></div>
        <p>${budget.amount > 0 ? `of ${money.format(budget.amount)} budget` : "No monthly budget set yet"}</p>
        <a href="budgets.html">Review budgets <svg class="icon icon--sm" aria-hidden="true"><use href="#i-arrow-right"></use></svg></a>`;
    }
  }

  function bindQuickAdd() {
    const open = () => {
      if (!SS.tx) {
        ui.toast.error("Transaction form unavailable", "Reload the page and try again.");
        return;
      }
      SS.tx.open({
        onSaved: () => {
          ui.toast.info("Ledger updated", "Your dashboard and summaries are refreshing.");
        },
      });
    };
    document.querySelectorAll("[data-quick-add]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";
      button.addEventListener("click", open);
    });
  }

  function bindSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const toggle = document.getElementById("sidebar-toggle");
    if (!sidebar || !overlay || !toggle) return;

    const open = () => {
      sidebar.classList.add("is-open");
      overlay.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("nav-open");
    };

    const close = () => {
      sidebar.classList.remove("is-open");
      overlay.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-open");
    };

    toggle.addEventListener("click", () =>
      sidebar.classList.contains("is-open") ? close() : open()
    );
    overlay.addEventListener("click", close);
    sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) close();
    });
  }

  function bindLogout() {
    document.querySelectorAll("[data-logout]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";
      button.addEventListener("click", async () => {
        if (button.dataset.busy === "true") return;
        button.dataset.busy = "true";
        button.disabled = true;
        SS.finance.resetCache();
        await SS.auth.logout();
      });
    });
  }

  function bindNotifications() {
    const markAll = document.getElementById("notif-mark-all");
    if (markAll) {
      markAll.addEventListener("click", async () => {
        if (!context) return;
        await SS.finance.notifications.markAllRead(context.notifications.map((item) => item.id));
        await refreshNotifications();
        ui.toast.success("Notifications cleared", "Everything is marked as read.");
      });
    }
  }

  async function boot(options) {
    const settings = options || {};
    if (document.body.dataset.shellState === "ready" && context) return context;

    const user = await SS.auth.requireAuth();
    if (!user) return null;

    const [prefs, notifications, overview] = await Promise.all([
      SS.finance.settings.get(),
      SS.finance.notifications.list(),
      SS.finance.getOverview(dates.currentMonth()),
    ]);

    money.setCurrency(prefs.currency || "INR");
    money.setDateFormat(prefs.dateFormat || "DD MMM YYYY");

    const state = {
      user,
      active: settings.active || "dashboard",
      title: settings.title || "Dashboard",
      subtitle: settings.subtitle || "Your money at a glance",
      prefs,
      notifications,
      overview,
    };

    const sidebar = document.getElementById("sidebar");
    const topbar = document.getElementById("topbar");
    if (sidebar) sidebar.innerHTML = sidebarHtml(state);
    if (topbar) topbar.innerHTML = topbarHtml(state);

    document.body.dataset.shellState = "ready";

    context = {
      user,
      settings: prefs,
      notifications,
      overview,
      active: state.active,
      refreshNotifications,
      refreshSummary,
      quickAdd: () => {
        const button = document.querySelector("[data-quick-add]");
        if (button) button.click();
      },
      logout: () => SS.auth.logout(),
    };

    ui.initTheme();
    bindSidebar();
    bindLogout();
    bindQuickAdd();
    bindNotifications();
    renderNotifications(notifications);
    ui.initPopover(document.getElementById("notifications-popover"));
    ui.initPopover(document.getElementById("user-popover"));

    document.addEventListener("ss:data-changed", () => {
      refreshNotifications().catch(() => {});
      refreshSummary().catch(() => {});
    });

    document.addEventListener("keydown", (event) => {
      const tag = (event.target && event.target.tagName) || "";
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (event.target && event.target.isContentEditable);
      if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        context.quickAdd();
      }
    });

    return context;
  }

  function mount(options) {
    if (mountPromise) return mountPromise;
    mountPromise = boot(options).catch((error) => {
      mountPromise = null;
      ui.toast.error(
        "Could not open the workspace",
        (error && error.message) || "Reload the page and try again."
      );
      throw error;
    });
    return mountPromise;
  }

  SS.shell = {
    mount,
    refreshNotifications,
    refreshSummary,
    NAV_GROUPS,
    get context() {
      return context;
    },
  };
})(window);
