/**
 * axe rule tags for every a11y scan. `wcag2aa` alone selects only Level AA
 * rules (3 of 105); Level A rules (image-alt, button-name, label, ...) need
 * `wcag2a` / `wcag21a`. Guarded by scripts/__tests__/e2e-axe-tags.test.mjs.
 */
export const WCAG_A_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
