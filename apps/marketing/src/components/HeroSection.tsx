import { Link } from "react-router-dom";
import { Hero, SilkFlow, Stack } from "@mattbutlerengineering/rialto";
import styles from "./HeroSection.module.css";

/** The evidence the hero copy points at — the monorepo that builds this site. */
const REPO_URL = "https://github.com/mattbutlerengineering/mattbutlerengineering";

export function HeroSection() {
  return (
    <div className={styles.heroShell}>
      <SilkFlow className={styles.backdrop} />
      <Hero
        className={styles.heroLayer}
        title="This site ships itself."
        subtitle="A production monorepo run by one engineer and a fleet of coding agents — design system, booking platform, CI, infrastructure. The dashboards are live. Look around."
        minHeight="90vh"
        actions={
          <Stack direction="row" gap="md" wrap>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Read the code on GitHub (opens in new tab)"
              className={styles.primaryCtaLink}
            >
              Read the code
            </a>
            <Link to="/metrics" className={styles.secondaryCtaLink}>
              Live metrics
            </Link>
          </Stack>
        }
      />
    </div>
  );
}
