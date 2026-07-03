import { MasterOverride, TapeChart } from "@mattbutlerengineering/rialto";
import { Section } from "./Section";
import {
  tapeChartDefaultReservations,
  tapeChartDefaultRooms,
  tapeChartStressReservations,
  tapeChartStressRooms,
} from "./fixtures";
import styles from "./VisualTest.module.css";

/**
 * TapeChart and MasterOverride sections of the Visual Test Harness.
 */
export function TapeChartSections() {
  return (
    <>
      {/* ── TapeChart — Default ─────────────── */}
      <Section id="tape-chart-default" title="TapeChart — Default">
        <div className={styles.card}>
          <TapeChart
            startDate="2026-01-15"
            endDate="2026-01-22"
            rooms={tapeChartDefaultRooms}
            reservations={tapeChartDefaultReservations}
            currency="USD"
            density="comfortable"
            viewMode="grid"
            onReservationClick={() => {}}
          />
        </div>
      </Section>

      {/* ── TapeChart — Stress (24 × 14) ───────── */}
      <Section id="tape-chart-stress" title="TapeChart — Stress (24 × 14)">
        <div className={styles.card}>
          <TapeChart
            startDate="2026-01-15"
            endDate="2026-01-29"
            rooms={tapeChartStressRooms}
            reservations={tapeChartStressReservations}
            currency="USD"
            density="comfortable"
            viewMode="grid"
            onReservationClick={() => {}}
          />
        </div>
      </Section>

      {/* ── MasterOverride — Variants (3 sizes × 3 variants) ───────── */}
      <Section id="master-override-variants" title="MasterOverride — Variants">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, auto)",
            gap: "var(--rialto-space-lg)",
            justifyItems: "start",
          }}
        >
          {(["sm", "md", "lg"] as const).map((size) =>
            (["default", "warning", "danger"] as const).map((variant) => (
              <MasterOverride
                key={`${size}-${variant}`}
                label={`${size.toUpperCase()} ${variant}`}
                description={`${size} · ${variant}`}
                on={false}
                onChange={() => {}}
                size={size}
                variant={variant}
              />
            ))
          )}
        </div>
      </Section>

      {/* ── MasterOverride — requireHold + splitflap label ───────── */}
      <Section
        id="master-override-requireHold-splitflap"
        title="MasterOverride — requireHold + splitflap"
      >
        <div className={styles.card}>
          <MasterOverride
            label="System state"
            description="Hold to engage. Label cascades through SplitFlap cells."
            on={false}
            onChange={() => {}}
            size="md"
            variant="danger"
            idleLabel="OFFLINE"
            activeLabel="ONLINE"
            requireHold
            labelTransition="splitflap"
          />
        </div>
      </Section>
    </>
  );
}
