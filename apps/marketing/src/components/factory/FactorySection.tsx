import {
  Badge,
  Card,
  Heading,
  Stack,
  Text,
  useScrollReveal,
  staggerReveal,
} from "@mattbutlerengineering/rialto";
import { motion, useReducedMotion } from "framer-motion";
import { FactoryCanvas } from "./FactoryCanvas.js";
import { FactoryStill } from "./FactoryStill.js";
import { PIPELINE_STAGES } from "./pipeline-stages.js";
import homeStyles from "../../pages/HomePage.module.css";
import styles from "./FactorySection.module.css";

/** The repo's own contributor manual — what the agents are actually handed. */
export const OPERATING_MANUAL_URL =
  "https://github.com/mattbutlerengineering/mattbutlerengineering/blob/main/AGENTS.md";

/**
 * The landing section that shows, rather than claims, how the repository ships.
 *
 * The six stages, their measured figures and the feedback label are ordinary
 * text; the factory floor above them is a decorative WebGL layer that adds
 * motion to a story the DOM already tells in full. Under
 * `prefers-reduced-motion` the same composition is posed as a still diagram and
 * nothing moves.
 */
export function FactorySection() {
  const shouldReduceMotion = useReducedMotion();
  const { ref, controls } = useScrollReveal();

  return (
    <section id="machinery" className={homeStyles.section}>
      <div className={homeStyles.sectionInner}>
        <Stack gap="xl">
          <div className={homeStyles.sectionHeader}>
            <Text className={homeStyles.sectionEyebrow} as="p">
              The machinery
            </Text>
            <Heading level={2} className={homeStyles.sectionHeading}>
              How this site ships itself
            </Heading>
            <Text
              variant="body"
              color="secondary"
              className={styles.body}
              data-testid="factory-body"
            >
              Audits, sensors and error triage file the issues. Coding agents claim them one at a
              time, each in its own worktree, writing the failing test before the code. Nothing
              merges until lint, typecheck, tests and the architecture audit are green — then it
              merges and deploys itself. A human sets the direction; the queue does the shipping.
            </Text>
          </div>

          <div className={styles.floor}>
            <div data-factory-stage-layer aria-hidden="true" className={styles.stageLayer}>
              {shouldReduceMotion ? <FactoryStill /> : <FactoryCanvas />}
            </div>

            <motion.div
              ref={ref}
              data-reveal="machinery"
              className={styles.stageGrid}
              variants={staggerReveal.container}
              initial="hidden"
              animate={controls}
            >
              {PIPELINE_STAGES.map((stage) => (
                <motion.div
                  key={stage.id}
                  className={styles.stageItem}
                  variants={staggerReveal.item}
                >
                  <Card variant="flat" className={styles.stageCard}>
                    <Text as="span" className={styles.stageStep}>
                      {stage.step}
                    </Text>
                    <Text as="span" className={styles.stageName}>
                      {stage.name}
                    </Text>
                    <Text as="span" className={styles.stageDetail}>
                      {stage.detail}
                    </Text>
                    {stage.metric ? (
                      <Badge variant="neutral" size="sm" className={styles.stageMetric}>
                        {stage.metric.value} {stage.metric.label}
                      </Badge>
                    ) : null}
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <div className={styles.footRow}>
            <Text
              variant="detail"
              color="tertiary"
              as="p"
              className={styles.feedback}
              data-testid="factory-feedback"
            >
              Audits close the loop: every deploy feeds the sensors that file the next issues.
            </Text>
            <a
              href={OPERATING_MANUAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Read the operating manual on GitHub (opens in new tab)"
              className={styles.manualLink}
            >
              Read the operating manual
            </a>
          </div>
        </Stack>
      </div>
    </section>
  );
}
