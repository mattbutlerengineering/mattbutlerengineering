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
  defaultDateRange,
  makeReservations,
  makeRooms,
} from "../../data/tapechart-fixtures";

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
    [rooms, startDate, endDate],
  );

  const selected = selectedId ? reservations.find((r) => r.id === selectedId) : null;

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
                  {selected.start} → {selected.end} · {selected.source} ·{" "}
                  {selected.status}
                </Text>
              </Stack>
            </Card>
          )}
        </Stack>
      </Section>

      <Section title="Responsive behavior">
        <Text>
          On desktop the component renders a traditional rack chart. On tablets the day-column width tightens
          based on pointer type (fine vs coarse). On mobile the grid is replaced by a stacked day-card view —
          every date becomes a card, reservations within are listed. At any breakpoint, switching to List View
          renders the same data as a date-grouped list, which is the canonical accessible representation.
        </Text>
      </Section>

      <Section title="Localization">
        <Text>
          Every piece of user-visible English lives in the <code>strings</code> prop with an English default,
          matching <code>ConfirmDialog</code>. Date formatting uses <code>Intl.DateTimeFormat</code> keyed on{" "}
          <code>locale</code> + optional <code>timeZone</code>. Currency uses <code>Intl.NumberFormat</code>.
          Plural forms are supplied as callbacks (<code>nightsLabel</code>, <code>partySizeLabel</code>) so
          consumers can plug ICU or MessageFormat without the library taking a dependency. RTL uses{" "}
          <code>useDirection()</code>, CSS logical properties, and <code>inset-inline-start</code> positioning.
        </Text>
      </Section>

      <Section title="Accessibility">
        <Text>
          The grid carries <code>role=&quot;grid&quot;</code>, each day header is a <code>columnheader</code>, each room
          is a <code>rowheader</code>. Reservation bars are <code>button</code> elements with rich{" "}
          <code>aria-label</code> values composed via a template callback. Today&apos;s column is marked{" "}
          <code>aria-current=&quot;date&quot;</code>. Focus uses the gold <code>--rialto-shadow-focus</code> ring. The
          list view is a first-class render path — not a fallback — and is the preferred mode for screen
          reader users.
        </Text>
      </Section>

      <Section title="Props">
        <PropsTable
          props={[
            { name: "reservations", type: "TapeChartReservation[]", default: "—", description: "Required. End-date is exclusive (checkout day)." },
            { name: "rooms", type: "TapeChartRoom[]", default: "—", description: "Required." },
            { name: "startDate", type: "string (ISO)", default: "—", description: "Inclusive." },
            { name: "endDate", type: "string (ISO)", default: "—", description: "Exclusive." },
            { name: "locale", type: "string", default: "navigator.language", description: "BCP-47 locale tag." },
            { name: "timeZone", type: "string", default: "runtime zone", description: "IANA time zone." },
            { name: "currency", type: "string", default: "USD", description: "ISO 4217 fallback." },
            { name: "density", type: '"compact" | "comfortable"', default: '"comfortable"', description: "Row height and padding scale." },
            { name: "viewMode", type: '"grid" | "list"', default: "(uncontrolled)", description: "Controlled view mode." },
            { name: "defaultViewMode", type: '"grid" | "list"', default: '"grid"', description: "Uncontrolled default." },
            { name: "onReservationClick", type: "(r) => void", default: "—", description: "Fired on click or Enter/Space on a bar." },
            { name: "onReservationMove", type: "(payload) => void | Promise", default: "—", description: "Opens move dialog (v2)." },
            { name: "checkConflict", type: "(payload) => Promise<bool|string>", default: "—", description: "Server-side conflict check." },
            { name: "selectedReservationId", type: "string | null", default: "null", description: "Highlighted reservation." },
            { name: "loading", type: "boolean", default: "false", description: "Shows skeleton or refresh banner." },
            { name: "error", type: "Error | null", default: "null", description: "Renders the error state." },
            { name: "strings", type: "TapeChartStrings", default: "English defaults", description: "All user-visible text + plural callbacks." },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}
