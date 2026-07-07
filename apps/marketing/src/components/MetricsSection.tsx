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
import { SITE_STATS } from "../data/stats";
import styles from "../pages/HomePage.module.css";

export function MetricsSection() {
  const { ref, controls } = useScrollReveal();

  return (
    <section id="metrics" className={styles.metricsBand}>
      <div className={styles.sectionInner}>
        <Stack gap="xl">
          <div className={styles.sectionHeader}>
            <Text className={styles.sectionEyebrow} as="p">
              Proof in production
            </Text>
            <Heading level={2} className={styles.sectionHeading}>
              By the numbers
            </Heading>
            <Text variant="body" color="secondary">
              Real figures from a one-person team that owns the whole stack.
            </Text>
          </div>

          <motion.div
            ref={ref}
            className={styles.metricsGrid}
            variants={staggerReveal.container}
            initial="hidden"
            animate={controls}
          >
            {SITE_STATS.map((stat) => (
              <motion.div key={stat.label} variants={staggerReveal.item}>
                <Card variant="flat">
                  <Stack gap="2xs" align="center">
                    <div className={styles.metricValue}>
                      <Odometer value={stat.value} size="lg" />
                      {stat.suffix ? (
                        <Text variant="display" as="span" aria-hidden="true">
                          {stat.suffix}
                        </Text>
                      ) : null}
                    </div>
                    <Text variant="label" color="secondary">
                      {stat.label}
                    </Text>
                  </Stack>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </Stack>
      </div>
    </section>
  );
}
