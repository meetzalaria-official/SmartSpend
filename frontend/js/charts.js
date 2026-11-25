/* ==========================================================================
   SmartSpend · Dependency-free SVG charts
   Line/area, grouped bars, donut and sparkline renderers. Each chart includes
   a text description so screen readers can explain it.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const money = SS.money;

  function escape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function resolve(target) {
    if (!target) return null;
    return typeof target === "string" ? document.querySelector(target) : target;
  }

  function niceCeil(value) {
    const amount = Math.max(1, Number(value) || 1);
    const power = Math.pow(10, Math.floor(Math.log10(amount)));
    const scaled = amount / power;
    const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
    return step * power;
  }

  function empty(container, message) {
    container.innerHTML = `<div class="chart-empty"><svg class="icon" aria-hidden="true"><use href="#i-chart"></use></svg><span>${escape(
      message || "No data for this period yet."
    )}</span></div>`;
  }

  function legend(series) {
    return `<div class="chart-legend">${series
      .map(
        (item) =>
          `<span class="chart-legend__item"><span class="chart-legend__dot" style="background:${escape(
            item.color
          )}"></span>${escape(item.name)}</span>`
      )
      .join("")}</div>`;
  }

  function lineChart(target, config) {
    const container = resolve(target);
    if (!container) return;
    const settings = config || {};
    const labels = settings.labels || [];
    const series = (settings.series || []).filter((item) => Array.isArray(item.values));
    if (!labels.length || !series.length) {
      empty(container, settings.emptyMessage);
      return;
    }

    const width = 760;
    const height = settings.height || 250;
    const padding = { top: 18, right: 16, bottom: 32, left: 52 };
    const values = series.flatMap((item) => item.values.map((value) => Number(value) || 0));
    const max = niceCeil(Math.max(1, ...values));
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const step = labels.length > 1 ? plotWidth / (labels.length - 1) : 0;
    const x = (index) => padding.left + (labels.length > 1 ? index * step : plotWidth / 2);
    const y = (value) => padding.top + plotHeight - (Math.max(0, value) / max) * plotHeight;
    const formatValue = settings.formatValue || ((value) => money.compact(value));
    const grid = [];
    const ticks = 4;

    for (let index = 0; index <= ticks; index += 1) {
      const value = (max / ticks) * index;
      const position = y(value);
      grid.push(
        `<line class="chart-grid-line" x1="${padding.left}" y1="${position}" x2="${
          width - padding.right
        }" y2="${position}"/>`,
        `<text class="chart-axis-text" x="${padding.left - 10}" y="${position + 4}" text-anchor="end">${escape(
          formatValue(value)
        )}</text>`
      );
    }

    const labelNodes = labels
      .map((label, index) => {
        const showEvery = labels.length > 8 ? 2 : 1;
        if (index % showEvery !== 0 && index !== labels.length - 1) return "";
        return `<text class="chart-axis-text" x="${x(index)}" y="${height - 9}" text-anchor="middle">${escape(
          label
        )}</text>`;
      })
      .join("");

    const paths = series
      .map((item) => {
        const points = item.values.map((value, index) => `${x(index)},${y(Number(value) || 0)}`).join(" ");
        const dots = item.values
          .map(
            (value, index) =>
              `<circle class="chart-dot" cx="${x(index)}" cy="${y(Number(value) || 0)}" r="3.4" style="color:${escape(
                item.color
              )}"><title>${escape(labels[index])}: ${escape(formatValue(Number(value) || 0))}</title></circle>`
          )
          .join("");
        const area =
          item.area === false
            ? ""
            : `<polygon class="chart-area" points="${x(0)},${y(0)} ${points} ${x(
                labels.length - 1
              )},${y(0)}" style="color:${escape(item.color)}"/>`;
        return `${area}<polyline class="chart-line" points="${points}" style="color:${escape(
          item.color
        )}"/>${dots}`;
      })
      .join("");

    const description = series
      .map((item) => `${item.name}: ${item.values.map((value) => formatValue(value)).join(", ")}`)
      .join(". ");

    container.innerHTML = `
      <div class="chart">
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(
          settings.title || "Trend chart"
        )}">
          <desc>${escape(description)}</desc>
          ${grid.join("")}
          ${labelNodes}
          ${paths}
        </svg>
        ${legend(series)}
      </div>`;
  }

  function barChart(target, config) {
    const container = resolve(target);
    if (!container) return;
    const settings = config || {};
    const labels = settings.labels || [];
    const series = (settings.series || []).filter((item) => Array.isArray(item.values));
    if (!labels.length || !series.length) {
      empty(container, settings.emptyMessage);
      return;
    }

    const width = 760;
    const height = settings.height || 250;
    const padding = { top: 18, right: 16, bottom: 32, left: 52 };
    const values = series.flatMap((item) => item.values.map((value) => Number(value) || 0));
    const max = niceCeil(Math.max(1, ...values));
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const groupWidth = plotWidth / labels.length;
    const gap = 8;
    const barWidth = Math.max(4, (groupWidth - gap * 2) / series.length);
    const y = (value) => padding.top + plotHeight - (Math.max(0, value) / max) * plotHeight;
    const formatValue = settings.formatValue || ((value) => money.compact(value));
    const grid = [];
    const ticks = 4;

    for (let index = 0; index <= ticks; index += 1) {
      const value = (max / ticks) * index;
      const position = y(value);
      grid.push(
        `<line class="chart-grid-line" x1="${padding.left}" y1="${position}" x2="${
          width - padding.right
        }" y2="${position}"/>`,
        `<text class="chart-axis-text" x="${padding.left - 10}" y="${position + 4}" text-anchor="end">${escape(
          formatValue(value)
        )}</text>`
      );
    }

    let bars = "";
    labels.forEach((label, labelIndex) => {
      const base = padding.left + labelIndex * groupWidth + gap;
      series.forEach((item, seriesIndex) => {
        const value = Number(item.values[labelIndex]) || 0;
        const barHeight = Math.max(0, padding.top + plotHeight - y(value));
        const barX = base + seriesIndex * barWidth;
        bars += `<rect class="chart-bar" x="${barX}" y="${y(value)}" width="${Math.max(
          2,
          barWidth - 2
        )}" height="${barHeight}" rx="3" style="color:${escape(item.color)}"><title>${escape(
          label
        )} · ${escape(item.name)}: ${escape(formatValue(value))}</title></rect>`;
      });
      bars += `<text class="chart-axis-text" x="${
        padding.left + labelIndex * groupWidth + groupWidth / 2
      }" y="${height - 9}" text-anchor="middle">${escape(label)}</text>`;
    });

    const description = series
      .map((item) => `${item.name}: ${item.values.map((value) => formatValue(value)).join(", ")}`)
      .join(". ");

    container.innerHTML = `
      <div class="chart">
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(
          settings.title || "Monthly comparison"
        )}">
          <desc>${escape(description)}</desc>
          ${grid.join("")}
          ${bars}
        </svg>
        ${legend(series)}
      </div>`;
  }

  function donut(target, config) {
    const container = resolve(target);
    if (!container) return;
    const settings = config || {};
    const items = (settings.items || []).filter((item) => Number(item.value) > 0);
    if (!items.length) {
      empty(container, settings.emptyMessage || "No spending recorded for this period.");
      return;
    }
    const total = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const segments = items
      .map((item) => {
        const value = Number(item.value) || 0;
        const length = (value / total) * circumference;
        const segment = `<circle class="chart-donut__segment" cx="80" cy="80" r="${radius}" stroke-dasharray="${Math.max(
          0,
          length - 2
        )} ${Math.max(0, circumference - length + 2)}" stroke-dashoffset="${-offset}" style="color:${escape(
          item.color
        )}"><title>${escape(item.label)}: ${escape(settings.formatValue ? settings.formatValue(value) : money.format(value))}</title></circle>`;
        offset += length;
        return segment;
      })
      .join("");

    const legendItems = items
      .map(
        (item) => `
        <li class="chart-legend__item chart-legend__item--stacked">
          <span class="chart-legend__dot" style="background:${escape(item.color)}"></span>
          <span class="chart-legend__label">${escape(item.label)}</span>
          <strong>${escape(settings.formatValue ? settings.formatValue(item.value) : money.format(item.value))}</strong>
          <span class="chart-legend__percent">${Math.round((Number(item.value) / total) * 100)}%</span>
        </li>`
      )
      .join("");

    container.innerHTML = `
      <div class="chart chart--donut">
        <div class="chart-donut">
          <svg class="chart-donut__svg" viewBox="0 0 160 160" role="img" aria-label="${escape(
            settings.title || "Spending by category"
          )}">
            <desc>${escape(
              items
                .map(
                  (item) =>
                    `${item.label}: ${Math.round((Number(item.value) / total) * 100)} percent`
                )
                .join(", ")
            )}</desc>
            <circle class="chart-donut__track" cx="80" cy="80" r="${radius}"/>
            <g transform="rotate(-90 80 80)">${segments}</g>
            <text class="chart-donut__value" x="80" y="77" text-anchor="middle">${escape(
              settings.centerValue || money.compact(total)
            )}</text>
            <text class="chart-donut__label" x="80" y="96" text-anchor="middle">${escape(
              settings.centerLabel || "Total spent"
            )}</text>
          </svg>
        </div>
        <ul class="chart-legend chart-legend--stacked">${legendItems}</ul>
      </div>`;
  }

  function sparkline(target, values, color) {
    const container = resolve(target);
    if (!container) return;
    const list = (values || []).map((value) => Number(value) || 0);
    if (list.length < 2) {
      container.innerHTML = "";
      return;
    }
    const width = 120;
    const height = 34;
    const max = Math.max(1, ...list);
    const min = Math.min(0, ...list);
    const spread = max - min || 1;
    const points = list
      .map((value, index) => {
        const x = (index / (list.length - 1)) * width;
        const y = height - ((value - min) / spread) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    container.innerHTML = `<svg class="sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${points}" style="color:${escape(
      color || "#6366f1"
    )}"/></svg>`;
  }

  SS.charts = { lineChart, barChart, donut, sparkline, escape };
})(window);
