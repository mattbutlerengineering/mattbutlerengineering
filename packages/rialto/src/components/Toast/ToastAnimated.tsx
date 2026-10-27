import { AnimatePresence, motion } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
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
  const { messages } = useRialtoLocale();
  const motionPreset = useMotionPreset();
  const shouldReduceMotion = motionPreset.reduced;
  const duration = t.duration ?? 4000;

  return (
    <motion.div
      layout
      className={cn(styles.toast, styles[t.variant ?? "default"])}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.96 }}
      transition={motionPreset.precision}
    >
      <ToastIcon variant={t.variant ?? "default"} />
      {t.title && <p className={styles.title}>{t.title}</p>}
      {t.description && <p className={styles.description}>{t.description}</p>}
      {t.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            t.action?.onClick();
            onDismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}

      <button
        className={styles.close}
        onClick={() => onDismiss(t.id)}
        aria-label={messages.dismiss}
      >
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
