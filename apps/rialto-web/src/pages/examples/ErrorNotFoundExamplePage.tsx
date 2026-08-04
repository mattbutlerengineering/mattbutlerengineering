import { Button, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./ErrorNotFoundExamplePage.module.css";

/* ── Source JSX constant ─────────────────────── */
// Keep in sync with component below

const ERROR_404_EXAMPLE_JSX = `<div className={styles.errorPanel}>
  <Text className={styles.statusCode}>404</Text>
  <Text variant="display" as="h2">
    Page not found
  </Text>
  <Text variant="body" color="secondary" className={styles.copy}>
    The page you\u2019re looking for doesn\u2019t exist or has been moved.
    Head back home, or search for what you need.
  </Text>
  <div className={styles.actions}>
    <Button variant="primary">Back to home</Button>
  </div>
  <form role="search" className={styles.searchRow} onSubmit={(e) => e.preventDefault()}>
    <Input
      label="Search the site"
      type="search"
      placeholder="Rooms, guests, reservations\u2026"
      className={styles.searchField}
    />
    <Button variant="secondary">Search</Button>
  </form>
</div>`;

/* ── Composition notes ───────────────────────── */

const compositionNotes = (
  <Stack gap="sm">
    <CompositionNote>
      The status code is a styled paragraph, not a heading — the accessible page outline goes
      straight from the page title to &ldquo;Page not found&rdquo;, so screen-reader users hear the
      explanation, not a bare number.
    </CompositionNote>
    <CompositionNote>
      A 404 is a recoverable dead end, so it gets two exits: the primary Button routes back home,
      and a <code>role=&quot;search&quot;</code> form offers a second path for users who arrived
      hunting for something specific.
    </CompositionNote>
    <CompositionNote>
      Every visual value — the muted display numeral, panel surface, borders, and spacing — comes
      from Rialto tokens, so the page inherits light and dark themes with no per-page overrides.
    </CompositionNote>
  </Stack>
);

/* ── Component ───────────────────────────────── */

export function ErrorNotFoundExamplePage() {
  return (
    <ExamplePageLayout
      name="Error 404"
      description="Not-found page with back-home and search CTAs"
      sourceJsx={ERROR_404_EXAMPLE_JSX}
      compositionNotes={compositionNotes}
    >
      <div className={styles.errorPanel}>
        <Text className={styles.statusCode}>404</Text>
        <Text variant="display" as="h2">
          Page not found
        </Text>
        <Text variant="body" color="secondary" className={styles.copy}>
          The page you’re looking for doesn’t exist or has been moved. Head back home, or search for
          what you need.
        </Text>
        <div className={styles.actions}>
          <Button variant="primary">Back to home</Button>
        </div>
        <form role="search" className={styles.searchRow} onSubmit={(e) => e.preventDefault()}>
          <Input
            label="Search the site"
            type="search"
            placeholder="Rooms, guests, reservations…"
            className={styles.searchField}
          />
          <Button variant="secondary">Search</Button>
        </form>
      </div>
    </ExamplePageLayout>
  );
}

ErrorNotFoundExamplePage.displayName = "ErrorNotFoundExamplePage";
