import { useEffect, type ReactNode } from "react";
import { Text, Divider, Stack } from "@mbe/rialto";
import styles from "./ComponentPageLayout.module.css";

const BASE_TITLE = "Rialto — Design System";

export interface ComponentPageLayoutProps {
  /** Component name, e.g. "Button" */
  name: string;
  /** One-line description */
  description: string;
  /** Page-specific section content */
  children: ReactNode;
}

/**
 * Shared page template for all component showcase pages.
 *
 * Renders:
 * - Page title (component name)
 * - Description
 * - Divider
 * - Children (page-specific sections)
 */
export function ComponentPageLayout({ name, description, children }: ComponentPageLayoutProps) {
  useEffect(() => {
    document.title = `${name} — Rialto`;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [name]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text variant="display" color="primary" as="h1">
          {name}
        </Text>
        <Text variant="body" color="secondary">
          {description}
        </Text>
      </div>
      <Divider />
      <Stack gap="xl" className={styles.content}>
        {children}
      </Stack>
    </div>
  );
}

ComponentPageLayout.displayName = "ComponentPageLayout";

// ---------------------------------------------------------------------------
// Section sub-component — used within individual pages
// ---------------------------------------------------------------------------

export interface SectionProps {
  title: string;
  children: ReactNode;
}

/**
 * A labeled section within a component page (e.g. "Variants", "States").
 */
export function Section({ title, children }: SectionProps) {
  return (
    <div className={styles.section}>
      <Text variant="label" color="primary" as="h2" className={styles.sectionTitle}>
        {title}
      </Text>
      <div className={styles.sectionContent}>{children}</div>
    </div>
  );
}

Section.displayName = "Section";
