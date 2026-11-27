export function setMeta(attribute: "name" | "property", key: string, content: string): void {
  const selector = `meta[${attribute}="${key}"]`;
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

const DESCRIPTION_TAGS = [
  ["name", "description"],
  ["property", "og:description"],
  ["name", "twitter:description"],
] as const;

/** Sets the page description tags; returns a function restoring the previous values. */
export function setDescription(description: string): () => void {
  const previous = DESCRIPTION_TAGS.map(([attribute, key]) => ({
    attribute,
    key,
    content: document.head.querySelector(`meta[${attribute}="${key}"]`)?.getAttribute("content"),
  }));
  for (const [attribute, key] of DESCRIPTION_TAGS) setMeta(attribute, key, description);
  return () => {
    for (const { attribute, key, content } of previous) {
      if (content != null) setMeta(attribute, key, content);
    }
  };
}
