import { useState } from "react";
import { Card, Badge, Heading } from "@mattbutlerengineering/rialto";
import { weeklyResources } from "../data/weekly-intake";
import type { WeeklyResource } from "../data/weekly-intake";
import styles from "./WeeklyIntakePage.module.css";

const sourceColors: Record<WeeklyResource["source"], "yellow" | "blue" | "purple" | "neutral"> = {
  "js-weekly": "yellow",
  "react-weekly": "blue",
  "ai-weekly": "purple",
  "other": "neutral",
};

const sourceLabels: Record<WeeklyResource["source"], string> = {
  "js-weekly": "JS Weekly",
  "react-weekly": "React Weekly",
  "ai-weekly": "AI Weekly",
  "other": "Other",
};

function ResourceCard({ resource }: { readonly resource: WeeklyResource }) {
  return (
    <Card className={styles.card}>
      <div className={styles.cardHeader}>
        <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
          <Heading level={3} className={styles.title}>{resource.title}</Heading>
        </a>
        <Badge color={sourceColors[resource.source]} size="sm">
          {sourceLabels[resource.source]}
        </Badge>
      </div>
      <p className={styles.description}>{resource.description}</p>
      <div className={styles.meta}>
        <time dateTime={resource.publishedAt}>
          {new Date(resource.publishedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </time>
        <div className={styles.tags}>
          {resource.tags.map((tag) => (
            <Badge key={tag} color="neutral" size="sm">{tag}</Badge>
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
      <Heading level={1} className={styles.heading}>Weekly Information Intake</Heading>
      <p className={styles.subtitle}>
        Curated resources from the best weekly newsletters to keep you up to date.
      </p>

      <nav className={styles.filters} aria-label="Filter resources by source">
        {filters.map((f) => (
          <button
            key={f.value}
            className={`${styles.filterBtn} ${activeFilter === f.value ? styles.active : ""}`}
            onClick={() => setActiveFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </nav>

      <div className={styles.grid}>
        {filtered.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </div>
    </section>
  );
}
