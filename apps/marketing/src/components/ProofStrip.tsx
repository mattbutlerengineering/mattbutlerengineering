import { useEffect, useState } from "react";
import {
  Stack,
  Card,
  Text,
  Heading,
  Odometer,
  useScrollReveal,
  staggerReveal,
} from "@mattbutlerengineering/rialto";
import { motion } from "framer-motion";
import { REPO_STATS } from "../data/repo-stats";
import { formatMeasuredAt } from "../utils/formatters";
import styles from "../pages/HomePage.module.css";

/** Counters, in descending order of how much they say about how this repo is built. */
const COUNTERS = [
  { value: REPO_STATS.agentPrsMerged, label: "Agent-authored PRs merged" },
  { value: REPO_STATS.totalPrsMerged, label: "Pull requests merged" },
  { value: REPO_STATS.rialtoComponents, label: "Rialto components" },
  { value: REPO_STATS.testFiles, label: "Test files" },
].map((counter) => ({
  ...counter,
  // Pinned to the counted figure's digit count, so the zero shown before the
  // reveal fills exactly the reel cells the final figure will: starting the
  // count changes the digits, never the layout.
  formatOptions: { minimumIntegerDigits: String(counter.value).length },
}));

const NARROW_VIEWPORT_QUERY = "(max-width: 640px)";

/**
 * Tracks whether the viewport is phone-narrow. The odometer's flip-board cells
 * are em-sized boxes that cannot wrap or shrink, so the `size` prop is the only
 * lever that keeps the figures inside a phone viewport — CSS alone can't reach
 * it. State updates only from the media-query change event.
 */
function useIsNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(NARROW_VIEWPORT_QUERY).matches
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return isNarrow;
}

/**
 * Above-the-fold evidence: four figures counted out of the repository itself at
 * build time, with the measurement date attached so the claim stays checkable.
 */
export function ProofStrip() {
  const { ref, controls, revealed } = useScrollReveal();
  const isNarrowViewport = useIsNarrowViewport();

  return (
    <section id="proof" className={styles.metricsBand}>
      <div className={styles.sectionInner}>
        <Stack gap="xl">
          <div className={styles.sectionHeader}>
            <Text className={styles.sectionEyebrow} as="p">
              Measured, not claimed
            </Text>
            <Heading level={2} className={styles.sectionHeading}>
              By the numbers
            </Heading>
          </div>

          <motion.div
            ref={ref}
            data-reveal="proof"
            className={styles.metricsGrid}
            variants={staggerReveal.container}
            initial="hidden"
            animate={controls}
          >
            {COUNTERS.map((counter) => (
              <motion.div key={counter.label} variants={staggerReveal.item}>
                <Card variant="flat">
                  <Stack gap="2xs" align="center">
                    <div className={styles.metricValue}>
                      <Odometer
                        value={revealed ? counter.value : 0}
                        formatOptions={counter.formatOptions}
                        size={isNarrowViewport ? "md" : "lg"}
                      />
                    </div>
                    <Text variant="label" color="secondary">
                      {counter.label}
                    </Text>
                  </Stack>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <Text variant="detail" color="tertiary" as="p">
            Counted straight out of the repo — measured at last deploy,{" "}
            {formatMeasuredAt(REPO_STATS.measuredAt)}.
          </Text>
        </Stack>
      </div>
    </section>
  );
}
