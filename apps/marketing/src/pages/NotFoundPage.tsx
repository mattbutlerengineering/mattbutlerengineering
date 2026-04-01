import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Stack, Text, Button } from "@mbe/rialto";
import styles from "./NotFoundPage.module.css";

const SUGGESTED_LINKS = [
  { to: "/", label: "Home" },
  { to: "/rialto", label: "Design System" },
  { to: "/hospitality", label: "Hospitality" },
];

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
      <Text variant="body" color="secondary" className={styles.message}>
        This page doesn&apos;t exist. It may have been moved or removed.
      </Text>

      <Stack gap="lg" align="center">
        <Link to="/" className={styles.primaryLink}>
          <Button variant="primary" size="md">
            Back to home
          </Button>
        </Link>

        <Text variant="body" color="secondary">
          Or try one of these:
        </Text>

        <Stack direction="row" gap="md" wrap>
          {SUGGESTED_LINKS.filter((link) => link.to !== "/").map((link) => (
            <Link key={link.to} to={link.to} className={styles.suggestedLink}>
              {link.label}
            </Link>
          ))}
        </Stack>
      </Stack>
    </div>
  );
}
