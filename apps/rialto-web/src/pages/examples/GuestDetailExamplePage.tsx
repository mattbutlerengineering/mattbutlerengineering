import type { ReactNode } from "react";
import {
  Avatar,
  Badge,
  Card,
  DataList,
  DataTable,
  Stack,
  Stat,
  Tabs,
  Text,
  Timeline,
} from "@mattbutlerengineering/rialto";
import type { Tab, TimelineEvent } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./GuestDetailExamplePage.module.css";

/* ── Domain ──────────────────────────────────── */

export type StayStatus = "completed" | "cancelled" | "no-show";

export interface GuestStay extends Record<string, unknown> {
  id: string;
  room: string;
  /** ISO date — lexicographic order is chronological order. */
  checkIn: string;
  checkOut: string;
  nights: number;
  /** Folio total in whole US dollars. */
  total: number;
  status: StayStatus;
}

export interface UpcomingReservation extends Record<string, unknown> {
  id: string;
  room: string;
  checkIn: string;
  nights: number;
}

export interface GuestProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  language: string;
  memberSince: string;
  loyaltyPoints: number;
  preferences: { label: string; value: string }[];
}

/* ── Fixture data (no service calls) ─────────── */

/** The same guest who heads the Reservations List example — list → detail. */
export const GUEST: GuestProfile = {
  id: "GST-2041",
  name: "Elena Marchetti",
  email: "elena.marchetti@example.com",
  phone: "+39 02 5550 1234",
  address: "Via Brera 28, 20121 Milan, Italy",
  language: "Italian, English",
  memberSince: "June 2022",
  loyaltyPoints: 12480,
  preferences: [
    { label: "Room", value: "High floor, away from elevator" },
    { label: "Bed", value: "King, firm pillows" },
    { label: "Dining", value: "Vegetarian, no nuts" },
    { label: "Housekeeping", value: "Evening turndown service" },
  ],
};

export const PAST_STAYS: GuestStay[] = [
  { id: "RES-1001", room: "Suite 402", checkIn: "2026-03-23", checkOut: "2026-03-26", nights: 3, total: 1740, status: "completed" },
  { id: "RES-0871", room: "Suite 510", checkIn: "2025-11-08", checkOut: "2025-11-12", nights: 4, total: 2320, status: "completed" },
  { id: "RES-0764", room: "Deluxe 307", checkIn: "2025-08-15", checkOut: "2025-08-17", nights: 2, total: 680, status: "cancelled" },
  { id: "RES-0652", room: "Suite 404", checkIn: "2025-05-02", checkOut: "2025-05-07", nights: 5, total: 2900, status: "completed" },
  { id: "RES-0518", room: "Deluxe 218", checkIn: "2024-12-19", checkOut: "2024-12-21", nights: 2, total: 640, status: "no-show" },
  { id: "RES-0407", room: "Standard 115", checkIn: "2024-07-30", checkOut: "2024-08-02", nights: 3, total: 540, status: "completed" },
];

export const UPCOMING_RESERVATIONS: UpcomingReservation[] = [
  { id: "RES-1107", room: "Suite 402", checkIn: "2026-08-14", nights: 4 },
  { id: "RES-1152", room: "Suite 511", checkIn: "2026-12-28", nights: 6 },
];

export const ACTIVITY: TimelineEvent[] = [
  {
    title: "Checked in to Suite 402",
    description: "Early arrival honored; welcome amenity delivered.",
    timestamp: "Mar 23, 2026",
    status: "completed",
  },
  {
    title: "Upgraded to Gold tier",
    description: "Crossed 40 lifetime nights.",
    timestamp: "Nov 12, 2025",
    status: "completed",
  },
  {
    title: "Left a 5-star review",
    description: "Praised turndown service and quiet floor.",
    timestamp: "May 8, 2025",
    status: "completed",
  },
  {
    title: "Joined the loyalty program",
    timestamp: "Jun 3, 2022",
    status: "completed",
  },
];

const STAY_STATUS_META: Record<
  StayStatus,
  { label: string; variant: "success" | "warning" | "error" }
> = {
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "error" },
  "no-show": { label: "No-show", variant: "warning" },
};

/* ── Pure data transforms (exported for direct testing) ─────────── */

/** Nights actually slept — cancelled and no-show stays contribute nothing. */
export function totalNights(stays: GuestStay[]): number {
  return stays.reduce((sum, stay) => (stay.status === "completed" ? sum + stay.nights : sum), 0);
}

/** Revenue actually captured — only completed stays count toward spend. */
export function lifetimeSpend(stays: GuestStay[]): number {
  return stays.reduce((sum, stay) => (stay.status === "completed" ? sum + stay.total : sum), 0);
}

/** Whole-dollar USD, e.g. `formatCurrency(1650)` → `"$1,650"`. */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Copy of `stays` sorted newest check-in first; the input is not mutated. */
export function sortByMostRecent(stays: GuestStay[]): GuestStay[] {
  return [...stays].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
}

/* ── Display formatting ──────────────────────── */

// UTC keeps fixture dates stable regardless of the viewer's timezone.
const STAY_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/* ── Source snippet + composition notes ──────── */

const SOURCE_JSX = `import { Avatar, Badge, Card, DataList, DataTable, Stat, Tabs, Timeline } from "@mattbutlerengineering/rialto";

// Identity header — avatar, name, status badges, derived stats
<Avatar name={guest.name} size="xl" status="online" />
<Text variant="display" as="h2">{guest.name}</Text>
<Badge variant="accent">Gold Member</Badge>
<Badge variant="success">Checked in</Badge>
<Stat label="Total stays" value={stays.length} size="sm" />
<Stat label="Lifetime spend" value={formatCurrency(lifetimeSpend(stays))} size="sm" />

// Tabbed body — overview, history, related records
<Tabs
  defaultTab="overview"
  tabs={[
    { id: "overview", label: "Overview", content: <DataList items={contact} /> },
    {
      id: "history",
      label: "Stay history",
      content: <DataTable columns={columns} data={sortByMostRecent(stays)} label="Stay history" />,
    },
    { id: "related", label: "Related records", content: <Timeline events={activity} /> },
  ]}
/>`;

const COMPOSITION_NOTES: ReactNode = (
  <Stack gap="sm">
    <CompositionNote>
      This is the drill-down counterpart to the Reservations List example: the identity header
      answers &ldquo;who am I looking at&rdquo; at a glance — Avatar, name, tier and presence
      Badges, and four Stats derived from the stay fixture by pure functions, so the numbers can
      never drift from the records below.
    </CompositionNote>
    <CompositionNote>
      The body is a single Tabs instance whose panels each compose differently: Overview pairs two
      DataLists in Cards, Stay history is a DataTable sorted newest-first with status Badges, and
      Related records sets an upcoming-reservations DataTable beside an activity Timeline. Arrow
      keys, Home, and End move between tabs per the WAI-ARIA tabs pattern.
    </CompositionNote>
    <CompositionNote>
      Every surface, border, and spacing value comes from Rialto tokens, so the page inherits light
      and dark themes with no per-page overrides — the guest name is the only level-2 heading, and
      each card title nests beneath it as a level-3 heading.
    </CompositionNote>
  </Stack>
);

/* ── Tab panels (static fixture composition) ─── */

const OVERVIEW_PANEL = (
  <div className={styles.panelGrid}>
    <Card variant="flat" title="Contact details">
      <DataList
        orientation="horizontal"
        items={[
          { label: "Email", value: GUEST.email },
          { label: "Phone", value: GUEST.phone },
          { label: "Address", value: GUEST.address },
          { label: "Language", value: GUEST.language },
        ]}
      />
    </Card>
    <Card variant="flat" title="Preferences">
      <DataList orientation="horizontal" items={GUEST.preferences} />
    </Card>
  </div>
);

const HISTORY_PANEL = (
  <Card variant="flat">
    <DataTable<GuestStay>
      columns={[
        { key: "id", header: "Reservation", rowHeader: true },
        { key: "room", header: "Room" },
        {
          key: "checkIn",
          header: "Check-in",
          render: (row: GuestStay) => STAY_DATE.format(new Date(row.checkIn)),
        },
        {
          key: "checkOut",
          header: "Check-out",
          render: (row: GuestStay) => STAY_DATE.format(new Date(row.checkOut)),
        },
        { key: "nights", header: "Nights", align: "right" as const },
        {
          key: "total",
          header: "Total",
          align: "right" as const,
          render: (row: GuestStay) => formatCurrency(row.total),
        },
        {
          key: "status",
          header: "Status",
          render: (row: GuestStay) => (
            <Badge variant={STAY_STATUS_META[row.status].variant} size="sm">
              {STAY_STATUS_META[row.status].label}
            </Badge>
          ),
        },
      ]}
      data={sortByMostRecent(PAST_STAYS)}
      rowKey={(row) => row.id}
      label="Stay history"
      striped
    />
  </Card>
);

const RELATED_PANEL = (
  <div className={styles.panelGrid}>
    <Card variant="flat" title="Upcoming reservations">
      <DataTable<UpcomingReservation>
        columns={[
          { key: "id", header: "Reservation", rowHeader: true },
          { key: "room", header: "Room" },
          { key: "checkIn", header: "Check-in" },
          { key: "nights", header: "Nights", align: "right" as const },
        ]}
        data={UPCOMING_RESERVATIONS}
        rowKey={(row) => row.id}
        label="Upcoming reservations"
      />
    </Card>
    <Card variant="flat" title="Recent activity">
      <Timeline events={ACTIVITY} compact />
    </Card>
  </div>
);

const TABS: Tab[] = [
  { id: "overview", label: "Overview", content: OVERVIEW_PANEL },
  { id: "history", label: "Stay history", content: HISTORY_PANEL },
  { id: "related", label: "Related records", content: RELATED_PANEL },
];

/* ── Page component ──────────────────────────── */

export function GuestDetailExamplePage() {
  return (
    <ExamplePageLayout
      name="Guest Profile"
      description="Single-record detail page: identity header with avatar, badges, and derived stats over a tabbed overview, stay history, and related records"
      sourceJsx={SOURCE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <Stack gap="lg">
        <Card>
          <div className={styles.identity}>
            <Avatar name={GUEST.name} size="xl" status="online" />
            <div className={styles.identityText}>
              <div className={styles.nameRow}>
                <Text variant="display" as="h2">
                  {GUEST.name}
                </Text>
                <Badge variant="accent">Gold Member</Badge>
                <Badge variant="success">Checked in</Badge>
              </div>
              <Text variant="caption" color="secondary">
                {GUEST.id} · Member since {GUEST.memberSince}
              </Text>
            </div>
          </div>
          <div className={styles.stats}>
            <Stat label="Total stays" value={PAST_STAYS.length} size="sm" />
            <Stat label="Nights stayed" value={totalNights(PAST_STAYS)} size="sm" />
            <Stat label="Lifetime spend" value={formatCurrency(lifetimeSpend(PAST_STAYS))} size="sm" />
            <Stat label="Loyalty points" value={GUEST.loyaltyPoints.toLocaleString("en-US")} size="sm" />
          </div>
        </Card>

        <Tabs tabs={TABS} defaultTab="overview" />
      </Stack>
    </ExamplePageLayout>
  );
}

GuestDetailExamplePage.displayName = "GuestDetailExamplePage";
