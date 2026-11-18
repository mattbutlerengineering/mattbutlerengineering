import { useCallback, type ReactElement } from "react";
import styles from "./SideNav.module.css";

/**
 * Places an element the remote created (a slot) inside the React tree. Hospitality owns what
 * goes inside the slot; React never renders into it, so the host's content is left alone on
 * every `update(props)`.
 */
export function SlotMount({ element }: { element: HTMLElement }): ReactElement {
  const attach = useCallback(
    (host: HTMLElement | null) => {
      if (host && element.parentNode !== host) host.appendChild(element);
    },
    [element]
  );
  return <div ref={attach} className={styles.slotHost} />;
}
