import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Badge, StatusLED, Text, useScrollReveal } from "@mattbutlerengineering/rialto";
import { RUSH_HOURS, RUSH_SLOT_COUNT, RUSH_TABLES, type BookingState } from "./service-night.js";
import { SceneShell } from "./SceneShell.js";
import styles from "./showcase.module.css";

const SERVICE_START_MINUTES = 18 * 60;
const SLOT_MINUTES = 15;
/** The scene happens at 19:30, six slots into the chart. */
const NOW_SLOT = 6;

const STATE_LED: Record<BookingState, "success" | "neutral" | "warning" | "off"> = {
  seated: "success",
  confirmed: "neutral",
  late: "warning",
  finished: "off",
};

const LEGEND: readonly BookingState[] = ["seated", "confirmed", "late", "finished"];

function slotTime(slot: number): string {
  const minutes = SERVICE_START_MINUTES + slot * SLOT_MINUTES;
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function RushScene() {
  const { t } = useTranslation();
  const { ref, revealed } = useScrollReveal();
  const chartStyle = {
    "--slot-count": RUSH_SLOT_COUNT,
    "--now-slot": NOW_SLOT,
  } as CSSProperties;

  return (
    <SceneShell sceneId="rush">
      <div className={styles.chart} style={chartStyle}>
        <div className={styles.chartHours} aria-hidden="true">
          {RUSH_HOURS.map((hour) => (
            <Text as="span" mono key={hour} className={styles.inheritText}>
              {hour}
            </Text>
          ))}
        </div>
        <div ref={ref} data-reveal="rush-chart" data-revealed={revealed}>
          <ol className={styles.chartRows} aria-label={t("showcase.rush.chartLabel")}>
            {RUSH_TABLES.map((table) => {
              const tableName = t(`showcase.rush.${table.area}`, { number: table.number });
              return (
                <li key={`${table.area}-${table.number}`} className={styles.chartRow}>
                  <Text as="span" variant="detail" className={styles.chartLabel}>
                    {tableName}
                  </Text>
                  <ul
                    className={styles.chartTrack}
                    aria-label={t("showcase.rush.trackLabel", { table: tableName })}
                  >
                    {table.bookings.map((booking) => {
                      const party = booking.party ?? t("showcase.rush.walkIn");
                      return (
                        <li
                          key={`${party}-${booking.startSlot}`}
                          className={styles.bar}
                          data-state={booking.state}
                          style={{
                            gridColumn: `${booking.startSlot + 1} / span ${booking.slots}`,
                          }}
                        >
                          <Text as="span" className={styles.barName} aria-hidden="true">
                            {t("showcase.rush.bar", { party, covers: booking.covers })}
                          </Text>
                          {booking.state === "late" ? (
                            <Badge variant="warning" size="sm" aria-hidden="true">
                              {t("showcase.rush.lateBadge")}
                            </Badge>
                          ) : null}
                          <Text as="span" className={styles.srOnly}>
                            {t("showcase.rush.booking", {
                              party,
                              covers: booking.covers,
                              time: slotTime(booking.startSlot),
                              state: t(`showcase.rush.states.${booking.state}`),
                            })}
                          </Text>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
        <ul className={styles.legend} aria-label={t("showcase.rush.legendLabel")}>
          {LEGEND.map((state) => (
            <li key={state} className={styles.legendItem}>
              <StatusLED variant={STATE_LED[state]} size="sm" />
              <Text as="span" variant="detail" color="secondary">
                {t(`showcase.rush.states.${state}`)}
              </Text>
            </li>
          ))}
        </ul>
      </div>
    </SceneShell>
  );
}
