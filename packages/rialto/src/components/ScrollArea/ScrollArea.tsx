import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import styles from './ScrollArea.module.css';

/**
 * Custom scroll container with styled scrollbars that match the Rialto surface
 * aesthetic.
 *
 * Set `maxHeight` to constrain the visible area; content beyond that limit
 * becomes scrollable. The container is keyboard-focusable (`tabIndex={0}`)
 * and marked as `role="region"` for accessibility.
 *
 * @example
 * <ScrollArea maxHeight={240}>
 *   <Text>Long scrollable content goes here...</Text>
 * </ScrollArea>
 */
export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** Constrain the scrollable height */
  maxHeight?: string | number;
  children: ReactNode;
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ maxHeight, children, className, style, ...props }, ref) => {
    const heightStyle =
      typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;

    return (
      <div
        ref={ref}
        className={[styles.root, className].filter(Boolean).join(' ')}
        style={{ maxHeight: heightStyle, ...style }}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label="Scrollable content"
        {...props}
      >
        {children}
      </div>
    );
  }
);

ScrollArea.displayName = 'ScrollArea';
