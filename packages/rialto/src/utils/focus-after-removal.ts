import { FOCUSABLE_SELECTOR } from "../hooks/useFocusTrap";

function hasDocumentPosition(root: Node, el: Node, flag: number): boolean {
  return (root.compareDocumentPosition(el) & flag) === flag;
}

/**
 * Skip controls the user cannot land on. `hidden` / `inert` are checked as
 * attributes because jsdom does not apply the user-agent rule that sets
 * `display: none` on `[hidden]`.
 */
function isReachable(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.closest("[hidden], [inert]")) return false;
  const view = el.ownerDocument.defaultView;
  if (!view) return true;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

/**
 * Move focus out of `root` before it unmounts.
 *
 * Keyboard and pointer activation both leave focus on the dismiss control.
 * Removing that node drops `document.activeElement` to `<body>`. The next
 * tabbable control after `root` is the sensible landing spot (the next
 * dismiss button, when another alert follows); the previous one is used when
 * nothing follows. Controls inside `root` are skipped because they leave
 * with it.
 *
 * No-op when focus is already outside `root`, so a dismiss fired while the
 * user is elsewhere does not steal focus.
 */
export function focusAfterRemoval(root: HTMLElement): void {
  const active = root.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return;

  const candidates = Array.from(
    root.ownerDocument.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => !root.contains(el) && isReachable(el));

  const following = candidates.find((el) =>
    hasDocumentPosition(root, el, Node.DOCUMENT_POSITION_FOLLOWING)
  );
  if (following) {
    following.focus();
    return;
  }

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const el = candidates[i];
    if (el && hasDocumentPosition(root, el, Node.DOCUMENT_POSITION_PRECEDING)) {
      el.focus();
      return;
    }
  }
}
