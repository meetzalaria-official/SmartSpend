/* ==========================================================================
   SmartSpend · Money and date helpers
   Shared currency formatting and local-date utilities for every finance
   screen. Kept dependency-free so the pages work without a build step.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});

  const CURRENCIES = Object.freeze({
    INR: { code: "INR", symbol: "₹", locale: "en-IN", label: "Indian rupee (₹)" },
    USD: { code: "USD", symbol: "$", locale: "en-US", label: "US dollar ($)" },
    EUR: { code: "EUR", symbol: "€", locale: "de-DE", label: "Euro (€)" },
    GBP: { code: "GBP", symbol: "£", locale: "en-GB", label: "Pound sterling (£)" },
    AED: { code: "AED", symbol: "د.إ", locale: "en-AE", label: "UAE dirham (د.إ)" },
    SGD: { code: "SGD", symbol: "S$", locale: "en-SG", label: "Singapore dollar (S$)" },
  });

  let activeCurrency = "INR";
  let activeDateFormat = "DD MMM YYYY";

  const DATE_FORMATS = Object.freeze([
    { value: "DD MMM YYYY", label: "31 Dec 2026" },
    { value: "DD/MM/YYYY", label: "31/12/2026" },
    { value: "MM/DD/YYYY", label: "12/31/2026" },
    { value: "YYYY-MM-DD", label: "2026-12-31" },
  ]);

  function setCurrency(code) {
    if (CURRENCIES[code]) activeCurrency = code;
    return activeCurrency;
  }

  function setDateFormat(pattern) {
    const wanted = String(pattern || "").toUpperCase();
    if (DATE_FORMATS.some((item) => item.value === wanted)) activeDateFormat = wanted;
    return activeDateFormat;
  }

  function getDateFormat() {
    return activeDateFormat;
  }

  function getCurrency() {
    return activeCurrency;
  }

  function currencyInfo(code) {
    return CURRENCIES[code || activeCurrency] || CURRENCIES.INR;
  }

  function symbol() {
    return currencyInfo().symbol;
  }

  function numberOptions(options) {
    const settings = options || {};
    const decimals = Number.isFinite(settings.decimals) ? settings.decimals : 0;
    const result = {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    };
    if (settings.compact) {
      result.notation = "compact";
      result.maximumFractionDigits = 1;
      result.minimumFractionDigits = 0;
    }
    return result;
  }

  function format(value, options) {
    const amount = Number(value);
    const safe = Number.isFinite(amount) ? amount : 0;
    const info = currencyInfo(options && options.currency);
    try {
      return new Intl.NumberFormat(info.locale, {
        style: "currency",
        currency: info.code,
        ...numberOptions(options),
      }).format(safe);
    } catch (error) {
      return `${info.symbol}${safe.toFixed(0)}`;
    }
  }

  function formatPlain(value, decimals) {
    const amount = Number(value);
    const safe = Number.isFinite(amount) ? amount : 0;
    try {
      return new Intl.NumberFormat(currencyInfo().locale, {
        maximumFractionDigits: Number.isFinite(decimals) ? decimals : 0,
        minimumFractionDigits: Number.isFinite(decimals) ? decimals : 0,
      }).format(safe);
    } catch (error) {
      return String(Math.round(safe));
    }
  }

  function compact(value) {
    return format(value, { compact: true });
  }

  function parse(value) {
    const text = String(value == null ? "" : value).trim();
    if (!text) return 0;
    const cleaned = text.replace(/[^\d.,-]/g, "").replace(/,/g, "");
    const number = Number.parseFloat(cleaned);
    return Number.isFinite(number) ? number : 0;
  }

  function percent(part, total) {
    const top = Number(part) || 0;
    const bottom = Number(total) || 0;
    if (bottom <= 0) return 0;
    return Math.max(0, (top / bottom) * 100);
  }

  function clampPercent(value) {
    return Math.min(100, Math.max(0, Number(value) || 0));
  }

  function signed(value, options) {
    const amount = Number(value) || 0;
    const prefix = amount > 0 ? "+" : amount < 0 ? "−" : "";
    return `${prefix}${format(Math.abs(amount), options)}`;
  }

  /* ------------------------------------------------------------------------
     Dates — every date in the demo store is a local YYYY-MM-DD string.
     Using local dates avoids the timezone drift that `new Date("2026-01-01")`
     introduces for users east or west of UTC.
     ------------------------------------------------------------------------ */
  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toISO(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseISO(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function todayISO() {
    return toISO(new Date());
  }

  function monthKey(value) {
    const text = String(value || "");
    if (/^\d{4}-\d{2}$/.test(text)) return text;
    const date = value instanceof Date ? value : parseISO(value);
    if (!date) return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  function currentMonth() {
    return monthKey(new Date());
  }

  function monthDate(month) {
    const key = monthKey(month) || currentMonth();
    return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
  }

  function addMonths(month, delta) {
    const date = monthDate(month);
    date.setMonth(date.getMonth() + Number(delta || 0));
    return monthKey(date);
  }

  function addDays(iso, delta) {
    const date = parseISO(iso);
    if (!date) return "";
    date.setDate(date.getDate() + Number(delta || 0));
    return toISO(date);
  }

  function monthRange(month) {
    const date = monthDate(month);
    const year = date.getFullYear();
    const index = date.getMonth();
    const last = new Date(year, index + 1, 0).getDate();
    return { from: `${year}-${pad(index + 1)}-01`, to: `${year}-${pad(index + 1)}-${pad(last)}` };
  }

  function monthLabel(month, options) {
    const date = monthDate(month);
    const settings = options || {};
    try {
      return new Intl.DateTimeFormat(currencyInfo().locale, {
        month: settings.short ? "short" : "long",
        year: settings.year === false ? undefined : "numeric",
      }).format(date);
    } catch (error) {
      return month;
    }
  }

  function formatISODate(value, options) {
    const date = parseISO(value);
    if (!date) return "—";

    if (!options) {
      const day = pad(date.getDate());
      const month = pad(date.getMonth() + 1);
      const year = String(date.getFullYear());
      const shortMonth = new Intl.DateTimeFormat(currencyInfo().locale, { month: "short" }).format(date);
      if (activeDateFormat === "DD/MM/YYYY") return `${day}/${month}/${year}`;
      if (activeDateFormat === "MM/DD/YYYY") return `${month}/${day}/${year}`;
      if (activeDateFormat === "YYYY-MM-DD") return `${year}-${month}-${day}`;
      return `${day} ${shortMonth} ${year}`;
    }

    try {
      return new Intl.DateTimeFormat(currencyInfo().locale, options).format(date);
    } catch (error) {
      return toISO(date);
    }
  }

  function formatInputDate(value) {
    const date = parseISO(value);
    return date ? toISO(date) : "";
  }

  function dayLabel(value) {
    return formatISODate(value, { weekday: "short", day: "numeric", month: "short" });
  }

  function daysBetween(from, to) {
    const start = parseISO(from);
    const end = parseISO(to);
    if (!start || !end) return 0;
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  }

  function daysInMonth(month) {
    const range = monthRange(month);
    return Number(range.to.slice(8, 10));
  }

  function monthOfDate(date) {
    return monthKey(date);
  }

  function relative(value) {
    const date = parseISO(value);
    if (!date) return "—";
    const days = daysBetween(todayISO(), toISO(date));
    const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    if (Math.abs(days) >= 30) return formatter.format(Math.round(days / 30), "month");
    if (Math.abs(days) >= 1) return formatter.format(days, "day");
    return "today";
  }

  function lastMonths(count, endMonth) {
    const total = Math.max(1, Number(count) || 1);
    const end = monthKey(endMonth) || currentMonth();
    const list = [];
    for (let index = total - 1; index >= 0; index -= 1) list.push(addMonths(end, -index));
    return list;
  }

  SS.money = {
    CURRENCIES,
    DATE_FORMATS,
    setCurrency,
    setDateFormat,
    getDateFormat,
    getCurrency,
    currencyInfo,
    symbol,
    format,
    formatPlain,
    compact,
    parse,
    percent,
    clampPercent,
    signed,
  };

  SS.dates = {
    toISO,
    parseISO,
    todayISO,
    monthKey,
    currentMonth,
    monthDate,
    addMonths,
    addDays,
    monthRange,
    monthLabel,
    format: formatISODate,
    formatInput: formatInputDate,
    dayLabel,
    daysBetween,
    daysInMonth,
    monthOfDate,
    relative,
    lastMonths,
  };
})(window);
