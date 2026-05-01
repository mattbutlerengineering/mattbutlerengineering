/**
 * Analytics barrel export.
 *
 * Re-exports the data model and rendering logic so consumers can
 * `import { renderDashboard, QualityDashboardData } from './analytics'`.
 */

export {
  type AcmmBadge,
  createEmptyDashboardData,
  parseJsonl,
  type PrAcceptanceEntry,
  type QualityDashboardData,
  type ServiceHealthEntry,
  type ServiceHealthSnapshot,
} from "./QualityMetrics.js";

export { renderDashboard, renderStyles } from "./Dashboard.js";
