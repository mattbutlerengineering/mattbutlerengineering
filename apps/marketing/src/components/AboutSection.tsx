import {
  Stack,
  Text,
  Divider,
  Heading,
  useScrollReveal,
  staggerReveal,
} from "@mattbutlerengineering/rialto";
import { motion } from "framer-motion";
import styles from "../pages/HomePage.module.css";

export function AboutSection() {
  const { ref, controls } = useScrollReveal();

  return (
    <section id="about" className={styles.section}>
      <div className={styles.sectionInner}>
        <Stack gap="lg">
          <Heading className={styles.sectionHeading}>About</Heading>
          <Divider accent />
          <motion.div
            ref={ref}
            variants={staggerReveal.container}
            initial="hidden"
            animate={controls}
          >
            <Stack gap="md">
              <motion.div variants={staggerReveal.item}>
                <Text variant="body">
                  I build software end-to-end — not just the front-end, not just the API, but the
                  whole system. Design system, backend services, infrastructure as code, CI/CD, and
                  monitoring: I own all of it.
                </Text>
              </motion.div>
              <motion.div variants={staggerReveal.item}>
                <Text variant="body">
                  Quality is non-negotiable. I write tests first, ship with type safety, and treat
                  every production incident as a design failure worth fixing at the root. Automation
                  replaces manual work; good abstractions reduce future cost.
                </Text>
              </motion.div>
              <motion.div variants={staggerReveal.item}>
                <Text variant="body">
                  The one-person dev team is a forcing function. Without a team to dilute
                  accountability, every decision is yours to own. That sharpens judgment fast. You
                  learn to pick the right tool, not the popular one — and to build things that still
                  make sense six months later.
                </Text>
              </motion.div>
              <motion.div variants={staggerReveal.item}>
                <Text variant="body" color="secondary">
                  Currently building in the open at mattbutlerengineering.com — the monorepo, the
                  design system, and the infrastructure running this page are all part of the work.
                </Text>
              </motion.div>
            </Stack>
          </motion.div>
        </Stack>
      </div>
    </section>
  );
}
