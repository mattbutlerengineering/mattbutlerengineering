import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { precision } from "../../tokens/motion";
import styles from "./Hero.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * Marketing splash section with centered content, atmospheric
 * decorative touches, and a fade-up entrance animation.
 *
 * Wrap text in `<span className="accent">` inside `title`
 * to apply the gold accent color.
 *
 * @example
 * <Hero
 *   eyebrow="Design System"
 *   title={<>Precision meets <span className="accent">warmth</span></>}
 *   subtitle="A component library for premium digital products."
 *   actions={<Button variant="primary">Get started</Button>}
 * />
 */
export interface HeroProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  /** Main heading — supports ReactNode for accent span wrapping. */
  title: ReactNode;
  /** Description paragraph below the title. */
  subtitle?: string;
  /** CTA buttons or links slot. */
  actions?: ReactNode;
  /** Minimum section height. Default "85vh". */
  minHeight?: string;
  /** Show a gold accent divider between subtitle and actions. Default true. */
  showDivider?: boolean;
}

/* ── Animation variants ──────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

/* ── Component ───────────────────────────────── */

export const Hero = forwardRef<HTMLElement, HeroProps>(
  (
    {
      eyebrow,
      title,
      subtitle,
      actions,
      minHeight = "85vh",
      showDivider = true,
      className,
      style,
      id,
      "aria-label": ariaLabel,
      ...rest
    },
    ref
  ) => {
    // Avoid spreading arbitrary HTML attrs onto motion.section (type conflict)
    void rest;
    const shouldReduceMotion = useReducedMotion();
    const transition = shouldReduceMotion ? { duration: 0 } : precision;

    const classes = [styles.hero, className].filter(Boolean).join(" ");

    return (
      <motion.section
        ref={ref}
        className={classes}
        style={{ minHeight, ...style }}
        id={id}
        aria-label={ariaLabel}
        initial="hidden"
        animate="visible"
        transition={{ staggerChildren: shouldReduceMotion ? 0 : 0.08 }}
      >
        <div className={styles.content}>
          {eyebrow && (
            <motion.p className={styles.eyebrow} variants={fadeUp} transition={transition}>
              {eyebrow}
            </motion.p>
          )}

          <motion.h1 className={styles.title} variants={fadeUp} transition={transition}>
            {title}
          </motion.h1>

          {subtitle && (
            <motion.p className={styles.subtitle} variants={fadeUp} transition={transition}>
              {subtitle}
            </motion.p>
          )}

          {showDivider && (
            <motion.hr className={styles.divider} variants={fadeUp} transition={transition} />
          )}

          {actions && (
            <motion.div className={styles.actions} variants={fadeUp} transition={transition}>
              {actions}
            </motion.div>
          )}
        </div>
      </motion.section>
    );
  }
);

Hero.displayName = "Hero";
