import { useState } from "react";
import { Stack, useScrollReveal, staggerReveal, boop, useToast, Heading } from "@mattbutlerengineering/rialto";
import { motion, useReducedMotion } from "framer-motion";
import styles from "../pages/HomePage.module.css";

const EMAIL = "mattbutlerengineering+webapp@gmail.com";

const EXTERNAL_LINKS = [
  { href: "https://github.com/mattbutlerengineering", label: "GitHub" },
  { href: "https://www.linkedin.com/in/matt-butler-66496a68/", label: "LinkedIn" },
] as const;

export function ContactSection() {
  const { ref, controls } = useScrollReveal();
  const shouldReduceMotion = useReducedMotion();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      toast({ title: "Email copied!", variant: "success", duration: 2000 });
    } catch {
      toast({ title: "Could not copy — try selecting the address manually", variant: "error", duration: 3000 });
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hoverEffect = shouldReduceMotion ? undefined : { scale: boop.scale };

  return (
    <section id="contact" className={styles.section}>
      <div className={styles.sectionInner}>
        <Stack gap="md">
          <Heading className={styles.sectionHeading}>Contact</Heading>
          <motion.div
            ref={ref}
            variants={staggerReveal.container}
            initial="hidden"
            animate={controls}
          >
            <Stack direction="row" gap="md" wrap>
              {EXTERNAL_LINKS.map((link) => (
                <motion.a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${link.label} (opens in new tab)`}
                  className={styles.contactLink}
                  variants={staggerReveal.item}
                  whileHover={hoverEffect}
                  transition={boop.transition}
                >
                  {link.label}
                </motion.a>
              ))}

              <motion.span
                className={styles.contactEmailGroup}
                variants={staggerReveal.item}
              >
                <motion.a
                  href={`mailto:${EMAIL}`}
                  aria-label="Send an email to Matt Butler Engineering"
                  className={styles.contactLink}
                  whileHover={hoverEffect}
                  transition={boop.transition}
                >
                  Email
                </motion.a>
                <motion.button
                  type="button"
                  onClick={handleCopyEmail}
                  aria-label="Copy email address to clipboard"
                  className={styles.copyEmailButton}
                  whileHover={hoverEffect}
                  transition={boop.transition}
                >
                  {copied ? "Copied!" : "Copy"}
                </motion.button>
              </motion.span>
            </Stack>
          </motion.div>
        </Stack>
      </div>
    </section>
  );
}
