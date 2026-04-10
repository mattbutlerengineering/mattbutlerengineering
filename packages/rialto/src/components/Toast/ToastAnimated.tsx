import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { spring } from "../../tokens/motion";
import type { ToastData, ToastVariant } from "./ToastContext";
import styles from "./Toast.module.css";

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success") {
    return (
      <svg
        className={styles.icon}
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="9" r="7" />
        <path d="M6 9l2 2 4-4" />
      </svg>
    );
  }
  if (variant === "error") {
    return (
      <svg
        className={styles.icon}
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="9" cy="9" r="7" />
        <path d="M6 6l6 6M12 6l-6 6" />
      </svg>
    );
  }
  if (variant === "accent") {
    return (
      <svg
        className={styles.icon}
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="9" r="7" />
        <path d="M9 5v3M9 11v1" />
      </svg>
    );
  }
  return null;
}

function ToastItem({ toast: t, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const shouldReduceMotion = useReducedMotion();
  const duration = t.duration ?? 4000;

  return (
    <motion.div
      layout
      className={`${styles.toast} ${styles[t.variant ?? "default"]}`}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.95 }}
      transition={shouldReduceMotion ? { duration: 0.1 } : spring}
    >
      <ToastIcon variant={t.variant ?? "default"} />
      {t.title && <p className={styles.title}>{t.title}</p>}
      {t.description && <p className={styles.description}>{t.description}</p>}

      <button className={styles.close} onClick={() => onDismiss(t.id)} aria-label="Dismiss">
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M1 1l8 8M9 1l-8 8" />
        </svg>
      </button>

      {duration > 0 && (
        <motion.div
          className={styles.countdown}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}

export interface ToastAnimatedProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export function ToastAnimated({ toasts, onDismiss }: ToastAnimatedProps) {
  return (
    <AnimatePresence mode="popLayout">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </AnimatePresence>
  );
}
