import { Stack, Text, Divider } from "@mbe/rialto";
import styles from "../pages/HomePage.module.css";

export function AboutSection() {
  return (
    <section id="about" className={styles.section}>
      <div className={styles.sectionInner}>
        <Stack gap="lg">
          <h2 className={styles.sectionHeading}>About</h2>
          <Divider accent />
          <Stack gap="md">
            <Text variant="body">
              I build software end-to-end — not just the front-end, not just the API, but the whole
              system. Design system, backend services, infrastructure as code, CI/CD, and
              monitoring: I own all of it.
            </Text>
            <Text variant="body">
              Quality is non-negotiable. I write tests first, ship with type safety, and treat
              every production incident as a design failure worth fixing at the root. Automation
              replaces manual work; good abstractions reduce future cost.
            </Text>
            <Text variant="body">
              The one-person dev team is a forcing function. Without a team to dilute accountability,
              every decision is yours to own. That sharpens judgment fast. You learn to pick the right
              tool, not the popular one — and to build things that still make sense six months later.
            </Text>
            <Text variant="body" color="secondary">
              Currently building in the open at mattbutlerengineering.com — the monorepo, the design
              system, and the infrastructure running this page are all part of the work.
            </Text>
          </Stack>
        </Stack>
      </div>
    </section>
  );
}
