import { Link } from "react-router";
import { DEMO_PAGES } from "../data/nav-sections";
import styles from "./DemosIndexPage.module.css";

/**
 * Index route for `/rialto/demos/`. DemoLayout renders only an `<Outlet />`
 * inside `<main>`, so without an index child the page was empty (#8535).
 */
export function DemosIndexPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Demos</h1>
      <p className={styles.lede}>Full-page demos built with Rialto components.</p>
      <ul className={styles.list}>
        {DEMO_PAGES.map((page) => (
          <li key={page.id}>
            <Link to={page.path} className={styles.card}>
              {page.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

DemosIndexPage.displayName = "DemosIndexPage";
