import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import styles from './AspectRatio.module.css';

/**
 * Constrains its children to a fixed width-to-height aspect ratio using a
 * CSS custom property (`--ratio`), keeping content responsive without CLS.
 *
 * The child element is stretched to fill the container; use `object-fit` on
 * images or videos inside for cropping behavior.
 *
 * @example
 * <AspectRatio ratio={16 / 9}>
 *   <img src="/hero.jpg" alt="Hero" style={{ objectFit: "cover" }} />
 * </AspectRatio>
 */
export interface AspectRatioProps extends HTMLAttributes<HTMLDivElement> {
  /** Width-to-height ratio (e.g. 16/9, 4/3, 1). Default 16/9 */
  ratio?: number;
  children: ReactNode;
}

export const AspectRatio = forwardRef<HTMLDivElement, AspectRatioProps>(
  ({ ratio = 16 / 9, children, className, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={[styles.root, className].filter(Boolean).join(' ')}
        style={{ '--ratio': ratio, ...style } as React.CSSProperties}
        {...props}
      >
        <div className={styles.inner}>{children}</div>
      </div>
    );
  }
);

AspectRatio.displayName = 'AspectRatio';
