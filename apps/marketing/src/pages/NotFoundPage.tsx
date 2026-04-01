import { useEffect } from "react";
import { Link } from "react-router-dom";
import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  useEffect(() => {
    document.title = "Page not found — Matt Butler Engineering";
    return () => {
      document.title = "Matt Butler Engineering";
    };
  }, []);

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>404</h1>
      <p className={styles.message}>Page not found</p>
      <Link to="/" className={styles.homeLink}>
        Back to home
      </Link>
    </div>
  );
}
