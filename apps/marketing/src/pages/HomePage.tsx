import { Link } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { ProjectsSection } from "../components/ProjectsSection";
import { TechStackSection } from "../components/TechStackSection";
import { AboutSection } from "../components/AboutSection";
import { ContactSection } from "../components/ContactSection";
import { Heading, Button, Text } from "@mattbutlerengineering/rialto";
import styles from "./HomePage.module.css";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <ProjectsSection />
      <TechStackSection />
      <AboutSection />
      <ContactSection />
      <section className={styles.weeklyCta}>
        <Heading level={2}>Stay Current</Heading>
        <Text>Check out my weekly information intake from the best dev newsletters.</Text>
        <Link to="/weekly">
          <Button variant="primary" size="md">
            View Weekly Reads
          </Button>
        </Link>
      </section>
    </>
  );
}
