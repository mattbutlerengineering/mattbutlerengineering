/**
 * analytics.js — Self-contained quality dashboard for AI loop metrics.
 *
 * Load via <script src="analytics.js"></script> and call:
 *   renderQualityDashboard('container-id')
 *
 * Data sources (relative to repo root):
 *   - metrics/acmm-pr-history.jsonl
 *   - metrics/service-health.jsonl
 *   - metrics/log.md  (parsed for ACMM badge)
 *
 * Falls back to placeholder UI when data is unavailable.
 *
 * Security: all data values are escaped via escapeHtml() before insertion
 * into markup. Data is sourced from local committed JSONL files only.
 */

/* exported renderQualityDashboard */
/* eslint-disable no-var */

(function (root) {
  "use strict";

  // ── Security: HTML escaping ──────────────────────────────────────

  /**
   * Escape a value for safe insertion into HTML markup.
   * Prevents XSS even if metric files contain unexpected content.
   */
  function escapeHtml(str) {
    var s = String(str);
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ── Helpers ──────────────────────────────────────────────────────

  function parseJsonl(raw) {
    return raw
      .split("\n")
      .filter(function (line) {
        return line.trim().length > 0;
      })
      .reduce(function (acc, line) {
        try {
          acc.push(JSON.parse(line));
        } catch (_e) {
          /* skip malformed lines */
        }
        return acc;
      }, []);
  }

  function parseAcmmBadge(logMd) {
    var match = logMd.match(
      /ACMM Level (\d+)\s*[·\-]\s*(\d+)\/(\d+)\s*passing/,
    );
    if (!match) return null;
    var levelNames = [
      "Prerequisites",
      "Assisted",
      "Instructed",
      "Measured",
      "Adaptive",
      "Semi-Automated",
      "Autonomous",
    ];
    var level = parseInt(match[1], 10);
    return {
      level: level,
      name: levelNames[level] || "L" + level,
      passing: parseInt(match[2], 10),
      total: parseInt(match[3], 10),
    };
  }

  function formatPct(n) {
    return (Number(n) * 100).toFixed(1) + "%";
  }

  function badgeClass(rate) {
    if (rate >= 0.9) return "qd-badge--ok";
    if (rate >= 0.7) return "qd-badge--warn";
    return "qd-badge--err";
  }

  function barColor(rate) {
    if (rate >= 0.9) return "qd-bar-fill--green";
    if (rate >= 0.7) return "qd-bar-fill--yellow";
    return "qd-bar-fill--red";
  }

  // ── DOM-based rendering ──────────────────────────────────────────
  // Uses createElement / textContent instead of innerHTML to avoid XSS.

  function el(tag, className, textContent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent !== undefined) node.textContent = String(textContent);
    return node;
  }

  function injectStyles() {
    if (document.getElementById("qd-styles")) return;
    var style = document.createElement("style");
    style.id = "qd-styles";
    style.textContent =
      ".qd-root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:960px;margin:0 auto;padding:2rem 1rem;color:#1a1a2e}" +
      ".qd-header{display:flex;align-items:center;gap:1rem;margin-bottom:2rem;flex-wrap:wrap}" +
      ".qd-header h1{margin:0;font-size:1.5rem;font-weight:700}" +
      ".qd-badge{display:inline-flex;align-items:center;gap:.5rem;padding:.35rem .75rem;border-radius:999px;font-size:.85rem;font-weight:600}" +
      ".qd-badge--ok{background:#d4edda;color:#155724}" +
      ".qd-badge--warn{background:#fff3cd;color:#856404}" +
      ".qd-badge--err{background:#f8d7da;color:#721c24}" +
      ".qd-badge--info{background:#e2e3f1;color:#383d6e}" +
      ".qd-section{margin-bottom:2rem}" +
      ".qd-section h2{font-size:1.15rem;font-weight:600;margin:0 0 .75rem;padding-bottom:.35rem;border-bottom:2px solid #e2e3f1}" +
      ".qd-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem}" +
      ".qd-card{background:#f8f9fa;border-radius:8px;padding:1rem}" +
      ".qd-card__label{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#6c757d;margin-bottom:.25rem}" +
      ".qd-card__value{font-size:1.5rem;font-weight:700}" +
      ".qd-bar-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}" +
      ".qd-bar-label{width:90px;font-size:.85rem;text-align:right;flex-shrink:0}" +
      ".qd-bar-track{flex:1;height:20px;background:#e9ecef;border-radius:4px;overflow:hidden}" +
      ".qd-bar-fill{height:100%;border-radius:4px;transition:width .4s ease}" +
      ".qd-bar-fill--green{background:#28a745}" +
      ".qd-bar-fill--yellow{background:#ffc107}" +
      ".qd-bar-fill--red{background:#dc3545}" +
      ".qd-bar-pct{width:48px;font-size:.85rem;font-weight:600}" +
      ".qd-services{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.75rem}" +
      ".qd-svc{display:flex;align-items:center;gap:.5rem;padding:.65rem 1rem;border-radius:6px;background:#f8f9fa;font-size:.9rem}" +
      ".qd-svc__dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}" +
      ".qd-svc__dot--ok{background:#28a745}" +
      ".qd-svc__dot--degraded{background:#ffc107}" +
      ".qd-svc__dot--down{background:#dc3545}" +
      ".qd-svc__name{font-weight:600}" +
      ".qd-svc__latency{color:#6c757d;font-size:.8rem;margin-left:auto}" +
      ".qd-empty{color:#6c757d;font-style:italic;padding:1rem}" +
      ".qd-footer{margin-top:2rem;font-size:.75rem;color:#adb5bd;text-align:center}";
    document.head.appendChild(style);
  }

  // ── Component builders (DOM-safe) ────────────────────────────────

  function buildAcmmBadge(badge) {
    if (!badge) return null;
    var span = el("span", "qd-badge qd-badge--info");
    span.textContent =
      "ACMM L" +
      badge.level +
      " — " +
      escapeHtml(badge.name) +
      " (" +
      badge.passing +
      "/" +
      badge.total +
      ")";
    return span;
  }

  function buildCard(label, value) {
    var card = el("div", "qd-card");
    card.appendChild(el("div", "qd-card__label", label));
    card.appendChild(el("div", "qd-card__value", value));
    return card;
  }

  function buildPrSection(entries) {
    var section = el("div", "qd-section");
    section.appendChild(el("h2", null, "PR Acceptance"));

    if (entries.length === 0) {
      section.appendChild(
        el(
          "p",
          "qd-empty",
          "No PR acceptance data available. Place metrics in metrics/acmm-pr-history.jsonl.",
        ),
      );
      return section;
    }

    var latest = entries[entries.length - 1];

    // Summary cards
    var cards = el("div", "qd-cards");
    var rateCard = buildCard("Acceptance Rate", "");
    var rateBadge = el(
      "span",
      "qd-badge " + badgeClass(latest.acceptanceRate),
      formatPct(latest.acceptanceRate),
    );
    rateCard.querySelector(".qd-card__value").textContent = "";
    rateCard.querySelector(".qd-card__value").appendChild(rateBadge);
    cards.appendChild(rateCard);
    cards.appendChild(
      buildCard("PRs (" + latest.windowDays + "d)", latest.total),
    );
    cards.appendChild(buildCard("Merged", latest.merged));
    cards.appendChild(buildCard("Mean Close (hrs)", latest.meanCloseHours));
    section.appendChild(cards);

    // Trend bars
    if (entries.length >= 1) {
      section.appendChild(el("h3", null, "Acceptance Rate Trend"));
      entries.forEach(function (e) {
        var row = el("div", "qd-bar-row");
        row.appendChild(el("span", "qd-bar-label", escapeHtml(e.date)));

        var track = el("div", "qd-bar-track");
        var fill = el("div", "qd-bar-fill " + barColor(e.acceptanceRate));
        fill.style.width = (e.acceptanceRate * 100).toFixed(1) + "%";
        track.appendChild(fill);
        row.appendChild(track);

        row.appendChild(
          el("span", "qd-bar-pct", formatPct(e.acceptanceRate)),
        );
        section.appendChild(row);
      });
    }

    return section;
  }

  function buildHealthSection(snapshots) {
    var section = el("div", "qd-section");
    section.appendChild(el("h2", null, "Service Health"));

    if (snapshots.length === 0) {
      section.appendChild(
        el(
          "p",
          "qd-empty",
          "No service health data available. Place metrics in metrics/service-health.jsonl.",
        ),
      );
      return section;
    }

    var latest = snapshots[snapshots.length - 1];
    var grid = el("div", "qd-services");

    latest.services.forEach(function (svc) {
      var card = el("div", "qd-svc");
      // Validate status to prevent class injection
      var safeStatus = ["ok", "degraded", "down"].indexOf(svc.status) >= 0
        ? svc.status
        : "down";
      card.appendChild(el("span", "qd-svc__dot qd-svc__dot--" + safeStatus));
      card.appendChild(el("span", "qd-svc__name", escapeHtml(svc.service)));
      if (svc.latency_ms !== null) {
        card.appendChild(
          el("span", "qd-svc__latency", svc.latency_ms + "ms"),
        );
      }
      grid.appendChild(card);
    });

    section.appendChild(grid);

    var ts = el("p", null, "Last checked: " + new Date(latest.timestamp).toLocaleString());
    ts.style.fontSize = ".8rem";
    ts.style.color = "#6c757d";
    ts.style.marginTop = ".5rem";
    section.appendChild(ts);

    return section;
  }

  function buildDashboard(data) {
    injectStyles();

    var root = el("div", "qd-root");

    // Header
    var header = el("div", "qd-header");
    header.appendChild(el("h1", null, "Quality Dashboard"));
    var badge = buildAcmmBadge(data.acmm);
    if (badge) header.appendChild(badge);
    root.appendChild(header);

    // Sections
    root.appendChild(buildPrSection(data.prAcceptance));
    root.appendChild(buildHealthSection(data.serviceHealth));

    // Footer
    var footer = el(
      "div",
      "qd-footer",
      "Fetched at " + data.fetchedAt + " · AI Codebase Maturity Model",
    );
    root.appendChild(footer);

    return root;
  }

  // ── Data fetching ────────────────────────────────────────────────

  function fetchText(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    });
  }

  function loadMetrics(basePath) {
    var prPath = basePath + "/metrics/acmm-pr-history.jsonl";
    var healthPath = basePath + "/metrics/service-health.jsonl";
    var logPath = basePath + "/metrics/log.md";

    return Promise.allSettled([
      fetchText(prPath),
      fetchText(healthPath),
      fetchText(logPath),
    ]).then(function (results) {
      var prRaw = results[0].status === "fulfilled" ? results[0].value : "";
      var healthRaw =
        results[1].status === "fulfilled" ? results[1].value : "";
      var logRaw = results[2].status === "fulfilled" ? results[2].value : "";

      return {
        prAcceptance: parseJsonl(prRaw),
        serviceHealth: parseJsonl(healthRaw),
        acmm: parseAcmmBadge(logRaw),
        fetchedAt: new Date().toISOString(),
      };
    });
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Render the quality dashboard into a DOM container.
   *
   * @param {string} containerId  - The id of the target DOM element.
   * @param {object} [options]    - Optional configuration.
   * @param {string} [options.basePath] - Repo root URL for fetching metrics.
   *   Defaults to '..' (assumes the HTML page is in web/).
   * @param {object} [options.data] - Pre-loaded data; skips fetch if provided.
   */
  function renderQualityDashboard(containerId, options) {
    var opts = options || {};
    var container = document.getElementById(containerId);
    if (!container) {
      console.error(
        "[analytics] Container not found: #" + containerId,
      );
      return;
    }

    // Clear container safely
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(el("p", null, "Loading metrics..."));

    if (opts.data) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      container.appendChild(buildDashboard(opts.data));
      return;
    }

    var basePath = opts.basePath || "..";
    loadMetrics(basePath)
      .then(function (data) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        container.appendChild(buildDashboard(data));
      })
      .catch(function () {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        container.appendChild(
          buildDashboard({
            prAcceptance: [],
            serviceHealth: [],
            acmm: null,
            fetchedAt: new Date().toISOString(),
          }),
        );
      });
  }

  // Export for both module and script contexts.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      renderQualityDashboard: renderQualityDashboard,
    };
  }
  root.renderQualityDashboard = renderQualityDashboard;
})(typeof globalThis !== "undefined" ? globalThis : this);
