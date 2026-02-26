import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import styles from './Footer.module.css';

/* ── Types ───────────────────────────────────── */

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/**
 * Page footer with two layout variants.
 *
 * - **minimal** (default) — horizontal flex row for utility bars, kbd hints, inline links.
 * - **rich** — centered column with logo, multi-column link groups, and copyright.
 *
 * @example
 * // Minimal
 * <Footer>
 *   <span>&copy; 2026 Rialto</span>
 *   <a href="/privacy">Privacy</a>
 * </Footer>
 *
 * // Rich
 * <Footer
 *   variant="rich"
 *   columns={[{ title: 'Product', links: [{ label: 'Docs', href: '/docs' }] }]}
 *   copyright="&copy; 2026 Rialto Design System"
 * />
 */
export interface FooterProps extends HTMLAttributes<HTMLElement> {
  variant?: 'minimal' | 'rich';
  /** Logo element for the rich variant. Defaults to "Rialto" text. */
  logo?: ReactNode;
  /** Multi-column link groups (rich variant). */
  columns?: FooterColumn[];
  /** Bottom-line copyright text (rich variant). */
  copyright?: string;
  /** Arbitrary content for the minimal variant. */
  children?: ReactNode;
}

/* ── Component ───────────────────────────────── */

export const Footer = forwardRef<HTMLElement, FooterProps>(
  (
    {
      variant = 'minimal',
      logo,
      columns,
      copyright,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const classes = [
      styles.footer,
      variant === 'rich' ? styles.rich : styles.minimal,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    if (variant === 'rich') {
      return (
        <footer ref={ref} className={classes} {...props}>
          <div className={styles.logo}>
            {logo ?? (
              <>
                Ri<span className={styles.logoAccent}>a</span>lto
              </>
            )}
          </div>

          {columns && columns.length > 0 && (
            <nav aria-label="Footer links" className={styles.columns}>
              {columns.map((col) => (
                <div key={col.title} className={styles.column}>
                  <div className={styles.columnTitle}>{col.title}</div>
                  <ul className={styles.columnLinks}>
                    {col.links.map((link) => (
                      <li key={link.href}>
                        <a href={link.href} className={styles.link}>
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}

          {copyright && <p className={styles.copyright}>{copyright}</p>}
        </footer>
      );
    }

    return (
      <footer ref={ref} className={classes} {...props}>
        {children}
      </footer>
    );
  }
);

Footer.displayName = 'Footer';
