import { useTranslation } from "react-i18next";
import { Button, EmptyState, Input, Text } from "@mattbutlerengineering/rialto";
import styles from "../../pages/GuestsPage.module.css";

/* ── Props ─────────────────────────────────── */

export interface SearchOrchestratorProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddGuest: () => void;
  guestCount: number;
  totalCount: number;
  isSearchActive: boolean;
  isEmpty: boolean;
  /** While true, suppresses the result count and empty state to prevent a flash during initial load */
  isLoading?: boolean;
}

/* ── Component ──────────────────────────────── */

export function SearchOrchestrator({
  searchQuery,
  onSearchChange,
  onAddGuest,
  guestCount,
  totalCount,
  isSearchActive,
  isEmpty,
  isLoading = false,
}: SearchOrchestratorProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className={styles.headerControls}>
        <Input
          type="text"
          aria-label={t("guests.search.label")}
          placeholder={t("guests.search.placeholder")}
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
        />
        <Button variant="primary" onClick={onAddGuest}>
          {t("guests.addGuest")}
        </Button>
      </div>

      {!isLoading && !isEmpty && (
        <Text variant="caption" color="secondary" className={styles.resultCount}>
          {t("guests.search.showing", { shown: guestCount, total: totalCount })}
        </Text>
      )}

      {!isLoading && isEmpty && (
        <div aria-live="polite" role="status">
          <EmptyState
            heading={isSearchActive ? t("guests.search.noneFound") : t("guests.search.noneYet")}
            description={
              isSearchActive ? t("guests.search.tryAdjusting") : t("guests.search.getStarted")
            }
            action={
              !isSearchActive && (
                <Button variant="primary" onClick={onAddGuest}>
                  {t("guests.addAGuest")}
                </Button>
              )
            }
          />
        </div>
      )}
    </>
  );
}
