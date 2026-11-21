import { Text } from "@mattbutlerengineering/rialto";
import type { Claim } from "../../data/service-night";
import { StatusMark } from "./StatusMark";
import styles from "./service-night.module.css";

export function ClaimList({ claims }: { claims: readonly Claim[] }) {
  if (claims.length === 0) return null;
  return (
    <ul className={styles.claims}>
      {claims.map((claim) => (
        <li key={claim.id} data-testid={`claim-${claim.id}`} className={styles.claim}>
          <div className={styles.claimHead}>
            <Text as="span" className={styles.claimLabel}>
              {claim.label}
            </Text>
            <StatusMark status={claim.status} />
          </div>
          <Text variant="detail" color="secondary">
            {claim.detail}
          </Text>
        </li>
      ))}
    </ul>
  );
}
