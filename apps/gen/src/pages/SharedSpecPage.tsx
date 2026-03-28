import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/react";
import { registry } from "@mbe/rialto-catalog";
import { Text, Stack } from "@mbe/rialto";
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

/**
 * Read-only permalink page for a shared spec.
 * Fetches the spec by ID from the public endpoint (no auth required).
 * Route: /gen/s/:id
 */
export function SharedSpecPage() {
  const { id } = useParams<{ id: string }>();
  const [storedSpec, setStoredSpec] = useState<StoredSpec | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoadState("error");
      setErrorMessage("No spec ID provided.");
      return;
    }

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

  if (loadState === "loading") {
    return (
      <div className={styles.container}>
        <div className={styles.center}>
          <Text variant="body" color="secondary">
            Loading...
          </Text>
        </div>
      </div>
    );
  }

  if (loadState === "error" || !storedSpec) {
    return (
      <div className={styles.container}>
        <div className={styles.center}>
          <Stack gap="md" align="center">
            <Text variant="display" color="primary">
              Spec not found
            </Text>
            <Text variant="body" color="secondary">
              {errorMessage ?? "This shared spec could not be loaded."}
            </Text>
            <Link to="/" className={styles.homeLink}>
              Back to Gen Playground
            </Link>
          </Stack>
        </div>
      </div>
    );
  }

  const renderedSpec = storedSpec.spec as Spec;

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <header className={styles.header}>
          <Text as="h1" variant="display" color="primary">
            {storedSpec.prompt}
          </Text>
        </header>
        <main className={styles.preview}>
          <JSONUIProvider registry={registry}>
            <Renderer spec={renderedSpec} registry={registry} loading={false} />
          </JSONUIProvider>
        </main>
        <footer className={styles.footer}>
          <Link to="/" className={styles.footerLink}>
            Made with Gen Playground
          </Link>
        </footer>
      </div>
    </div>
  );
}
