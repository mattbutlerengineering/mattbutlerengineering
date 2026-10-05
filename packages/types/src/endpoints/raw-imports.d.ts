// Test-only: Vite/Vitest `?raw` imports return the file's source as a string.
declare module "*?raw" {
  const source: string;
  export default source;
}
