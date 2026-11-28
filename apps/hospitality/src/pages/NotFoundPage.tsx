import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import styles from "./NotFoundPage.module.css";

interface NotFoundPageProps {
  /**
   * A signed-out visitor (often a guest who mistyped a booking or menu link):
   * plain copy and a link home, nothing that implies they must sign in (#9990).
   */
  readonly guest?: boolean;
}

function GuestNotFound() {
  const { t } = useTranslation();
  useDocumentTitle(t("notFound.guestDocumentTitle"));
  return (
    <div className={styles.container}>
      <PageHeader title={t("notFound.guestTitle")} />
      <Text variant="body" color="secondary" className={styles.message}>
        {t("notFound.guestMessage")}
      </Text>
      <Link to="/" className={styles.guestLink}>
        {t("notFound.guestHome")}
      </Link>
    </div>
  );
}

export function NotFoundPage({ guest = false }: NotFoundPageProps) {
  const { t } = useTranslation();
  if (guest) return <GuestNotFound />;
  return (
    <div className={styles.container}>
      <PageHeader title="404" />
      <Text variant="body" color="secondary" className={styles.message}>
        {t("notFound.message")}
      </Text>

      <Link to="/timeline" className={styles.primaryLink}>
        {t("notFound.back")}
      </Link>
    </div>
  );
}
