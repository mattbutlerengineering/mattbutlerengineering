/* CSS import declarations for TypeScript compilation.
 * vite/client is not available in this package (no direct vite dep),
 * so we declare CSS modules explicitly. */

declare module "*.css" {
  const css: string;
  export default css;
}

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
