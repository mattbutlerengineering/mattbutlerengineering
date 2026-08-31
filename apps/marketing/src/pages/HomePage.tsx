// FIXME: Chaos Agent synthetic issue. This should be detected by scout mode.
import { Link } from "react-router";
import { HeroSection } from "../components/HeroSection";
import { ProofStrip } from "../components/ProofStrip";
import { ProjectsSection } from "../components/ProjectsSection";
import { FactorySection } from "../components/factory/FactorySection";
import { ContactSection } from "../components/ContactSection";
import {
  Heading,
  Button,
  Text,
  Card,
  Stack,
  useScrollReveal,
  staggerReveal,
} from "@mattbutlerengineering/rialto";
import { motion } from "framer-motion";
import styles from "./HomePage.module.css";

export function HomePage() {
  const { ref, controls } = useScrollReveal();

  return (
    <>
      <HeroSection />
      <ProofStrip />
      <ProjectsSection />
      <FactorySection />
      {/* One card, so it is its own reveal item — the other sections stagger
          several children behind `staggerReveal.container`. */}
      <motion.div
        ref={ref}
        data-reveal="weekly"
        variants={staggerReveal.item}
        initial="hidden"
        animate={controls}
      >
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
      </motion.div>
      <ContactSection />
    </>
  );
}
