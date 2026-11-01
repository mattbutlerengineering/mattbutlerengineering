import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { EmptyState } from "@mattbutlerengineering/rialto";
import { TimelineSkeleton } from "../components/timeline";
import { RehearsalTimeline } from "../components/rehearsal/RehearsalTimeline.js";
import { PageHeader } from "../components/PageHeader";
import { useVenue } from "../contexts/VenueContext.js";
import { useNow } from "../hooks/useNow.js";
import { useTables } from "../hooks/useTables.js";
import { deviceDate } from "../utils/service-day.js";
import styles from "./TimelinePage.module.css";

/**
 * Rehearsal mode (`?rehearsal=true`, Dress Rehearsal): the floor plan's tables are read, then a
 * client-side simulated service fills the grid. It mounts none of the live page's data or
 * mutation hooks, so it cannot write to the API.
 */
export function RehearsalTimelinePage() {
  const { t } = useTranslation();
  const { selectedVenueId } = useVenue();
  const now = useNow();
  const { data: tables, isLoading } = useTables({
    venueId: selectedVenueId ?? undefined,
    limit: 100,
    enabled: !!selectedVenueId,
  });

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <PageHeader
            title={t("timeline.page.title")}
            description={t("timeline.page.description")}
          />
        </div>
      </div>
      <div className={styles.content} data-testid="primary-content">
        <div className={styles.timelineArea}>
          {isLoading || !tables ? (
            <TimelineSkeleton />
          ) : tables.length === 0 ? (
            <EmptyState
              variant="flat"
              heading={t("timeline.page.noTablesHeading")}
              description={t("timeline.page.noTablesDescription")}
              action={
                <Link to="/floor-plans" className={styles.emptyStateLink}>
                  {t("timeline.page.floorPlans")}
                </Link>
              }
            />
          ) : (
            <RehearsalTimeline tables={tables} date={deviceDate(now)} />
          )}
        </div>
      </div>
    </div>
  );
}
