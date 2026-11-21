import {
  Stack,
  Text,
  Heading,
  useScrollReveal,
  staggerReveal,
  boop,
} from "@mattbutlerengineering/rialto";
import { motion, useReducedMotion } from "framer-motion";
import styles from "../pages/HomePage.module.css";

const EMAIL = "mattbutlerengineering+webapp@gmail.com";

const LINKS = [
  {
    href: "https://github.com/mattbutlerengineering",
    label: "GitHub",
    ariaLabel: "GitHub (opens in new tab)",
    newTab: true,
  },
  {
    href: "https://www.linkedin.com/in/matt-butler-66496a68/",
    label: "LinkedIn",
    ariaLabel: "LinkedIn (opens in new tab)",
    newTab: true,
  },
  {
    href: `mailto:${EMAIL}`,
    label: "Email",
    ariaLabel: "Send an email to Matt Butler Engineering",
    newTab: false,
  },
] as const;

export function ContactSection() {
  const { ref, controls } = useScrollReveal();
  const shouldReduceMotion = useReducedMotion();

  const hoverEffect = shouldReduceMotion ? undefined : { scale: boop.scale };

  return (
    <section id="contact" className={styles.section}>
      <div className={styles.sectionInner}>
        <Stack gap="md">
          <div className={styles.sectionHeader}>
            <Heading level={2} className={styles.sectionHeading}>
              Elsewhere
            </Heading>
            <Text variant="detail" color="tertiary">
              One person builds and runs all of it — design system, services, infrastructure, CI.
            </Text>
          </div>
          <motion.div
            ref={ref}
            data-reveal="contact"
            variants={staggerReveal.container}
            initial="hidden"
            animate={controls}
          >
            <Stack direction="row" gap="md" wrap>
              {LINKS.map((link) => (
                <motion.a
                  key={link.label}
                  href={link.href}
                  aria-label={link.ariaLabel}
                  {...(link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={styles.contactLink}
                  variants={staggerReveal.item}
                  whileHover={hoverEffect}
                  transition={boop.transition}
                >
                  {link.label}
                </motion.a>
              ))}
            </Stack>
          </motion.div>
        </Stack>
      </div>
    </section>
  );
}
