import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Breadcrumb, type BreadcrumbItem } from '../Breadcrumb/Breadcrumb';
import styles from './PageHeader.module.css';

/* ── Types ───────────────────────────────────── */

/**
 * Dark header band with breadcrumbs, title, and optional action buttons.
 * Uses `darkSurface` token override so child components (Badge, Button, etc.)
 * adapt automatically.
 *
 * @example
 * <PageHeader
 *   breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Settings' }]}
 *   title="Account Settings"
 *   actions={<Button size="sm">Save</Button>}
 * />
 */
export interface PageHeaderProps extends HTMLAttributes<HTMLElement> {
  /** Page title. */
  title: string;
  /** Breadcrumb trail rendered above the title. */
  breadcrumbs?: BreadcrumbItem[];
  /** Right-aligned action buttons. Hidden on narrow screens. */
  actions?: ReactNode;
  /** Badges or avatars displayed beside the title. */
  meta?: ReactNode;
  /** Extra content rendered below the title row. */
  children?: ReactNode;
}

/* Re-export BreadcrumbItem for consumer convenience */
export type { BreadcrumbItem };

/* ── Component ───────────────────────────────── */

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(
  (
    { title, breadcrumbs, actions, meta, children, className, ...props },
    ref
  ) => {
    const classes = [styles.header, className].filter(Boolean).join(' ');

    return (
      <header ref={ref} className={classes} {...props}>
        <div className={styles.atmosphere} />
        <div className={styles.grain} />

        <div className={styles.inner}>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumb items={breadcrumbs} />
          )}

          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {meta && <div className={styles.meta}>{meta}</div>}
            {actions && <div className={styles.actions}>{actions}</div>}
          </div>

          {children && <div className={styles.extra}>{children}</div>}
        </div>
      </header>
    );
  }
);

PageHeader.displayName = 'PageHeader';
