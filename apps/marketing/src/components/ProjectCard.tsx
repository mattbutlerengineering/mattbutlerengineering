import { Card, Stack, Text } from "@mattbutlerengineering/rialto";
import type { Project } from "../data/projects";
import styles from "./ProjectCard.module.css";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <div className={styles.tactile}>
      <Card variant="elevated" tilt className={styles.card}>
        <Stack gap="md">
          <Text variant="display" as="h3" className={styles.title}>
            {project.title}
          </Text>

          <Text variant="detail" color="tertiary" className={styles.stack}>
            {project.stack.join(" · ")}
          </Text>

          <Text variant="body" color="secondary" className={styles.description}>
            {project.description}
          </Text>

          {project.href && (
            <div className={styles.actions}>
              <a
                href={project.href}
                className={styles.buttonLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${project.title} (opens in new tab)`}
              >
                View live
              </a>
            </div>
          )}
        </Stack>
      </Card>
    </div>
  );
}
