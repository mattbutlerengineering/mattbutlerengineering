/**
 * The `description` a page module passes to its Component/ExamplePageLayout.
 * Pure string parsing: the vite build (route-html.ts) and tests both read it
 * from page source, since the registry cannot be evaluated outside the client.
 */
export function extractLayoutDescription(source: string): string | undefined {
  const match = source.match(
    /<(?:Component|Example)PageLayout\b[\s\S]*?\bdescription=(?:"([^"]+)"|\{"([^"]+)"\})/
  );
  return match?.[1] ?? match?.[2];
}
