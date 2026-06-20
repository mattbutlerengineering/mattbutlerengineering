/**
 * Filters falsy values and joins the remaining strings with a space.
 * The single place the merge idiom lives in Rialto.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Returns the CSS Module class for a given variant/size key, applying two rules:
 * 1. Omit-default: returns "" when `current === defaultValue` (no class needed)
 * 2. Missing-key guard: returns "" instead of `undefined` when the key is absent
 *    or its CSS Module value is falsy — so no component can emit "undefined" in
 *    a class string.
 */
export function variantClass(
  styles: CSSModuleClasses,
  current: string,
  defaultValue: string
): string {
  if (current === defaultValue) return "";
  return styles[current] ?? "";
}
