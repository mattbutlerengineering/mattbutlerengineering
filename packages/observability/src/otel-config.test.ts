import { describe, it, expect } from "vitest";
import { resolveTelemetryPlan } from "./otel-config.js";

// A value distinctive enough that any accidental interpolation into `reason`
// is unmistakable. Never a real endpoint.
const ENDPOINT = "https://collector.example.invalid:4318";

describe("resolveTelemetryPlan", () => {
  describe("OTEL_SDK_DISABLED", () => {
    it("resolves 'disabled' for a trimmed, lowercased 'true'", () => {
      // Matches @opentelemetry/core@2.10.0 getBooleanFromEnv
      // (build/src/platform/node/environment.js:55-73), which does
      // raw?.trim().toLowerCase(). Today's `=== "true"` would miss this.
      const plan = resolveTelemetryPlan({ OTEL_SDK_DISABLED: " TRUE " });

      expect(plan.mode).toBe("disabled");
      expect(plan.exportTraces).toBe(false);
      expect(plan.exportMetrics).toBe(false);
    });

    it("resolves 'disabled' for a plain 'true'", () => {
      expect(resolveTelemetryPlan({ OTEL_SDK_DISABLED: "true" }).mode).toBe("disabled");
    });

    it("does not resolve 'disabled' for 'false' or an unrecognised value", () => {
      expect(resolveTelemetryPlan({ OTEL_SDK_DISABLED: "false" }).mode).toBe("unconfigured");
      expect(resolveTelemetryPlan({ OTEL_SDK_DISABLED: "yes" }).mode).toBe("unconfigured");
    });

    it("does not resolve 'disabled' for a whitespace-only value", () => {
      expect(resolveTelemetryPlan({ OTEL_SDK_DISABLED: "   " }).mode).toBe("unconfigured");
    });

    it("wins over a configured endpoint", () => {
      const plan = resolveTelemetryPlan({
        OTEL_SDK_DISABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: ENDPOINT,
      });

      expect(plan.mode).toBe("disabled");
      expect(plan.exportTraces).toBe(false);
      expect(plan.exportMetrics).toBe(false);
    });
  });

  describe("unconfigured", () => {
    it("resolves 'unconfigured' with both signals off when no endpoint key is set", () => {
      const plan = resolveTelemetryPlan({});

      expect(plan.mode).toBe("unconfigured");
      expect(plan.exportTraces).toBe(false);
      expect(plan.exportMetrics).toBe(false);
    });

    it("treats a whitespace-only endpoint as unset", () => {
      // Matches getStringFromEnv (same file, lines 38-44), which returns
      // undefined for a whitespace-only value — so the resolver's verdict and
      // the exporter's own reading can never disagree.
      const plan = resolveTelemetryPlan({
        OTEL_EXPORTER_OTLP_ENDPOINT: "   ",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "\t\n",
      });

      expect(plan.mode).toBe("unconfigured");
      expect(plan.exportTraces).toBe(false);
      expect(plan.exportMetrics).toBe(false);
    });
  });

  describe("exporting", () => {
    it("resolves 'exporting' with both signals on for the generic endpoint", () => {
      const plan = resolveTelemetryPlan({ OTEL_EXPORTER_OTLP_ENDPOINT: ENDPOINT });

      expect(plan.mode).toBe("exporting");
      expect(plan.exportTraces).toBe(true);
      expect(plan.exportMetrics).toBe(true);
    });

    it("resolves traces only when OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is set alone", () => {
      const plan = resolveTelemetryPlan({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: ENDPOINT });

      expect(plan.mode).toBe("exporting");
      expect(plan.exportTraces).toBe(true);
      expect(plan.exportMetrics).toBe(false);
    });

    it("resolves metrics only when OTEL_EXPORTER_OTLP_METRICS_ENDPOINT is set alone", () => {
      const plan = resolveTelemetryPlan({ OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: ENDPOINT });

      expect(plan.mode).toBe("exporting");
      expect(plan.exportTraces).toBe(false);
      expect(plan.exportMetrics).toBe(true);
    });

    it("lets a signal-specific endpoint stand alongside the generic one", () => {
      // Signal-specific wins over generic in OTel's own resolution
      // (@opentelemetry/otlp-exporter-base, otlp-node-http-env-configuration.js:62-75).
      // Either way both signals have a destination.
      const plan = resolveTelemetryPlan({
        OTEL_EXPORTER_OTLP_ENDPOINT: ENDPOINT,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://traces.example.invalid:4318",
      });

      expect(plan.mode).toBe("exporting");
      expect(plan.exportTraces).toBe(true);
      expect(plan.exportMetrics).toBe(true);
    });
  });

  describe("reason", () => {
    it("names an env key and never an env value, in every mode", () => {
      const cases = [
        resolveTelemetryPlan({ OTEL_SDK_DISABLED: "true" }),
        resolveTelemetryPlan({}),
        resolveTelemetryPlan({ OTEL_EXPORTER_OTLP_ENDPOINT: ENDPOINT }),
        resolveTelemetryPlan({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: ENDPOINT }),
        resolveTelemetryPlan({ OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: ENDPOINT }),
      ];

      for (const plan of cases) {
        expect(plan.reason).toMatch(/OTEL_[A-Z_]+/);
        expect(plan.reason).not.toContain(ENDPOINT);
        expect(plan.reason).not.toContain("collector.example.invalid");
        expect(plan.reason).not.toContain("4318");
      }
    });

    it("names OTEL_SDK_DISABLED when that is what decided the mode", () => {
      expect(resolveTelemetryPlan({ OTEL_SDK_DISABLED: "true" }).reason).toContain(
        "OTEL_SDK_DISABLED"
      );
    });

    it("names the signal-specific key when that is what supplied the destination", () => {
      const plan = resolveTelemetryPlan({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: ENDPOINT });

      expect(plan.reason).toContain("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT");
    });

    it("names all three endpoint keys when none of them is set", () => {
      const { reason } = resolveTelemetryPlan({});

      expect(reason).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
      expect(reason).toContain("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT");
      expect(reason).toContain("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT");
    });
  });

  it("defaults to process.env when called with no argument", () => {
    // Total function: every input yields a plan, including the implicit one.
    expect(resolveTelemetryPlan().mode).toBeDefined();
  });
});
