import { useTranslation } from "react-i18next";
import { Button, Tag, Text } from "@mattbutlerengineering/rialto";
import styles from "./RehearsalBanner.module.css";

export interface RehearsalBannerProps {
  onLeave: () => void;
}

/** Persistent and not dismissible: every rehearsal view carries it. */
export function RehearsalBanner({ onLeave }: RehearsalBannerProps) {
  const { t } = useTranslation();
  return (
    <div role="note" aria-label={t("rehearsal.banner.label")} className={styles.banner}>
      <Tag variant="accent">{t("rehearsal.banner.tag")}</Tag>
      <Text as="p" className={styles.text}>
        {t("rehearsal.banner.text")}
      </Text>
      <Button variant="secondary" size="sm" onClick={onLeave}>
        {t("rehearsal.banner.leave")}
      </Button>
    </div>
  );
}
