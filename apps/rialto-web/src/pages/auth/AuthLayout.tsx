import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  title: string;
  footer: ReactNode;
  children: ReactNode;
}

export function AuthLayout({ title, footer, children }: AuthLayoutProps) {
  return (
    <div className={styles.viewport}>
      <div className={styles.atmosphere} />
      <div className={styles.grain} />

      <div className={styles.card}>
        <p className={styles.logotype}>Rialto</p>
        <p className={styles.title}>{title}</p>
        {children}
      </div>

      <div className={styles.footer}>
        {footer}
        <Link to="/" className={styles.footerLink}>
          Back to Design System &rarr;
        </Link>
      </div>
    </div>
  );
}
