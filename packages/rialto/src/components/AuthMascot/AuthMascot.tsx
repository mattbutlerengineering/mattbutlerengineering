import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./AuthMascot.module.css";

export interface AuthMascotProps {
  /** Current state: 'idle', 'typing', 'peeking', 'covering' */
  state?: "idle" | "typing" | "peeking" | "covering";
  /** Percentage of completion or field length (for eye tracking) */
  progress?: number;
}

export function AuthMascot({ state = "idle", progress = 0 }: AuthMascotProps) {
  // Eye tracking logic
  const eyeX = useMemo(() => {
    // Map progress (0-1) to eye shift (-4 to 4 px)
    return (progress - 0.5) * 8;
  }, [progress]);

  return (
    <div className={styles.mascot}>
      {/* Body */}
      <div className={styles.body}>
        {/* Head */}
        <div className={styles.head}>
          {/* Eyes */}
          <div className={styles.eyes}>
            <motion.div 
              className={styles.eye}
              animate={{ x: state === 'covering' ? 0 : eyeX }}
            >
              <div className={styles.pupil} />
            </motion.div>
            <motion.div 
              className={styles.eye}
              animate={{ x: state === 'covering' ? 0 : eyeX }}
            >
              <div className={styles.pupil} />
            </motion.div>
          </div>

          {/* Hands */}
          <AnimatePresence>
            {state === "covering" && (
              <motion.div
                key="hands-covering"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className={styles.handsCovering}
              >
                <div className={styles.handLeft} />
                <div className={styles.handRight} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
