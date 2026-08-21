import { useMemo, useState } from "react";
import {
  Card,
  SegmentedControl,
  Stack,
  TapeChart,
  Text,
  type TapeChartReservation,
  type TapeChartViewMode,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import {
  classifyDormAsShared,
  defaultDateRange,
  makeOverlapScenario,
  makeReservations,
  makeRooms,
} from "../../data/tapechart-fixtures";

const OVERLAP_CLASSIFIER_SAMPLE = `const roomsById = new Map(rooms.map((r) => [r.id, r]));
const classifyOverlap = (a, b) =>
  roomsById.get(a.roomId)?.category === "Dorm" ? "shared" : "conflict";

<TapeChart rooms={rooms} reservations={reservations} classifyOverlap={classifyOverlap} />`;

/** Mirrors the dorm rule for the selection card: what the classified chart says about this bar. */
function describeOverlap(
  selected: TapeChartReservation,
  rooms: { id: string; category?: string }[],
  reservations: TapeChartReservation[]
): string {
  if (rooms.find((r) => r.id === selected.roomId)?.category === "Dorm") return "Shared occupancy";
  const hasSibling = reservations.some(
    (r) =>
      r.id !== selected.id &&
      r.roomId === selected.roomId &&
      r.start < selected.end &&
      selected.start < r.end
  );
  return hasSibling ? "Double-booked" : "—";
}

type DemoLocale = "en-US" | "ja-JP" | "de-DE" | "ar-SA";
type DemoDensity = "comfortable" | "compact";

const LOCALE_LABELS: Record<DemoLocale, string> = {
  "en-US": "English",
  "ja-JP": "日本語",
  "de-DE": "Deutsch",
  "ar-SA": "العربية",
};

export function TapeChartPage() {
  const [locale, setLocale] = useState<DemoLocale>("en-US");
  const [density, setDensity] = useState<DemoDensity>("comfortable");
  const [viewMode, setViewMode] = useState<TapeChartViewMode>("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { startDate, endDate } = useMemo(() => defaultDateRange(), []);
  const rooms = useMemo(() => makeRooms(24), []);
  const reservations = useMemo(
    () => makeReservations(rooms, startDate, endDate, 0.55),
    [rooms, startDate, endDate]
  );

  const selected = selectedId ? reservations.find((r) => r.id === selectedId) : null;

  // Overlaps section — pinned to en-US / comfortable / LTR so the two charts stay comparable.
  const overlap = useMemo(() => makeOverlapScenario(), []);
  const overlapClassifier = useMemo(() => classifyDormAsShared(overlap.rooms), [overlap.rooms]);
  const overlapSelected = selectedId ? overlap.reservations.find((r) => r.id === selectedId) : null;

  const localizedStrings = useMemo(() => {
    // Minimal locale-scoped overrides; English defaults still cover everything
    if (locale === "ja-JP") {
      return {
        regionLabel: "予約テープチャート",
        roomsColumnLabel: "部屋",
        arrivalsLabel: "到着",
        departuresLabel: "出発",
        inHouseLabel: "滞在中",
        viewModeGridLabel: "グリッド",
        viewModeListLabel: "リスト",
        todayLabel: "本日",
        nightsLabel: (n: number) => `${n}泊`,
        partySizeLabel: (n: number) => `${n}名`,
      };
    }
    if (locale === "de-DE") {
      return {
        regionLabel: "Reservierungsbandplan",
        roomsColumnLabel: "Zimmer",
        arrivalsLabel: "Anreisen",
        departuresLabel: "Abreisen",
        inHouseLabel: "Im Haus",
        viewModeGridLabel: "Raster",
        viewModeListLabel: "Liste",
        todayLabel: "Heute",
        nightsLabel: (n: number) => (n === 1 ? "1 Nacht" : `${n} Nächte`),
        partySizeLabel: (n: number) => (n === 1 ? "1 Gast" : `${n} Gäste`),
      };
    }
    if (locale === "ar-SA") {
      return {
        regionLabel: "مخطط الحجوزات",
        roomsColumnLabel: "الغرف",
        arrivalsLabel: "الوصول",
        departuresLabel: "المغادرة",
        inHouseLabel: "داخل الفندق",
        viewModeGridLabel: "شبكة",
        viewModeListLabel: "قائمة",
        todayLabel: "اليوم",
        nightsLabel: (n: number) => (n === 1 ? "ليلة واحدة" : `${n} ليالٍ`),
        partySizeLabel: (n: number) => (n === 1 ? "ضيف واحد" : `${n} ضيوف`),
      };
    }
    return undefined;
  }, [locale]);

  const dir = locale === "ar-SA" ? "rtl" : "ltr";

  const handleReservationClick = (r: TapeChartReservation) => {
    setSelectedId(r.id);
  };

  return (
    <ComponentPageLayout
      name="Tape Chart"
      description="Hotel-style rack chart — rooms × days × reservation bars. Localization-first, RTL-safe, with a grid view for desktop, a day-stacked card view for mobile, and a fully accessible list view at any size."
    >
      <Section title="Interactive playground">
        <Stack gap="md">
          <Stack gap="sm" direction="row" wrap align="center">
            <Stack gap="2xs" direction="row" align="center">
              <Text variant="caption" color="secondary">
                Locale
              </Text>
              <SegmentedControl
                segments={Object.entries(LOCALE_LABELS).map(([id, label]) => ({ id, label }))}
                value={locale}
                onChange={(id) => setLocale(id as DemoLocale)}
                size="sm"
              />
            </Stack>
            <Stack gap="2xs" direction="row" align="center">
              <Text variant="caption" color="secondary">
                Density
              </Text>
              <SegmentedControl
                segments={[
                  { id: "comfortable", label: "Comfortable" },
                  { id: "compact", label: "Compact" },
                ]}
                value={density}
                onChange={(id) => setDensity(id as DemoDensity)}
                size="sm"
              />
            </Stack>
          </Stack>

          <div dir={dir}>
            <Card variant="flat">
              <TapeChart
                reservations={reservations}
                rooms={rooms}
                startDate={startDate}
                endDate={endDate}
                locale={locale}
                currency="USD"
                density={density}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onReservationClick={handleReservationClick}
                selectedReservationId={selectedId}
                strings={localizedStrings}
              />
            </Card>
          </div>

          {selected && (
            <Card variant="elevated">
              <Stack gap="xs">
                <Text variant="label">
                  {selected.guestName ?? "Reservation"} ·{" "}
                  {rooms.find((r) => r.id === selected.roomId)?.name}
                </Text>
                <Text variant="caption" color="secondary">
                  {selected.start} → {selected.end} · {selected.source} · {selected.status}
                </Text>
              </Stack>
            </Card>
          )}
        </Stack>
      </Section>

      <Section title="Overlaps">
        <Stack gap="md">
          <Text>
            Two reservations on one room can overlap. The grid never hides one behind the other —
            each gets its own lane and the row grows to fit. By default every overlap is treated as
            a double-booking and drawn in the error family. Pass <code>classifyOverlap</code> to
            tell the chart which overlaps are legitimate in your domain; those simply stack.
          </Text>

          <Text variant="label">Default — every overlap is a conflict</Text>
          <Card variant="flat" data-testid="tape-chart-overlaps-default">
            <TapeChart
              rooms={overlap.rooms}
              reservations={overlap.reservations}
              startDate={overlap.startDate}
              endDate={overlap.endDate}
              locale="en-US"
              currency="USD"
              density="comfortable"
              viewMode="grid"
              onReservationClick={handleReservationClick}
              selectedReservationId={selectedId}
            />
          </Card>

          <Card variant="flat">
            <pre
              style={{
                margin: 0,
                fontFamily: "var(--rialto-font-mono)",
                fontSize: "var(--rialto-text-xs)",
                overflowX: "auto",
              }}
            >
              {OVERLAP_CLASSIFIER_SAMPLE}
            </pre>
          </Card>

          <Text variant="label">
            With <code>classifyOverlap</code> — dorm bunks share, private rooms conflict
          </Text>
          <Card variant="flat" data-testid="tape-chart-overlaps-classified">
            <TapeChart
              rooms={overlap.rooms}
              reservations={overlap.reservations}
              startDate={overlap.startDate}
              endDate={overlap.endDate}
              locale="en-US"
              currency="USD"
              density="comfortable"
              viewMode="grid"
              onReservationClick={handleReservationClick}
              selectedReservationId={selectedId}
              classifyOverlap={overlapClassifier}
            />
          </Card>

          {overlapSelected && (
            <Card variant="elevated" data-testid="tape-chart-overlaps-selection">
              <Stack gap="xs">
                <Text variant="label">
                  {overlapSelected.guestName ?? "Reservation"} ·{" "}
                  {overlap.rooms.find((r) => r.id === overlapSelected.roomId)?.name}
                </Text>
                <Text variant="caption" color="secondary">
                  {overlapSelected.start} → {overlapSelected.end} ·{" "}
                  {describeOverlap(overlapSelected, overlap.rooms, overlap.reservations)}
                </Text>
              </Stack>
            </Card>
          )}
        </Stack>
      </Section>

      <Section title="Responsive behavior">
        <Text>
          On desktop the component renders a traditional rack chart. On tablets the day-column width
          tightens based on pointer type (fine vs coarse). On mobile the grid is replaced by a
          stacked day-card view — every date becomes a card, reservations within are listed. At any
          breakpoint, switching to List View renders the same data as a date-grouped list, which is
          the canonical accessible representation.
        </Text>
      </Section>

      <Section title="Localization">
        <Text>
          Every piece of user-visible English lives in the <code>strings</code> prop with an English
          default, matching <code>ConfirmDialog</code>. Date formatting uses{" "}
          <code>Intl.DateTimeFormat</code> keyed on <code>locale</code> + optional{" "}
          <code>timeZone</code>. Currency uses <code>Intl.NumberFormat</code>. Plural forms are
          supplied as callbacks (<code>nightsLabel</code>, <code>partySizeLabel</code>) so consumers
          can plug ICU or MessageFormat without the library taking a dependency. RTL uses{" "}
          <code>useDirection()</code>, CSS logical properties, and <code>inset-inline-start</code>{" "}
          positioning.
        </Text>
      </Section>

      <Section title="Accessibility">
        <Text>
          The grid carries <code>role=&quot;grid&quot;</code>, each day header is a{" "}
          <code>columnheader</code>, each room is a <code>rowheader</code>. Reservation bars are{" "}
          <code>button</code> elements with rich <code>aria-label</code> values composed via a
          template callback. Today&apos;s column is marked{" "}
          <code>aria-current=&quot;date&quot;</code>. Focus uses the gold{" "}
          <code>--rialto-shadow-focus</code> ring. The list view is a first-class render path — not
          a fallback — and is the preferred mode for screen reader users.
        </Text>
      </Section>

      <Section title="Props">
        <PropsTable component="TapeChart" />
      </Section>
    </ComponentPageLayout>
  );
}
