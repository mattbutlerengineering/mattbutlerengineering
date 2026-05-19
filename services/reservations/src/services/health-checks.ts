// Re-exported from @mbe/observability for backward compatibility.
// Tests mock this module; the shared health route module imports from @mbe/observability directly.
export { checkAuth0, checkLatencyAnomaly, recordDbLatency } from "@mbe/observability";
