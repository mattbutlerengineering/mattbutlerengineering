import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Text, Button } from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.container}>
      <PageHeader title="404" />
      <Text variant="body" color="secondary" className={styles.message}>
        {t("notFound.message")}
      </Text>

      <Link to="/timeline" className={styles.primaryLink}>
        <Button variant="primary" size="md">
          {t("notFound.back")}
        </Button>
      </Link>
    </div>
  );
}
