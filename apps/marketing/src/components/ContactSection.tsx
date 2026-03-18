import { Stack, useScrollReveal, staggerReveal, boop } from "@mbe/rialto";
import { motion, useReducedMotion } from "framer-motion";
import styles from "../pages/HomePage.module.css";

export function ContactSection() {
  const { ref, controls } = useScrollReveal();
  const shouldReduceMotion = useReducedMotion();

  return (
    <section id="contact" className={styles.section}>
      <div className={styles.sectionInner}>
        <Stack gap="md">
          <h2 className={styles.sectionHeading}>Contact</h2>
          <motion.div
            ref={ref}
            variants={staggerReveal.container}
            initial="hidden"
            animate={controls}
          >
            <Stack direction="row" gap="md" wrap>
              {[
                { href: "https://github.com/mattbutlerengineering", label: "GitHub", external: true },
                { href: "https://www.linkedin.com/in/matt-butler-66496a68/", label: "LinkedIn", external: true },
                { href: "mailto:mattbutlerengineering+webapp@gmail.com", label: "Email", external: false },
              ].map((link) => (
                <motion.a
                  key={link.label}
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener noreferrer" : undefined}
                  className={styles.contactLink}
                  variants={staggerReveal.item}
                  whileHover={shouldReduceMotion ? undefined : { scale: boop.scale }}
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
