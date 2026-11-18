import {
  useCallback,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { ToastContext, type ToastData, type ToastInput } from "./ToastContext";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import styles from "./Toast.module.css";

const ToastAnimated = lazy(() =>
  import("./ToastAnimated").then((m) => ({ default: m.ToastAnimated }))
);

/* ── Provider ────────────────────────────────── */
export function ToastProvider({
  children,
  placement = "bottom-end",
}: {
  children: ReactNode;
  /** Viewport corner the toasts stack from. Use "top-end" when the bottom edge holds the primary action. */
  placement?: "bottom-end" | "top-end";
}) {
  const { messages } = useRialtoLocale();
  const [toasts, setToasts] = useState<ToastData[]>([]);
  // Once true, keeps ToastAnimated mounted so exit animations play correctly.
  const [everHadToasts, setEverHadToasts] = useState(false);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const counter = useRef(0);
  const regionRef = useRef<HTMLDivElement>(null);
  const toastsRef = useRef(toasts);
  /** Element focused before focus entered the notification region. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  /** Where to move focus after a toast that currently holds focus is removed. */
  const pendingFocusRef = useRef<{ toastId: string } | { restore: true } | null>(null);

  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const onFocusIn = (event: FocusEvent) => {
      const from = event.relatedTarget;
      if (from instanceof HTMLElement && !region.contains(from)) {
        returnFocusRef.current = from;
      }
    };
    region.addEventListener("focusin", onFocusIn);
    return () => region.removeEventListener("focusin", onFocusIn);
  }, []);

  const dismiss = useCallback((id: string) => {
    const region = regionRef.current;
    const active = document.activeElement;
    if (region && active instanceof HTMLElement && region.contains(active)) {
      const toastEl = active.closest("[data-toast-id]");
      if (toastEl instanceof HTMLElement && toastEl.dataset.toastId === id) {
        // Tab order is the polite stack, then the assertive stack — not insertion order.
        const orderedIds = [
          ...toastsRef.current.filter((t) => t.variant !== "error"),
          ...toastsRef.current.filter((t) => t.variant === "error"),
        ].map((t) => t.id);
        const index = orderedIds.indexOf(id);
        const nextId = orderedIds[index + 1] ?? orderedIds[index - 1];
        pendingFocusRef.current =
          nextId !== undefined && nextId !== id ? { toastId: nextId } : { restore: true };
      }
    }

    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  useLayoutEffect(() => {
    toastsRef.current = toasts;
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    if ("toastId" in pending) {
      const root = regionRef.current?.querySelector<HTMLElement>(
        `[data-toast-id="${CSS.escape(pending.toastId)}"]`
      );
      const button = root?.querySelector<HTMLElement>("[data-toast-dismiss]");
      if (button) {
        button.focus();
        return;
      }
    }
    const target = returnFocusRef.current;
    if (target?.isConnected) target.focus();
  }, [toasts]);

  const toast = useCallback(
    (data: ToastInput) => {
      const id = `toast-${++counter.current}`;
      const duration = data.duration ?? 4000;
      const newToast: ToastData = { ...data, id, duration };

      setEverHadToasts(true);
      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
    },
    [dismiss]
  );

  // Cleanup on unmount
  useEffect(() => {
    const timersRef = timers.current;
    return () => {
      timersRef.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // Split toasts by severity so we can route them to the correct aria-live region.
  // Both regions are ALWAYS mounted — screen readers only register live regions present
  // at page load; dynamically injected regions miss the first announcement.
  const politeToasts = toasts.filter((t) => t.variant !== "error");
  const assertiveToasts = toasts.filter((t) => t.variant === "error");

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        ref={regionRef}
        className={styles.container}
        data-placement={placement}
        role="region"
        aria-label={messages.notifications}
      >
        {/* Polite region — info, success, accent, default (non-critical) */}
        <div className={styles.stack} aria-live="polite" aria-atomic="false">
          {everHadToasts && (
            <Suspense fallback={null}>
              <ToastAnimated toasts={politeToasts} onDismiss={dismiss} />
            </Suspense>
          )}
        </div>
        {/* Assertive region — error (interrupts user immediately) */}
        <div className={styles.stack} aria-live="assertive" aria-atomic="false">
          {everHadToasts && (
            <Suspense fallback={null}>
              <ToastAnimated toasts={assertiveToasts} onDismiss={dismiss} />
            </Suspense>
          )}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
