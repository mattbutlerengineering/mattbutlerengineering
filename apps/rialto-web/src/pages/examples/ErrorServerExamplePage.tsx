import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./ErrorServerExamplePage.module.css";

/* ── Source JSX constant ─────────────────────── */
// Keep in sync with component below

const ERROR_500_EXAMPLE_JSX = `<div className={styles.errorPanel}>
  <Text className={styles.statusCode}>500</Text>
  <Text variant="display" as="h2">
    Something went wrong
  </Text>
  <Text variant="body" color="secondary" className={styles.copy}>
    An unexpected error occurred on our end. Your data is safe \u2014 try the
    request again, or head back home while we look into it.
  </Text>
  <div className={styles.actions}>
    <Button variant="primary">Try again</Button>
    <Button variant="ghost">Back to home</Button>
  </div>
</div>`;

/* ── Composition notes ───────────────────────── */

const compositionNotes = (
  <Stack gap="sm">
    <CompositionNote>
      Server errors are usually transient, so the primary CTA is retry — it re-issues the failed
      request rather than dumping the user onto a different page and losing their place.
    </CompositionNote>
    <CompositionNote>
      &ldquo;Your data is safe&rdquo; answers the first question users actually have during an
      outage. The ghost Button keeps a low-emphasis escape hatch for when retrying keeps failing.
    </CompositionNote>
    <CompositionNote>
      Every visual value — the muted display numeral, panel surface, borders, and spacing — comes
      from Rialto tokens, so the page inherits light and dark themes with no per-page overrides.
    </CompositionNote>
  </Stack>
);

/* ── Component ───────────────────────────────── */

export function ErrorServerExamplePage() {
  return (
    <ExamplePageLayout
      name="Error 500"
      description="Server-error page with a retry CTA"
      sourceJsx={ERROR_500_EXAMPLE_JSX}
      compositionNotes={compositionNotes}
    >
      <div className={styles.errorPanel}>
        <Text className={styles.statusCode}>500</Text>
        <Text variant="display" as="h2">
          Something went wrong
        </Text>
        <Text variant="body" color="secondary" className={styles.copy}>
          An unexpected error occurred on our end. Your data is safe — try the request again, or
          head back home while we look into it.
        </Text>
        <div className={styles.actions}>
          <Button variant="primary">Try again</Button>
          <Button variant="ghost">Back to home</Button>
        </div>
      </div>
    </ExamplePageLayout>
  );
}

ErrorServerExamplePage.displayName = "ErrorServerExamplePage";
