import { useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import styles from "./AuthMascot.module.css";

export type MascotState = "neutral" | "active" | "shy" | "peek" | "success";

export interface AuthMascotProps {
  /** Current mascot state */
  state?: MascotState;
  /** Progress for eye tracking (0-1) */
  progress?: number;
}

export function AuthMascot({ state = "neutral", progress = 0 }: AuthMascotProps) {
  const shouldReduceMotion = useReducedMotion();
  const eyeX = useMemo(() => {
    return (progress - 0.5) * 8;
  }, [progress]);

  const isShy = state === "shy";
  const isSuccess = state === "success";

  return (
    <div className={styles.mascot} role="img" aria-label="Otter mascot">
      <motion.div
        className={styles.otter}
        animate={{
          y: isSuccess && !shouldReduceMotion ? [0, -12, 0, -8, 0] : 0,
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : isSuccess ? 0.8 : 0.3,
          ease: "easeOut",
        }}
      >
        {/* Ears */}
        <div className={styles.earLeft} />
        <div className={styles.earRight} />

        {/* Head */}
        <div className={styles.head}>
          {/* Eyes */}
          <div className={styles.eyes}>
            <motion.div
              className={styles.eye}
              animate={{
                x: isShy || shouldReduceMotion ? 0 : eyeX,
                scaleY: isShy ? 0.1 : 1,
              }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            >
              <div className={styles.pupil} />
            </motion.div>
            <motion.div
              className={styles.eye}
              animate={{
                x: isShy || shouldReduceMotion ? 0 : eyeX,
                scaleY: isShy ? 0.1 : 1,
              }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            >
              <div className={styles.pupil} />
            </motion.div>
          </div>

          {/* Nose */}
          <div className={styles.nose} />

          {/* Mouth */}
          <motion.div
            className={styles.mouth}
            animate={{
              scaleY: isSuccess ? 1.5 : 1,
            }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
          />
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Arms for covering eyes (shy state) */}
          <AnimatePresence>
            {isShy && (
              <motion.div
                key="arms-shy"
                initial={shouldReduceMotion ? { opacity: 0 } : { y: 15, opacity: 0 }}
                animate={shouldReduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { y: 15, opacity: 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                className={styles.armsShy}
              >
                <div className={styles.armLeft} />
                <div className={styles.armRight} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tail */}
          <motion.div
            className={styles.tail}
            animate={{
              rotate: isSuccess && !shouldReduceMotion ? [0, 20, -10, 20, 0] : 0,
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : isSuccess ? 0.6 : 0.3,
            }}
          />
        </div>

        {/* Success particles */}
        <AnimatePresence>
          {isSuccess && (
            <>
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={`particle-${i}`}
                  className={styles.particle}
                  initial={{ opacity: 1, x: 0, y: 0, scale: 0 }}
                  animate={
                    shouldReduceMotion
                      ? { opacity: 0, x: 0, y: 0, scale: 1 }
                      : {
                          opacity: 0,
                          x: Math.cos(i * 60 * (Math.PI / 180)) * 30,
                          y: Math.sin(i * 60 * (Math.PI / 180)) * -30,
                          scale: 1,
                        }
                  }
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.6,
                    delay: shouldReduceMotion ? 0 : i * 0.05,
                  }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
