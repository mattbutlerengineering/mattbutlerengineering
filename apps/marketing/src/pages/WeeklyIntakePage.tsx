import { useState } from "react";
import { Card, Badge, Heading, Text, Button } from "@mattbutlerengineering/rialto";
import { weeklyResources } from "../data/weekly-intake";
import type { WeeklyResource } from "../data/weekly-intake";
import { SOURCE_COLORS, SOURCE_LABELS, formatDate } from "../utils/formatters.js";
import styles from "./WeeklyIntakePage.module.css";

function ResourceCard({ resource }: { readonly resource: WeeklyResource }) {
  return (
    <Card className={styles.card}>
      <div className={styles.cardHeader}>
        <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
          <Heading level={2} className={styles.title}>
            {resource.title}
          </Heading>
        </a>
        <Badge color={SOURCE_COLORS[resource.source]} size="sm">
          {SOURCE_LABELS[resource.source]}
        </Badge>
      </div>
      <Text className={styles.description}>{resource.description}</Text>
      <div className={styles.meta}>
        <time dateTime={resource.publishedAt}>{formatDate(resource.publishedAt)}</time>
        <div className={styles.tags}>
          {resource.tags.map((tag) => (
            <Badge key={tag} color="neutral" size="sm">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
}

type Filter = WeeklyResource["source"] | "all";

const filters: { readonly value: Filter; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "js-weekly", label: "JS Weekly" },
  { value: "react-weekly", label: "React Weekly" },
  { value: "ai-weekly", label: "AI Weekly" },
  { value: "other", label: "Other" },
];

export function WeeklyIntakePage() {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  const filtered =
    activeFilter === "all"
      ? weeklyResources
      : weeklyResources.filter((r) => r.source === activeFilter);

  return (
    <section className={styles.container}>
      <Heading level={1} className={styles.heading}>
        Weekly Information Intake
      </Heading>
      <Text className={styles.subtitle}>
        Curated resources from the best weekly newsletters to keep you up to date.
      </Text>

      <nav className={styles.filters} aria-label="Filter resources by source">
        {filters.map((f) => (
          <Button
            key={f.value}
            className={`${styles.filterBtn} ${activeFilter === f.value ? styles.active : ""}`}
            onClick={() => setActiveFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </nav>

      <div className={styles.resourceGrid}>
        {filtered.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </div>
    </section>
  );
}
