import { Stack, Text, Tag, Heading, useScrollReveal, staggerReveal } from "@mattbutlerengineering/rialto";
import { motion } from "framer-motion";
import { TECH_STACK } from "../data/tech-stack";
import styles from "../pages/HomePage.module.css";

export function TechStackSection() {
  const { ref, controls } = useScrollReveal();

  return (
    <section id="tech-stack" className={styles.section}>
      <div className={styles.sectionInner}>
        <Stack gap="xl">
          <div>
            <Heading className={styles.sectionHeading}>Tech Stack</Heading>
            <Text variant="body" color="secondary">
              The tools and frameworks powering this site and its services.
            </Text>
          </div>

          <motion.div
            ref={ref}
            variants={staggerReveal.container}
            initial="hidden"
            animate={controls}
          >
            <Stack gap="lg">
              {TECH_STACK.map((category) => (
                <motion.div key={category.title} variants={staggerReveal.item}>
                  <Stack gap="sm">
                    <Text variant="body" color="secondary" as="h3">
                      {category.title}
                    </Text>
                    <Stack direction="row" gap="sm" wrap>
                      {category.items.map((tech) => (
                        <Tag key={tech}>{tech}</Tag>
                      ))}
                    </Stack>
                  </Stack>
                </motion.div>
              ))}
            </Stack>
          </motion.div>
        </Stack>
      </div>
    </section>
  );
}
