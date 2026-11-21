import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import type { Claim } from "./service-night.js";
import { StatusMark } from "./StatusMark.js";
import styles from "./showcase.module.css";

export function ClaimList({ claims }: { claims: readonly Claim[] }) {
  const { t } = useTranslation();
  if (claims.length === 0) return null;
  return (
    <ul className={styles.claims}>
      {claims.map((claim) => (
        <li key={claim.id} data-testid={`claim-${claim.id}`} className={styles.claim}>
          <div className={styles.claimHead}>
            <Text as="span" className={styles.claimLabel}>
              {t(`showcase.claims.${claim.id}.label`)}
            </Text>
            <StatusMark status={claim.status} />
          </div>
          <Text variant="detail" color="secondary">
            {t(`showcase.claims.${claim.id}.detail`)}
          </Text>
        </li>
      ))}
    </ul>
  );
}
