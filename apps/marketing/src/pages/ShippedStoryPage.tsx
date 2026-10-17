import { Link, useParams } from "react-router";
import { Card, Badge, Heading, Text } from "@mattbutlerengineering/rialto";
import { findShippedFeature } from "../data/shipped-features.js";
import type { ShippedPr } from "../data/shipped-features.js";
import { formatDate, formatWallClock } from "../utils/formatters.js";
import { NotFoundPage } from "./NotFoundPage.js";
import styles from "./ShippedStoryPage.module.css";

const REPO_URL = "https://github.com/mattbutlerengineering/mattbutlerengineering";

function ExternalLink({ href, children }: { readonly href: string; readonly children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
      {children}
    </a>
  );
}

function verdictVariant(verdict: ShippedPr["reviewVerdict"]): "success" | "warning" | "neutral" {
  if (verdict === "pass") return "success";
  return verdict === "flag" ? "warning" : "neutral";
}

function ciVariant(ci: ShippedPr["ciGate"]): "success" | "error" | "neutral" {
  if (ci === "success") return "success";
  return ci === "failure" ? "error" : "neutral";
}

export function ShippedStoryPage() {
  const { slug = "" } = useParams();
  const feature = findShippedFeature(slug);
  if (feature === undefined) return <NotFoundPage />;

  const prs = feature.children.flatMap((child) => child.prs);

  return (
    <article className={styles.container}>
      <Link to="/shipped" className={styles.back}>
        Back to all shipped features
      </Link>
      <Heading level={1} className={styles.heading}>
        {feature.title}
      </Heading>
      <Text className={styles.subtitle}>
        {feature.proposedAt !== null && (
          <>
            Proposed <time dateTime={feature.proposedAt}>{formatDate(feature.proposedAt)}</time>{" "}
            →{" "}
          </>
        )}
        {feature.proposedAt !== null ? "shipped in" : "Shipped in"}{" "}
        {formatWallClock(feature.wallClockHours)}, last merged{" "}
        <time dateTime={feature.lastMergedAt}>{formatDate(feature.lastMergedAt)}</time>
      </Text>

      {feature.proposalEvidence !== null && (
        <section className={styles.section}>
          <Heading level={2}>Proposal</Heading>
          <Text>{feature.proposalEvidence}</Text>
          {feature.proposalIssue !== null && (
            <ExternalLink href={`${REPO_URL}/issues/${feature.proposalIssue}`}>
              {`Proposal #${feature.proposalIssue} on GitHub`}
            </ExternalLink>
          )}
        </section>
      )}

      <section className={styles.section}>
        <Heading level={2}>Decomposition</Heading>
        <ol className={styles.list}>
          {feature.children.map((child) => (
            <li key={child.issue}>
              <ExternalLink href={`${REPO_URL}/issues/${child.issue}`}>
                {`#${child.issue} ${child.title}`}
              </ExternalLink>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section}>
        <Heading level={2}>Pull requests</Heading>
        <ul className={styles.list}>
          {prs.map((pr) => (
            <li key={pr.number}>
              <Card className={styles.prCard}>
                <ExternalLink href={`${REPO_URL}/pull/${pr.number}`}>
                  {`#${pr.number} ${pr.title}`}
                </ExternalLink>
                <div className={styles.badges}>
                  <time dateTime={pr.mergedAt}>Merged {formatDate(pr.mergedAt)}</time>
                  <Badge variant={verdictVariant(pr.reviewVerdict)} size="sm">
                    {`Review: ${pr.reviewVerdict ?? "not recorded"}`}
                  </Badge>
                  <Badge variant={ciVariant(pr.ciGate)} size="sm">
                    {`CI Gate: ${pr.ciGate ?? "not recorded"}`}
                  </Badge>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {feature.liveUrl !== null && (
        <section className={styles.section}>
          <Heading level={2}>See it live</Heading>
          <a href={feature.liveUrl} className={styles.liveLink}>
            See it live
          </a>
        </section>
      )}
    </article>
  );
}
