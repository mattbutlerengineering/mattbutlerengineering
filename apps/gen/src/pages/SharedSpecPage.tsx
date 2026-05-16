import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/react";
import { registry } from "@mbe/rialto-catalog";
import {
  Text,
  Button,
  Card,
  Badge,
  Skeleton,
  SkeletonGroup,
  EmptyState,
  ThemeToggle,
  Divider,
} from "@mattbutlerengineering/rialto";
import { useTheme } from "../contexts/ThemeContext.js";
import styles from "./SharedSpecPage.module.css";

interface StoredSpec {
  id: string;
  userId: string;
  prompt: string;
  spec: unknown;
  rawLines: string[];
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

type LoadState = "loading" | "error" | "success";

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Inline sparkle SVG for the "Generated with AI" badge. */
function SparkleIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.05 3.05l2.12 2.12M10.83 10.83l2.12 2.12M12.95 3.05l-2.12 2.12M5.17 10.83l-2.12 2.12" />
    </svg>
  );
}

/** Inline link/chain SVG for the copy-link button. */
function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" />
      <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" />
    </svg>
  );
}

/**
 * Read-only permalink page for a shared spec.
 * Fetches the spec by ID from the public endpoint (no auth required).
 * Route: /gen/s/:id
 */
export function SharedSpecPage() {
  const { id } = useParams<{ id: string }>();
  const { theme, toggleTheme } = useTheme();
  const [storedSpec, setStoredSpec] = useState<StoredSpec | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(id ? "loading" : "error");
  const [errorMessage, setErrorMessage] = useState<string | null>(
    id ? null : "No spec ID provided."
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function fetchSpec() {
      try {
        const response = await fetch(`/api/gen/specs/${id}`);
        if (cancelled) return;

        if (response.status === 404) {
          setLoadState("error");
          setErrorMessage("Spec not found.");
          return;
        }

        if (!response.ok) {
          setLoadState("error");
          setErrorMessage(`Failed to load spec: ${response.statusText}`);
          return;
        }

        const json = (await response.json()) as { data: StoredSpec };
        if (cancelled) return;

        setStoredSpec(json.data);
        setLoadState("success");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unexpected error loading spec.";
        setLoadState("error");
        setErrorMessage(message);
      }
    }

    void fetchSpec();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    } catch {
      // Clipboard API may not be available in all contexts
    }
  }, []);

  return (
    <div className={styles.page}>
      {/* ── Top bar ── */}
      <nav className={styles.topBar}>
        <Link to="/gen/" className={styles.logoLink}>
          <Text variant="body" color="primary" className={styles.logoText}>
            Gen
          </Text>
        </Link>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </nav>

      {/* ── Loading state ── */}
      {loadState === "loading" && (
        <div className={styles.container}>
          <div className={styles.content}>
            <SkeletonGroup className={styles.skeletonGroup}>
              <Skeleton variant="heading" width="50%" />
              <div className={styles.skeletonMeta}>
                <Skeleton variant="text" width="120px" />
                <Skeleton variant="text" width="140px" />
              </div>
              <Skeleton variant="card" width="100%" height={480} />
            </SkeletonGroup>
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {(loadState === "error" || (loadState !== "loading" && !storedSpec)) && (
        <div className={styles.container}>
          <div className={styles.center}>
            <EmptyState
              variant="elevated"
              heading="Spec not found"
              description={errorMessage ?? "This shared spec could not be loaded."}
              action={
                <Link to="/gen/">
                  <Button variant="primary">Back to Gen Playground</Button>
                </Link>
              }
            />
          </div>
        </div>
      )}

      {/* ── Success state ── */}
      {loadState === "success" && storedSpec && (
        <div className={styles.container}>
          <div className={styles.content}>
            {/* ── Header ── */}
            <header className={styles.header}>
              <Text as="h1" variant="display" color="primary" className={styles.prompt}>
                {storedSpec.prompt}
              </Text>

              <div className={styles.metaRow}>
                <div className={styles.metaLeft}>
                  <Text variant="caption" color="secondary">
                    {formatDate(storedSpec.createdAt)}
                  </Text>
                  <Badge variant="accent" size="sm">
                    <span className={styles.badgeContent}>
                      <SparkleIcon />
                      Generated with AI
                    </span>
                  </Badge>
                </div>

                <div className={styles.actions}>
                  <Button variant="ghost" size="sm" onClick={handleCopyLink}>
                    <span className={styles.buttonContent}>
                      <LinkIcon />
                      {copied ? "Copied!" : "Copy Link"}
                    </span>
                  </Button>
                  <Link to="/gen/">
                    <Button variant="secondary" size="sm">
                      Open in Playground
                    </Button>
                  </Link>
                </div>
              </div>
            </header>

            <Divider spacing="compact" />

            {/* ── Preview ── */}
            <main className={styles.previewWrapper}>
              <Card variant="elevated" className={styles.previewCard}>
                <JSONUIProvider registry={registry}>
                  <Renderer
                    spec={storedSpec.spec as Spec}
                    registry={registry}
                    loading={false}
                  />
                </JSONUIProvider>
              </Card>
            </main>

            <Divider spacing="compact" />

            {/* ── Footer ── */}
            <footer className={styles.footer}>
              <Text variant="caption" color="tertiary">
                Made with{" "}
                <Link to="/gen/" className={styles.footerLink}>
                  Gen Playground
                </Link>
              </Text>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
