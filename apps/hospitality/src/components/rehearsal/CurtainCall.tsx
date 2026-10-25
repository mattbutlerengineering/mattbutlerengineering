import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { formatWallHour } from "../../utils/format.js";
import { KpiStat } from "../KpiStat.js";
import type { RehearsalMetrics } from "./rehearsal-state.js";
import styles from "./CurtainCall.module.css";

export interface CurtainCallProps {
  metrics: RehearsalMetrics;
  onRunAgain: () => void;
  onTryWeeknight: () => void;
}

/** The end-of-night summary of a rehearsal, read straight from the reducer's metrics. */
export function CurtainCall({ metrics, onRunAgain, onTryWeeknight }: CurtainCallProps) {
  const { t } = useTranslation();
  const fmt = useVenueFormat();
  return (
    <section
      className={styles.card}
      data-testid="curtain-call"
      aria-labelledby="curtain-call-title"
    >
      <Text as="h2" variant="label" id="curtain-call-title" className={styles.title}>
        {t("rehearsal.curtainCall.title")}
      </Text>
      <div className={styles.stats}>
        <KpiStat label={t("rehearsal.curtainCall.covers")} value={metrics.coversServed} />
        <KpiStat
          label={t("rehearsal.curtainCall.turn")}
          value={t("rehearsal.curtainCall.minutes", { minutes: metrics.averageTurnMinutes })}
        />
        <KpiStat
          label={t("rehearsal.curtainCall.peak")}
          value={metrics.peakHour === null ? null : formatWallHour(metrics.peakHour, fmt.locale)}
        />
        <KpiStat label={t("rehearsal.curtainCall.neverSat")} value={metrics.tablesNeverSat} />
        <KpiStat
          label={t("rehearsal.curtainCall.wait")}
          value={t("rehearsal.curtainCall.minutes", { minutes: metrics.longestWalkInWaitMinutes })}
        />
      </div>
      <div className={styles.actions}>
        <Button variant="primary" size="sm" onClick={onRunAgain}>
          {t("rehearsal.curtainCall.runAgain")}
        </Button>
        <Button variant="secondary" size="sm" onClick={onTryWeeknight}>
          {t("rehearsal.curtainCall.weeknight")}
        </Button>
      </div>
    </section>
  );
}
