import { forwardRef, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { spring, boop } from '../../tokens/motion';
import styles from './Tag.module.css';

/* ── Types ───────────────────────────────────── */
type TagVariant = 'default' | 'accent' | 'success' | 'error';

/**
 * A compact label for categorization, filtering, or selection.
 * When `onClick` is provided the tag renders as an interactive button; otherwise it is a static span.
 *
 * @example
 * <Tag variant="accent" dismissible onDismiss={() => remove(id)}>
 *   Telemetry
 * </Tag>
 */
interface TagProps {
  children: string;
  variant?: TagVariant;
  /** Show dismiss button */
  dismissible?: boolean;
  /** Called when dismiss is clicked */
  onDismiss?: () => void;
  /** Clickable tag (for filters) */
  onClick?: () => void;
  /** Selected state (gold fill) */
  selected?: boolean;
  /** Icon rendered before label */
  icon?: ReactNode;
  className?: string;
}

/* ── Component ──────────────────────────────── */
export const Tag = forwardRef<HTMLElement, TagProps>(
  (
    {
      children,
      variant = 'default',
      dismissible = false,
      onDismiss,
      onClick,
      selected = false,
      icon,
      className = '',
    },
    ref
  ) => {
    const isInteractive = !!onClick;
    const shouldReduceMotion = useReducedMotion();
    const variantClass = variant !== 'default' ? (styles[variant] ?? '') : '';
    const classes = [
      styles.tag,
      variantClass,
      isInteractive ? styles.interactive : '',
      selected ? styles.selected : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    if (isInteractive) {
      return (
        <motion.button
          ref={ref as React.Ref<HTMLButtonElement>}
          className={classes}
          onClick={onClick}
          type="button"
          whileHover={
            shouldReduceMotion
              ? undefined
              : { scale: boop.scale, transition: boop.transition }
          }
        >
          {icon && <span className={styles.icon}>{icon}</span>}
          {children}
          {dismissible && (
            <button
              className={styles.dismiss}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss?.();
              }}
              aria-label={`Remove ${children}`}
              type="button"
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M1 1l6 6M7 1l-6 6" />
              </svg>
            </button>
          )}
        </motion.button>
      );
    }

    return (
      <span ref={ref as React.Ref<HTMLSpanElement>} className={classes}>
        {icon && <span className={styles.icon}>{icon}</span>}
        {children}
        {dismissible && (
          <button
            className={styles.dismiss}
            onClick={(e) => {
              e.stopPropagation();
              onDismiss?.();
            }}
            aria-label={`Remove ${children}`}
            type="button"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M1 1l6 6M7 1l-6 6" />
            </svg>
          </button>
        )}
      </span>
    );
  }
);
Tag.displayName = 'Tag';

/* ── Animated Tag (for dismissible lists) ───── */
/**
 * A Tag wrapped in a Framer Motion layout animation for smooth enter/exit transitions.
 * Use inside a `TagGroup` so that `AnimatePresence` can track additions and removals.
 *
 * @example
 * <TagGroup>
 *   {tags.map((t) => (
 *     <AnimatedTag key={t} id={t} dismissible onDismiss={() => remove(t)}>
 *       {t}
 *     </AnimatedTag>
 *   ))}
 * </TagGroup>
 */
interface AnimatedTagProps extends TagProps {
  /** Unique key for AnimatePresence */
  id: string;
}

export const AnimatedTag = forwardRef<HTMLDivElement, AnimatedTagProps>(
  ({ id: _id, ...props }, ref) => {
    const shouldReduceMotion = useReducedMotion();

    return (
      <motion.div
        ref={ref}
        layout
        initial={
          shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }
        }
        animate={{ opacity: 1, scale: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
        transition={shouldReduceMotion ? { duration: 0.1 } : spring}
        style={{ display: 'inline-flex' }}
      >
        <Tag {...props} />
      </motion.div>
    );
  }
);
AnimatedTag.displayName = 'AnimatedTag';

/* ── Tag Group ───────────────────────────────── */
/**
 * A flex container that wraps `AnimatedTag` children with `AnimatePresence` for coordinated enter/exit animations.
 *
 * @example
 * <TagGroup>
 *   <AnimatedTag id="a">Alpha</AnimatedTag>
 *   <AnimatedTag id="b">Beta</AnimatedTag>
 * </TagGroup>
 */
interface TagGroupProps {
  children: ReactNode;
  className?: string;
}

export const TagGroup = forwardRef<HTMLDivElement, TagGroupProps>(
  ({ children, className = '' }, ref) => {
    return (
      <div ref={ref} className={`${styles.group} ${className}`}>
        <AnimatePresence>{children}</AnimatePresence>
      </div>
    );
  }
);
TagGroup.displayName = 'TagGroup';
