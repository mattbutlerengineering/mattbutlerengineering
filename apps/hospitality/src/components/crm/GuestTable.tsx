import { Badge, Button, Card, Tag, Text } from "@mattbutlerengineering/rialto";
import type { Guest } from "@mbe/types";
import styles from "../../pages/GuestsPage.module.css";

/* ── Props ─────────────────────────────────── */

export interface GuestTableProps {
  guests: Guest[];
  selectedGuestId: string | null;
  onRowClick: (guestId: string) => void;
}

/* ── Helpers ────────────────────────────────── */

function formatDate(isoString: string | null): string {
  if (!isoString) return "Never";
  return new Date(isoString).toLocaleDateString();
}

/* ── Mobile guest card ──────────────────────── */

function MobileGuestCard({ guest, onClick }: { guest: Guest; onClick: () => void }) {
  return (
    <Button type="button" className={styles.mobileCard} onClick={onClick}>
      <div className={styles.mobileCardHeader}>
        <Text variant="body" color="primary" className={styles.guestName}>
          {guest.name}
        </Text>
        <Badge variant="neutral" size="sm">
          {guest.visitCount} {guest.visitCount === 1 ? "visit" : "visits"}
        </Badge>
      </div>
      <div className={styles.mobileCardContact}>
        {guest.email && (
          <Text variant="caption" color="secondary">
            {guest.email}
          </Text>
        )}
        {guest.phone && (
          <Text variant="caption" color="secondary">
            {guest.phone}
          </Text>
        )}
      </div>
      {guest.tags && guest.tags.length > 0 && (
        <div className={styles.tagList}>
          {guest.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
    </Button>
  );
}

/* ── GuestTable ─────────────────────────────── */

export function GuestTable({ guests, selectedGuestId, onRowClick }: GuestTableProps) {
  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>, guestId: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick(guestId);
    }
  };

  return (
    <>
      {/* Desktop table */}
      <Card className={styles.desktopTable}>
        <div className={styles.tableWrapper}>
          {/* eslint-disable mbe-local/prefer-rialto-components -- HTML table elements are correct here; Rialto Table has a different API */}
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Guest</th>
                <th className={styles.th}>Contact</th>
                <th className={styles.th}>Visits</th>
                <th className={styles.th}>Last Visit</th>
                <th className={styles.th}>Tags</th>
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {guests.map((guest) => (
                <tr
                  key={guest.id}
                  className={[
                    styles.tableRow,
                    selectedGuestId === guest.id ? styles.tableRowActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onRowClick(guest.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, guest.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`View details for ${guest.name}`}
                >
                  <td className={styles.td}>
                    <Text variant="body" color="primary" className={styles.guestName}>
                      {guest.name}
                    </Text>
                    {guest.notes && (
                      <Text variant="caption" color="secondary" className={styles.guestNotes}>
                        {guest.notes}
                      </Text>
                    )}
                  </td>
                  <td className={styles.td}>
                    {guest.email && (
                      <Text variant="caption" color="primary">
                        {guest.email}
                      </Text>
                    )}
                    {guest.phone && (
                      <Text variant="caption" color="secondary">
                        {guest.phone}
                      </Text>
                    )}
                  </td>
                  <td className={styles.td}>{guest.visitCount}</td>
                  <td className={styles.tdMuted}>{formatDate(guest.lastVisit)}</td>
                  <td className={styles.tdTags}>
                    <div className={styles.tagList}>
                      {guest.tags?.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* eslint-enable mbe-local/prefer-rialto-components */}
        </div>
      </Card>

      {/* Mobile cards */}
      <div className={styles.mobileCards}>
        {guests.map((guest) => (
          <MobileGuestCard key={guest.id} guest={guest} onClick={() => onRowClick(guest.id)} />
        ))}
      </div>
    </>
  );
}
