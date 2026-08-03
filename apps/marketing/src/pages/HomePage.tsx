import { Link } from "react-router";
import { HeroSection } from "../components/HeroSection";
import { ProofStrip } from "../components/ProofStrip";
import { ProjectsSection } from "../components/ProjectsSection";
import { FactorySection } from "../components/factory/FactorySection";
import { ContactSection } from "../components/ContactSection";
import { Heading, Button, Text, Card, Stack } from "@mattbutlerengineering/rialto";
import styles from "./HomePage.module.css";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <ProofStrip />
      <ProjectsSection />
      <FactorySection />
      <Card variant="elevated" data-testid="weekly-cta" className={styles.invitationCard}>
        <Stack gap="md" align="center">
          <Heading level={2}>What I&apos;m reading</Heading>
          <Text color="secondary">Weekly intake from the better dev newsletters, filtered.</Text>
          <Link to="/weekly">
            <Button variant="primary" size="md">
              Browse the stack
            </Button>
          </Link>
        </Stack>
      </Card>
      <ContactSection />
    </>
  );
}
