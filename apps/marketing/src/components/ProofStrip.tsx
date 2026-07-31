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
const COUNTERS: readonly { readonly value: number; readonly label: string }[] = [
  { value: REPO_STATS.agentPrsMerged, label: "Agent-authored PRs merged" },
  { value: REPO_STATS.totalPrsMerged, label: "Pull requests merged" },
  { value: REPO_STATS.rialtoComponents, label: "Rialto components" },
  { value: REPO_STATS.testFiles, label: "Test files" },
];

/**
 * Above-the-fold evidence: four figures counted out of the repository itself at
 * build time, with the measurement date attached so the claim stays checkable.
 */
export function ProofStrip() {
  const { ref, controls } = useScrollReveal();

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
                      <Odometer value={counter.value} size="lg" />
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
