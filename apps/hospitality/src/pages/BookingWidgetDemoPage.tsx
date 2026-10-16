import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Alert,
  Badge,
  Banner,
  Card,
  Divider,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonGroup,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { describeApiError } from "../lib/describe-api-error.js";
import { BookingWidget, WidgetLocaleScope, hasOperatingHours } from "../components/booking-widget";
import { useVenues } from "../hooks/useVenues.js";
import { highlightEmbedCode } from "./highlight-embed-code.js";
import styles from "./BookingWidgetDemoPage.module.css";

/* ── Constants ─────────────────────────────── */

const deviceSegments = (t: TFunction) => [
  { id: "desktop", label: t("widgetDemo.device.desktop") },
  { id: "tablet", label: t("widgetDemo.device.tablet") },
  { id: "mobile", label: t("widgetDemo.device.mobile") },
];

const DEVICE_WIDTHS: Record<string, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

const deviceLabel = (t: TFunction, frame: string): string =>
  frame === "desktop" ? t("widgetDemo.device.fullWidth") : (DEVICE_WIDTHS[frame] ?? "");

/* ── Feature data ──────────────────────────── */

interface Feature {
  id: "availability" | "hold" | "confirmation";
  colorClass: string;
  iconColorClass: string;
  badgeVariant: "accent" | "success" | "neutral";
  svgPath: string;
}

const FEATURES: readonly Feature[] = [
  {
    id: "availability",
    colorClass: "featureIconAccent",
    iconColorClass: "featureIconColorAccent",
    badgeVariant: "accent",
    svgPath:
      "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    id: "hold",
    colorClass: "featureIconSuccess",
    iconColorClass: "featureIconColorSuccess",
    badgeVariant: "success",
    svgPath:
      "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  },
  {
    id: "confirmation",
    colorClass: "featureIconMixed",
    iconColorClass: "featureIconColorMixed",
    badgeVariant: "neutral",
    svgPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
] as const;

/* ── Loading skeleton ──────────────────────── */

function BookingWidgetDemoSkeleton() {
  const { t } = useTranslation();
  return (
    <div className={styles.container}>
      <PageHeader title={t("widgetDemo.title")} description={t("widgetDemo.loading")} />
      <SkeletonGroup>
        <Skeleton variant="card" width="100%" height={80} />
        <Skeleton variant="card" width="100%" height={400} />
        <Skeleton variant="card" width="100%" height={200} />
      </SkeletonGroup>
    </div>
  );
}

/* ── Main component ────────────────────────── */

export function BookingWidgetDemoPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: venues = [], isLoading, error, refetch } = useVenues({ limit: 50 });
  const loadFailure = error ? describeApiError(error) : null;
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [deviceFrame, setDeviceFrame] = useState("desktop");

  // Auto-select first venue when venues load
  const firstVenueId = venues[0]?.id ?? null;
  const effectiveVenueId = selectedVenueId ?? firstVenueId;

  const venueOptions = useMemo(() => venues.map((v) => ({ value: v.id, label: v.name })), [venues]);

  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === effectiveVenueId) ?? null,
    [venues, effectiveVenueId]
  );

  const handleSetHours = useCallback(() => navigate("/setup/hours"), [navigate]);

  const embedCode = useMemo(() => {
    const venueIdValue = effectiveVenueId ?? "YOUR_VENUE_ID";
    const maxParty = selectedVenue?.settings?.maxPartySize ?? 8;
    return `<!-- embeddable widget — coming soon -->
<!-- When available, add it to your website like this: -->
<div id="booking-widget"></div>
<script>
  BookingWidget.init({
    container: '#booking-widget',
    venueId: '${venueIdValue}',
    // Optional customization
    maxPartySize: ${maxParty},
  });
</script>`;
  }, [effectiveVenueId, selectedVenue]);

  if (isLoading) {
    return <BookingWidgetDemoSkeleton />;
  }

  return (
    <div className={styles.container}>
      <PageHeader title={t("widgetDemo.title")} description={t("widgetDemo.description")} />

      <Banner
        variant="accent"
        action={
          <Badge variant="accent" size="sm">
            {t("widgetDemo.comingSoon")}
          </Badge>
        }
      >
        {t("widgetDemo.banner")}
      </Banner>

      {loadFailure && (
        <ErrorRetryBanner
          title={t("widgetDemo.loadError")}
          error={loadFailure.detail}
          details={loadFailure.raw}
          onRetry={refetch}
        />
      )}

      {/* Venue selector */}
      <Card variant="flat" className={styles.venueSection}>
        <Stack gap="sm">
          <Text variant="label" color="primary">
            {t("widgetDemo.selectVenue")}
          </Text>
          {venueOptions.length > 0 ? (
            <Select
              label={t("widgetDemo.venue")}
              options={venueOptions}
              value={effectiveVenueId ?? ""}
              onChange={(value) => setSelectedVenueId(value)}
              placeholder={t("widgetDemo.venuePlaceholder")}
            />
          ) : (
            <Alert variant="info">{t("widgetDemo.noVenues")}</Alert>
          )}
        </Stack>
      </Card>

      <Divider />

      {/* Widget preview */}
      <section>
        <Stack gap="md">
          <div className={styles.previewHeader}>
            <div className={styles.sectionHeading}>
              <Text variant="label" color="primary">
                {t("widgetDemo.preview.title")}
              </Text>
              <Badge variant="accent" size="sm">
                {t("widgetDemo.preview.badge")}
              </Badge>
            </div>
            <SegmentedControl
              segments={deviceSegments(t)}
              value={deviceFrame}
              onChange={setDeviceFrame}
              size="sm"
            />
          </div>

          <Card variant="flat" className={styles.previewCard}>
            <div className={styles.deviceFrameWrapper}>
              <div
                className={styles.deviceFrame}
                style={{ maxInlineSize: DEVICE_WIDTHS[deviceFrame] }}
              >
                {effectiveVenueId ? (
                  <WidgetLocaleScope followDashboardOnce>
                    <BookingWidget
                      venueId={effectiveVenueId}
                      // The preview holds real slots through the public,
                      // slug-scoped route (#4487) — without the slug it could
                      // browse but never hold.
                      venueSlug={selectedVenue?.slug}
                      audience="staff"
                      hasOperatingHours={hasOperatingHours(selectedVenue?.operatingHours)}
                      venueTimezone={selectedVenue?.ianaTimezone}
                      onSetHours={handleSetHours}
                    />
                  </WidgetLocaleScope>
                ) : (
                  <Alert variant="info">{t("widgetDemo.preview.selectVenue")}</Alert>
                )}
              </div>
              <Text variant="caption" color="tertiary" className={styles.frameSizeLabel}>
                {deviceLabel(t, deviceFrame)}
              </Text>
            </div>
          </Card>
          <Text variant="caption" color="secondary">
            {t("widgetDemo.preview.note")}
          </Text>
        </Stack>
      </section>

      <Divider />

      {/* Embed code */}
      <section>
        <Stack gap="md">
          <div className={styles.sectionHeading}>
            <Text variant="label" color="primary">
              {t("widgetDemo.embed.title")}
            </Text>
            <Badge variant="accent" size="sm">
              {t("widgetDemo.comingSoon")}
            </Badge>
          </div>

          <Card variant="flat" className={styles.codeCard} data-testid="embed-coming-soon">
            <Stack gap="md">
              <Alert variant="info">{t("widgetDemo.embed.alert")}</Alert>
              <div className={styles.codeHeader}>
                <Text variant="caption" color="tertiary">
                  {t("widgetDemo.embed.example")}
                </Text>
              </div>
              <div className={styles.codeBlock}>
                <pre className={styles.codeBlockPre}>
                  <code>{highlightEmbedCode(embedCode)}</code>
                </pre>
              </div>
            </Stack>
          </Card>

          <Text variant="caption" color="secondary">
            {t("widgetDemo.embed.note")}
          </Text>
        </Stack>
      </section>

      <Divider />

      {/* Features */}
      <section>
        <Stack gap="md">
          <Text variant="label" color="primary">
            {t("widgetDemo.features.title")}
          </Text>
          <div className={styles.featuresGrid}>
            {FEATURES.map((feature) => (
              <Card key={feature.id} variant="flat" className={styles.featureCard}>
                <Stack gap="sm">
                  <div className={styles.featureTop}>
                    <div className={`${styles.featureIconWrapper} ${styles[feature.colorClass]}`}>
                      <svg
                        className={`${styles.featureIcon} ${styles[feature.iconColorClass]}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={feature.svgPath}
                        />
                      </svg>
                    </div>
                    <Badge variant={feature.badgeVariant} size="sm">
                      {t(`widgetDemo.features.${feature.id}.badge`)}
                    </Badge>
                  </div>
                  <Text variant="body" color="primary" className={styles.featureTitle}>
                    {t(`widgetDemo.features.${feature.id}.title`)}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {t(`widgetDemo.features.${feature.id}.description`)}
                  </Text>
                </Stack>
              </Card>
            ))}
          </div>
        </Stack>
      </section>
    </div>
  );
}
