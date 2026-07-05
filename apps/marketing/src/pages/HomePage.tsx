import { Link } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { ProjectsSection } from "../components/ProjectsSection";
import { TechStackSection } from "../components/TechStackSection";
import { AboutSection } from "../components/AboutSection";
import { ContactSection } from "../components/ContactSection";
import { Heading, Button, Text, Card, Stack } from "@mattbutlerengineering/rialto";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <ProjectsSection />
      <TechStackSection />
      <AboutSection />
      <ContactSection />
      <Card variant="elevated" data-testid="weekly-cta">
        <Stack gap="md" align="center">
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
