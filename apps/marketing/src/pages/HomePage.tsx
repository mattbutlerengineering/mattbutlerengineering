import { Link } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { MetricsSection } from "../components/MetricsSection";
import { ProjectsSection } from "../components/ProjectsSection";
import { TechStackSection } from "../components/TechStackSection";
import { AboutSection } from "../components/AboutSection";
import { ContactSection } from "../components/ContactSection";
import { Heading, Button, Text, Card, Stack } from "@mattbutlerengineering/rialto";
import styles from "./HomePage.module.css";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <MetricsSection />
      <ProjectsSection />
      <TechStackSection />
      <AboutSection />
      <ContactSection />
      <Card variant="elevated" data-testid="weekly-cta" className={styles.invitationCard}>
        <Stack gap="md" align="center">
          <Text className={styles.invitationEyebrow} as="p">
            The reading room
          </Text>
          <Heading level={2}>Stay Current</Heading>
          <Text color="secondary">
            Check out my weekly information intake from the best dev newsletters.
          </Text>
          <Link to="/weekly">
            <Button variant="primary" size="md">
              View Weekly Reads
            </Button>
          </Link>
        </Stack>
      </Card>
    </>
  );
}
