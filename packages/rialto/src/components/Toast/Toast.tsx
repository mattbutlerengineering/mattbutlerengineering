import { useCallback, useRef, useState, useEffect, lazy, Suspense, type ReactNode } from "react";
import { ToastContext, type ToastData, type ToastInput } from "./ToastContext";
import styles from "./Toast.module.css";

const ToastAnimated = lazy(() =>
  import("./ToastAnimated").then((m) => ({ default: m.ToastAnimated }))
);

/* ── Provider ────────────────────────────────── */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  // Once true, keeps ToastAnimated mounted so exit animations play correctly.
  const [everHadToasts, setEverHadToasts] = useState(false);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

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
      <div className={styles.container} role="region" aria-label="Notifications">
        {/* Polite region — info, success, accent, default (non-critical) */}
        <div aria-live="polite" aria-atomic="false">
          {everHadToasts && (
            <Suspense fallback={null}>
              <ToastAnimated toasts={politeToasts} onDismiss={dismiss} />
            </Suspense>
          )}
        </div>
        {/* Assertive region — error (interrupts user immediately) */}
        <div aria-live="assertive" aria-atomic="false">
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
