import { Link } from "react-router";
import { Card, Badge, Heading, Text } from "@mattbutlerengineering/rialto";
import { SHIPPED_FEATURES } from "../data/shipped-features.js";
import type { ShippedFeature } from "../data/shipped-features.js";
import snapshot from "../data/shipped-features.json";
import { formatDate, formatWallClock } from "../utils/formatters.js";
import styles from "./ShippedIndexPage.module.css";

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

function FeatureCard({ feature }: { readonly feature: ShippedFeature }) {
  const prCount = feature.children.reduce((total, child) => total + child.prs.length, 0);
  return (
    <Card className={styles.card}>
      <div className={styles.cardHeader}>
        <Link to={`/shipped/${feature.slug}`} className={styles.link}>
          <Heading level={2} className={styles.title}>
            {feature.title}
          </Heading>
        </Link>
        {feature.liveUrl !== null && (
          <Badge color="green" size="sm">
            Live
          </Badge>
        )}
      </div>
      <Text className={styles.stats}>
        {plural(feature.children.length, "child issue")} · {plural(prCount, "merged PR")} ·{" "}
        {formatWallClock(feature.wallClockHours)} wall-clock
      </Text>
      <div className={styles.meta}>
        Last merged <time dateTime={feature.lastMergedAt}>{formatDate(feature.lastMergedAt)}</time>
      </div>
    </Card>
  );
}

export function ShippedIndexPage() {
  return (
    <section className={styles.container}>
      <Heading level={1} className={styles.heading}>
        Shipped by the factory
      </Heading>
      <Text className={styles.subtitle}>
        Every feature the factory has taken from proposal to production, newest first.
      </Text>
      <Text className={styles.asOf}>
        Snapshot from{" "}
        <time dateTime={snapshot.generatedAt}>{formatDate(snapshot.generatedAt)}</time>; not a live
        feed.
      </Text>

      {SHIPPED_FEATURES.length === 0 ? (
        <Text className={styles.empty}>Nothing has shipped yet. Check back soon.</Text>
      ) : (
        <div className={styles.cards}>
          {SHIPPED_FEATURES.map((feature) => (
            <FeatureCard key={feature.slug} feature={feature} />
          ))}
        </div>
      )}
    </section>
  );
}
