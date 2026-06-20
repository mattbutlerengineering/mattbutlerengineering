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
}: SearchOrchestratorProps) {
  return (
    <>
      <div className={styles.headerControls}>
        <Input
          type="text"
          placeholder="Search guests..."
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
        />
        <Button variant="primary" onClick={onAddGuest}>
          Add Guest
        </Button>
      </div>

      {!isEmpty && (
        <Text variant="caption" color="secondary" className={styles.resultCount}>
          Showing {guestCount} of {totalCount} guests
        </Text>
      )}

      {isEmpty && (
        <div aria-live="polite" role="status">
          <EmptyState
            heading={isSearchActive ? "No guests found" : "No guests yet"}
            description={
              isSearchActive
                ? "Try adjusting your search query."
                : "Guests will appear here once they make a reservation."
            }
          />
        </div>
      )}
    </>
  );
}
