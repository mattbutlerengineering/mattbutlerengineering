import { Link } from "react-router";
import { Heading, Text, Button } from "@mattbutlerengineering/rialto";
import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  return (
    <div className={styles.container}>
      <Heading level={1} className={styles.heading}>
        404
      </Heading>
      <Text variant="body" color="secondary" className={styles.message}>
        This table&apos;s not on tonight&apos;s floor plan. That page never made the reservation
        book.
      </Text>

      <Link to="/timeline" className={styles.primaryLink}>
        <Button variant="primary" size="md">
          Back to tonight&apos;s service
        </Button>
      </Link>
    </div>
  );
}
