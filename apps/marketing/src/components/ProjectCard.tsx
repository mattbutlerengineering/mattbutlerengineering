import { Card, Stack, Text, Tag, Button } from "@mbe/rialto";
import type { Project } from "../data/projects";
import styles from "./ProjectCard.module.css";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Card variant="elevated" tilt className={styles.card}>
      <Stack gap="md">
        <Text variant="display" as="h3" className={styles.title}>
          {project.title}
        </Text>

        <Stack direction="row" gap="xs" wrap>
          {project.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Stack>

        <Text variant="body" color="secondary" className={styles.description}>
          {project.description}
        </Text>

        {project.href && (
          <div className={styles.actions}>
            <a href={project.href} className={styles.link}>
              <Button variant="secondary" size="sm">
                View live
              </Button>
            </a>
          </div>
        )}
      </Stack>
    </Card>
  );
}
