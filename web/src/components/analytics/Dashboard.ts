/**
 * Dashboard — Rendering logic for the AI quality dashboard.
 *
 * Pure functions that produce HTML strings from QualityDashboardData.
 * No DOM side-effects; the caller inserts the returned markup.
 */

import type {
  AcmmBadge,
  PrAcceptanceEntry,
  QualityDashboardData,
  ServiceHealthEntry,
  ServiceHealthSnapshot,
} from "./QualityMetrics.js";

/** CSS styles for the dashboard, injected once per page. */
export function renderStyles(): string {
  return `<style>
  .qd-root {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 1rem;
    color: #1a1a2e;
  }
  .qd-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }
  .qd-header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
  }
  .qd-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .qd-badge--ok   { background: #d4edda; color: #155724; }
  .qd-badge--warn { background: #fff3cd; color: #856404; }
  .qd-badge--err  { background: #f8d7da; color: #721c24; }
  .qd-badge--info { background: #e2e3f1; color: #383d6e; }

  .qd-section { margin-bottom: 2rem; }
  .qd-section h2 {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0 0 0.75rem;
    padding-bottom: 0.35rem;
    border-bottom: 2px solid #e2e3f1;
  }

  .qd-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
  .qd-card {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
  }
  .qd-card__label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6c757d;
    margin-bottom: 0.25rem;
  }
  .qd-card__value {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .qd-bar-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .qd-bar-label {
    width: 90px;
    font-size: 0.85rem;
    text-align: right;
    flex-shrink: 0;
  }
  .qd-bar-track {
    flex: 1;
    height: 20px;
    background: #e9ecef;
    border-radius: 4px;
    overflow: hidden;
  }
  .qd-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.4s ease;
  }
  .qd-bar-fill--green  { background: #28a745; }
  .qd-bar-fill--yellow { background: #ffc107; }
  .qd-bar-fill--red    { background: #dc3545; }
  .qd-bar-pct {
    width: 48px;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .qd-services {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.75rem;
  }
  .qd-svc {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 1rem;
    border-radius: 6px;
    background: #f8f9fa;
    font-size: 0.9rem;
  }
  .qd-svc__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .qd-svc__dot--ok      { background: #28a745; }
  .qd-svc__dot--degraded { background: #ffc107; }
  .qd-svc__dot--down    { background: #dc3545; }
  .qd-svc__name { font-weight: 600; }
  .qd-svc__latency { color: #6c757d; font-size: 0.8rem; margin-left: auto; }

  .qd-empty {
    color: #6c757d;
    font-style: italic;
    padding: 1rem;
  }
  .qd-footer {
    margin-top: 2rem;
    font-size: 0.75rem;
    color: #adb5bd;
    text-align: center;
  }
</style>`;
}

function badgeVariant(rate: number): string {
  if (rate >= 0.9) return "ok";
  if (rate >= 0.7) return "warn";
  return "err";
}

function barColorClass(rate: number): string {
  if (rate >= 0.9) return "qd-bar-fill--green";
  if (rate >= 0.7) return "qd-bar-fill--yellow";
  return "qd-bar-fill--red";
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function renderAcmmBadge(badge: AcmmBadge | null): string {
  if (!badge) return "";
  return `<span class="qd-badge qd-badge--info">ACMM L${badge.level} &mdash; ${badge.name} (${badge.passing}/${badge.total})</span>`;
}

function renderPrCards(entries: readonly PrAcceptanceEntry[]): string {
  if (entries.length === 0) {
    return `<p class="qd-empty">No PR acceptance data available.</p>`;
  }
  const latest = entries[entries.length - 1];
  return `<div class="qd-cards">
    <div class="qd-card">
      <div class="qd-card__label">Acceptance Rate</div>
      <div class="qd-card__value">${formatPct(latest.acceptanceRate)}</div>
    </div>
    <div class="qd-card">
      <div class="qd-card__label">PRs (${latest.windowDays}d)</div>
      <div class="qd-card__value">${latest.total}</div>
    </div>
    <div class="qd-card">
      <div class="qd-card__label">Merged</div>
      <div class="qd-card__value">${latest.merged}</div>
    </div>
    <div class="qd-card">
      <div class="qd-card__label">Mean Close (hrs)</div>
      <div class="qd-card__value">${latest.meanCloseHours}</div>
    </div>
  </div>`;
}

function renderPrTrend(entries: readonly PrAcceptanceEntry[]): string {
  if (entries.length < 2) return "";
  return `
  <h3 style="font-size:0.95rem;margin:1rem 0 0.5rem;">Acceptance Rate Trend</h3>
  ${entries
    .map((e) => {
      const pct = e.acceptanceRate * 100;
      return `<div class="qd-bar-row">
      <span class="qd-bar-label">${e.date}</span>
      <div class="qd-bar-track">
        <div class="qd-bar-fill ${barColorClass(e.acceptanceRate)}" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <span class="qd-bar-pct">${formatPct(e.acceptanceRate)}</span>
    </div>`;
    })
    .join("\n")}`;
}

function renderServiceHealth(
  snapshots: readonly ServiceHealthSnapshot[],
): string {
  if (snapshots.length === 0) {
    return `<p class="qd-empty">No service health data available.</p>`;
  }
  const latest = snapshots[snapshots.length - 1];
  return `<div class="qd-services">
    ${latest.services
      .map(
        (svc: ServiceHealthEntry) => `
      <div class="qd-svc">
        <span class="qd-svc__dot qd-svc__dot--${svc.status}"></span>
        <span class="qd-svc__name">${svc.service}</span>
        ${svc.latency_ms !== null ? `<span class="qd-svc__latency">${svc.latency_ms}ms</span>` : ""}
      </div>`,
      )
      .join("\n")}
  </div>
  <p style="font-size:0.8rem;color:#6c757d;margin-top:0.5rem;">Last checked: ${new Date(latest.timestamp).toLocaleString()}</p>`;
}

/** Render the full dashboard HTML for a given container. */
export function renderDashboard(data: QualityDashboardData): string {
  return `
  ${renderStyles()}
  <div class="qd-root">
    <div class="qd-header">
      <h1>Quality Dashboard</h1>
      ${renderAcmmBadge(data.acmm)}
    </div>

    <div class="qd-section">
      <h2>PR Acceptance</h2>
      ${renderPrCards(data.prAcceptance)}
      ${renderPrTrend(data.prAcceptance)}
    </div>

    <div class="qd-section">
      <h2>Service Health</h2>
      ${renderServiceHealth(data.serviceHealth)}
    </div>

    <div class="qd-footer">
      Fetched at ${data.fetchedAt} &middot; AI Codebase Maturity Model
    </div>
  </div>`;
}
