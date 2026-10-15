import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { RialtoLocaleProvider, useRialtoLocale } from "@mattbutlerengineering/rialto/providers";

type RialtoLocale = ReturnType<typeof useRialtoLocale>;

/**
 * The root ToastProvider sits outside every WidgetLocaleScope, so its single
 * live region would keep the dashboard's label on guest routes. A mounted
 * guest scope publishes its Rialto locale here; the override wraps the
 * provider so that one region follows the guest. No second region is mounted.
 */
let current: RialtoLocale | null = null;
const listeners = new Set<() => void>();

function publish(next: RialtoLocale | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Rendered inside a guest scope's locale bridge: publishes that scope's locale while mounted. */
export function PublishGuestToastLocale() {
  const rialto = useRialtoLocale();
  useEffect(() => {
    publish(rialto);
    return () => publish(null);
  }, [rialto]);
  return null;
}

/** Wrap the root ToastProvider: guest locale while a guest scope is mounted, else the dashboard's. */
export function ToastLocaleOverride({ children }: { children: ReactNode }) {
  const dashboard = useRialtoLocale();
  const guest = useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );
  const active = guest ?? dashboard;
  return (
    <RialtoLocaleProvider locale={active.locale} messages={active.messages}>
      {children}
    </RialtoLocaleProvider>
  );
}
