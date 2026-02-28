import { Stack, Text } from "@mbe/rialto";
import { PROJECTS } from "../data/projects";
import { ProjectCard } from "./ProjectCard";
import styles from "../pages/HomePage.module.css";

export function ProjectsSection() {
  return (
    <section id="projects" className={styles.section}>
      <div className={styles.sectionInner}>
        <Stack gap="xl">
          <div>
            <h2 className={styles.sectionHeading}>Projects</h2>
            <Text variant="body" color="secondary">
              Work that ships — from design systems to deployed applications.
            </Text>
          </div>

          <div className={styles.projectGrid}>
            {PROJECTS.map((project) => (
              <ProjectCard key={project.title} project={project} />
            ))}
          </div>
        </Stack>
      </div>
    </section>
  );
}
