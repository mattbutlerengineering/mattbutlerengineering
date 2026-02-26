import { type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Breadcrumb } from "@mbe/rialto";
import styles from "./DriverLayout.module.css";

interface BreadcrumbEntry {
  label: string;
  href?: string;
}

interface DriverLayoutProps {
  title: string;
  breadcrumbs: BreadcrumbEntry[];
  actions?: ReactNode;
  children: ReactNode;
}

export function DriverLayout({ title, breadcrumbs, actions, children }: DriverLayoutProps) {
  const navigate = useNavigate();

  const items = breadcrumbs.map((b) =>
    b.href ? { label: b.label, onClick: () => navigate(b.href!) } : { label: b.label }
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.atmosphere} />
        <div className={styles.grain} />
        <div className={styles.headerInner}>
          <Breadcrumb items={items} />
          <div className={styles.titleRow}>
            <h1 className={styles.heading}>{title}</h1>
            {actions && <div className={styles.titleActions}>{actions}</div>}
          </div>
        </div>
      </header>

      <main className={styles.content}>{children}</main>

      <footer className={styles.footer}>
        <Link to="/" className={styles.footerLink}>
          Back to Design System &rarr;
        </Link>
        <Link to="/drivers" className={styles.footerLink}>
          All Drivers
        </Link>
      </footer>
    </div>
  );
}
