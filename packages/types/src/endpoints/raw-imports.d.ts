// Test-only: Vite/Vitest `?raw` imports return the file's source as a string.
declare module "*?raw" {
  const source: string;
  export default source;
}

// Test-only: Vite's `import.meta.glob` with `query: "?raw"` returns sources keyed by path.
interface ImportMeta {
  glob(
    patterns: string | string[],
    options: { query: "?raw"; import: "default"; eager: true }
  ): Record<string, string>;
}
