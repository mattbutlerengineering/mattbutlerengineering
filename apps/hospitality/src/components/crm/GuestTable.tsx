import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
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

function formatDate(isoString: string | null, fmt: VenueFormat, t: TFunction): string {
  if (!isoString) return t("guests.table.never");
  return fmt.formatInstant(isoString, { year: "numeric", month: "numeric", day: "numeric" });
}

/* ── Mobile guest card ──────────────────────── */

function MobileGuestCard({ guest, onClick }: { guest: Guest; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button type="button" className={styles.mobileCard} onClick={onClick}>
      <div className={styles.mobileCardHeader}>
        <Text variant="body" color="primary" className={styles.guestName}>
          {guest.name}
        </Text>
        <Badge variant="neutral" size="sm">
          {t("crm.visit", { count: guest.visitCount })}
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
  const { t } = useTranslation();
  const fmt = useVenueFormat();
  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, guestId: string) => {
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
                <th className={styles.th}>{t("guests.table.guest")}</th>
                <th className={styles.th}>{t("guests.table.contact")}</th>
                <th className={styles.th}>{t("guests.table.visits")}</th>
                <th className={styles.th}>{t("guests.table.lastVisit")}</th>
                <th className={styles.th}>{t("guests.table.tags")}</th>
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
                >
                  <td className={styles.td}>
                    <button
                      type="button"
                      className={styles.rowButton}
                      onClick={() => onRowClick(guest.id)}
                      onKeyDown={(e) => handleRowKeyDown(e, guest.id)}
                      aria-label={t("guests.table.viewDetails", { name: guest.name })}
                    />
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
                  <td className={styles.tdMuted}>{formatDate(guest.lastVisit, fmt, t)}</td>
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
