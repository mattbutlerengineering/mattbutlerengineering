import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./ErrorForbiddenExamplePage.module.css";

/* ── Source JSX constant ─────────────────────── */
// Keep in sync with component below

const ERROR_403_EXAMPLE_JSX = `<div className={styles.errorPanel}>
  <Text className={styles.statusCode}>403</Text>
  <Text variant="display" as="h2">
    Access denied
  </Text>
  <Text variant="body" color="secondary" className={styles.copy}>
    You don\u2019t have permission to view this page. Sign in with an account
    that has access, or contact support to request it.
  </Text>
  <div className={styles.actions}>
    <Button variant="primary">Sign in</Button>
    <Button variant="secondary">Contact support</Button>
  </div>
</div>`;

/* ── Composition notes ───────────────────────── */

const compositionNotes = (
  <Stack gap="sm">
    <CompositionNote>
      A 403 usually means the wrong account, not a broken link — so the primary CTA re-routes to
      sign-in, and the secondary Button offers the human escalation path for users whose account
      genuinely should have access.
    </CompositionNote>
    <CompositionNote>
      The copy states what happened without blaming the user and never echoes internal authorization
      details — permission errors are a common spot for accidental information leaks.
    </CompositionNote>
    <CompositionNote>
      Every visual value — the muted display numeral, panel surface, borders, and spacing — comes
      from Rialto tokens, so the page inherits light and dark themes with no per-page overrides.
    </CompositionNote>
  </Stack>
);

/* ── Component ───────────────────────────────── */

export function ErrorForbiddenExamplePage() {
  return (
    <ExamplePageLayout
      name="Error 403"
      description="Forbidden page with sign-in and contact-support CTAs"
      sourceJsx={ERROR_403_EXAMPLE_JSX}
      compositionNotes={compositionNotes}
    >
      <div className={styles.errorPanel}>
        <Text className={styles.statusCode}>403</Text>
        <Text variant="display" as="h2">
          Access denied
        </Text>
        <Text variant="body" color="secondary" className={styles.copy}>
          You don’t have permission to view this page. Sign in with an account that has access, or
          contact support to request it.
        </Text>
        <div className={styles.actions}>
          <Button variant="primary">Sign in</Button>
          <Button variant="secondary">Contact support</Button>
        </div>
      </div>
    </ExamplePageLayout>
  );
}

ErrorForbiddenExamplePage.displayName = "ErrorForbiddenExamplePage";
