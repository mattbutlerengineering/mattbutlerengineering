import type { CSSProperties } from "react";
import {
  Badge,
  StatusLED,
  Text,
  useScrollReveal,
  staggerReveal,
} from "@mattbutlerengineering/rialto";
import { motion } from "framer-motion";
import {
  RUSH_HOURS,
  RUSH_SLOT_COUNT,
  RUSH_TABLES,
  type BookingState,
  type RushBooking,
} from "../../data/service-night";
import { SceneShell } from "./SceneShell";
import styles from "./service-night.module.css";

const SERVICE_START_MINUTES = 18 * 60;
const SLOT_MINUTES = 15;
/** The scene happens at 19:30, six slots into the chart. */
const NOW_SLOT = 6;

const STATE_LABEL: Record<BookingState, string> = {
  seated: "seated",
  confirmed: "confirmed",
  late: "running late",
  finished: "finished",
};

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

function describeBooking(booking: RushBooking): string {
  return `${booking.party}, ${booking.covers} covers, ${slotTime(booking.startSlot)}, ${STATE_LABEL[booking.state]}`;
}

export function RushScene() {
  const { ref, controls } = useScrollReveal();
  const chartStyle = {
    "--slot-count": RUSH_SLOT_COUNT,
    "--now-slot": NOW_SLOT,
  } as CSSProperties;

  return (
    <SceneShell sceneId="rush">
      <div className={styles.chart} style={chartStyle}>
        <div className={styles.chartHours} aria-hidden="true">
          {RUSH_HOURS.map((hour) => (
            <Text as="span" mono key={hour} className={styles.chartHour}>
              {hour}
            </Text>
          ))}
        </div>
        <motion.div
          ref={ref}
          data-reveal="rush-chart"
          variants={staggerReveal.container}
          initial="hidden"
          animate={controls}
        >
          <ol className={styles.chartRows} aria-label="Tables from 18:00 to 22:00">
            {RUSH_TABLES.map((table) => (
              <motion.li
                key={table.label}
                className={styles.chartRow}
                variants={staggerReveal.item}
              >
                <Text as="span" variant="detail" className={styles.chartLabel}>
                  {table.label}
                </Text>
                <ul className={styles.chartTrack} aria-label={`${table.label} bookings`}>
                  {table.bookings.map((booking) => (
                    <li
                      key={booking.party}
                      className={styles.bar}
                      data-state={booking.state}
                      style={{ gridColumn: `${booking.startSlot + 1} / span ${booking.slots}` }}
                    >
                      <Text as="span" className={styles.barName} aria-hidden="true">
                        {booking.party} · {booking.covers}
                      </Text>
                      {booking.state === "late" ? (
                        <Badge variant="warning" size="sm" aria-hidden="true">
                          +15 min
                        </Badge>
                      ) : null}
                      <Text as="span" className={styles.srOnly}>
                        {describeBooking(booking)}
                      </Text>
                    </li>
                  ))}
                </ul>
              </motion.li>
            ))}
          </ol>
        </motion.div>
        <ul className={styles.legend} aria-label="Booking states">
          {LEGEND.map((state) => (
            <li key={state} className={styles.legendItem}>
              <StatusLED variant={STATE_LED[state]} size="sm" />
              <Text as="span" variant="detail" color="secondary">
                {STATE_LABEL[state]}
              </Text>
            </li>
          ))}
        </ul>
      </div>
    </SceneShell>
  );
}
