import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { RenderBoundary } from "./RenderBoundary.js";
import { SideNav } from "./SideNav.js";
import styles from "./SideNav.module.css";
import { assertSideNavProps } from "./validate-props.js";
import type { SideNavHandle, SideNavProps, SideNavSlots } from "./types.js";

/**
 * Mounts the side nav into `container`, in its own React root. React-agnostic for the caller:
 * plain props in, a plain handle out (ADR-032). Throws `SideNavContractError` if the props
 * break the contract, before anything is rendered.
 */
export function mountSideNav(container: HTMLElement, props: SideNavProps): SideNavHandle {
  assertSideNavProps(props);

  const slots: SideNavSlots = {
    header: document.createElement("div"),
    footer: Object.assign(document.createElement("div"), { className: styles.footer }),
  };
  const root = createRoot(container);
  let mounted = true;

  // The host reads `slots()` and expects the DOM right after mount, update and unmount returns,
  // so each one renders synchronously.
  const render = (next: SideNavProps): void => {
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync
    flushSync(() =>
      root.render(
        <RenderBoundary
          onError={(error) => {
            next.onRenderError?.(error);
          }}
        >
          <SideNav {...next} slots={slots} />
        </RenderBoundary>
      )
    );
  };

  render(props);

  return {
    update(next) {
      if (!mounted)
        throw new Error("hospitality-sidenav: update() called on an unmounted side nav");
      assertSideNavProps(next);
      render(next);
    },
    slots: () => slots,
    unmount() {
      if (!mounted) return;
      mounted = false;
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync
      flushSync(() => root.unmount());
      slots.header.remove();
      slots.footer.remove();
    },
  };
}
