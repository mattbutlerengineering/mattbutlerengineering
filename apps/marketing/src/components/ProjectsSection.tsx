import {
  Stack,
  Text,
  Heading,
  useScrollReveal,
  staggerReveal,
} from "@mattbutlerengineering/rialto";
import { motion } from "framer-motion";
import { PROJECTS } from "../data/projects";
import { ProjectCard } from "./ProjectCard";
import styles from "../pages/HomePage.module.css";

export function ProjectsSection() {
  const { ref, controls } = useScrollReveal();

  return (
    <section id="projects" className={styles.section}>
      <div className={styles.sectionInner}>
        <Stack gap="xl">
          <div>
            <Heading className={styles.sectionHeading}>Projects</Heading>
            <Text variant="body" color="secondary">
              Work that ships — from design systems to deployed applications.
            </Text>
          </div>

          <motion.div
            ref={ref}
            className={styles.projectGrid}
            variants={staggerReveal.container}
            initial="hidden"
            animate={controls}
          >
            {PROJECTS.map((project) => (
              <motion.div key={project.title} variants={staggerReveal.item}>
                <ProjectCard project={project} />
              </motion.div>
            ))}
          </motion.div>
        </Stack>
      </div>
    </section>
  );
}
