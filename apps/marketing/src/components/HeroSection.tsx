import { Hero, Stack, Button, Text } from "@mattbutlerengineering/rialto";
import styles from "./HeroSection.module.css";

/** Primary external conversion target — the "hire / work together" channel. */
const LINKEDIN_URL = "https://www.linkedin.com/in/matt-butler-66496a68/";

export function HeroSection() {
  const scrollToProjects = () => {
    document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToAbout = () => {
    document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <Hero
      eyebrow="Engineering Leader"
      title={
        <>
          One-person team. <Text className="accent">Full ownership.</Text>
        </>
      }
      subtitle="Designing, building, shipping, and operating production systems — from component library to cloud infrastructure."
      minHeight="90vh"
      actions={
        <Stack direction="row" gap="md" wrap>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Let's work together on LinkedIn (opens in new tab)"
            className={styles.primaryCtaLink}
          >
            Let&apos;s work together
          </a>
          <Button variant="secondary" size="lg" onClick={scrollToProjects}>
            See my work
          </Button>
          <Button variant="ghost" size="lg" onClick={scrollToAbout}>
            About me
          </Button>
        </Stack>
      }
    />
  );
}
