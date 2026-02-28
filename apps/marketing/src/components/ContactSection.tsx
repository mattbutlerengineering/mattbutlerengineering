import { Stack } from "@mbe/rialto";
import styles from "../pages/HomePage.module.css";

export function ContactSection() {
  return (
    <section id="contact" className={styles.section}>
      <div className={styles.sectionInner}>
        <Stack gap="md">
          <h2 className={styles.sectionHeading}>Contact</h2>
          <Stack direction="row" gap="md" wrap>
            <a
              href="https://github.com/mattbutler"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.contactLink}
            >
              GitHub
            </a>
            <a
              href="https://linkedin.com/in/mattbutler"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.contactLink}
            >
              LinkedIn
            </a>
            <a href="mailto:matt@mattbutlerengineering.com" className={styles.contactLink}>
              Email
            </a>
          </Stack>
        </Stack>
      </div>
    </section>
  );
}
