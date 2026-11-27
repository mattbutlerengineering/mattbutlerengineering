import { useDocumentTitle } from "./use-document-title.js";

export { BASE_TITLE } from "./use-document-title.js";

/**
 * Titles the tab for one route and restores `BASE_TITLE` when it unmounts.
 * A component rather than a router hook so the layouts keep rendering under a
 * plain `MemoryRouter` in their tests.
 */
export function DocumentTitle({ title }: { readonly title: string }) {
  useDocumentTitle(title);
  return null;
}
