import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonGroup,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { Venue } from "@mbe/types";
import { PageHeader } from "../components/PageHeader";
import { BookingWidget } from "../components/booking-widget";
import { highlightEmbedCode } from "./highlight-embed-code.js";
import styles from "./BookingWidgetDemoPage.module.css";

/* ── Constants ─────────────────────────────── */

const DEVICE_SEGMENTS = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet" },
  { id: "mobile", label: "Mobile" },
] as const;

const DEVICE_WIDTHS: Record<string, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

const DEVICE_LABELS: Record<string, string> = {
  desktop: "Full width",
  tablet: "768px",
  mobile: "375px",
};

const COPY_FEEDBACK_DURATION_MS = 2000;

/* ── Feature data ──────────────────────────── */

interface Feature {
  title: string;
  description: string;
  colorClass: string;
  iconColorClass: string;
  badgeVariant: "accent" | "success" | "neutral";
  badgeLabel: string;
  svgPath: string;
}

const FEATURES: readonly Feature[] = [
  {
    title: "Real-time Availability",
    description: "Shows only available time slots based on current reservations and capacity.",
    colorClass: "featureIconAccent",
    iconColorClass: "featureIconColorAccent",
    badgeVariant: "accent",
    badgeLabel: "Core",
    svgPath:
      "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    title: "10-Minute Hold",
    description: "Selected times are held for 10 minutes while guests complete their booking.",
    colorClass: "featureIconSuccess",
    iconColorClass: "featureIconColorSuccess",
    badgeVariant: "success",
    badgeLabel: "Smart",
    svgPath:
      "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  },
  {
    title: "Instant Confirmation",
    description: "Guests receive immediate confirmation with their reservation details.",
    colorClass: "featureIconMixed",
    iconColorClass: "featureIconColorMixed",
    badgeVariant: "neutral",
    badgeLabel: "UX",
    svgPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
] as const;

/* ── Loading skeleton ──────────────────────── */

function BookingWidgetDemoSkeleton() {
  return (
    <div className={styles.container}>
      <PageHeader title="Booking Widget" description="Preview the embeddable booking widget" />
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
  const { accessToken } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceFrame, setDeviceFrame] = useState("desktop");
  const [copied, setCopied] = useState(false);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  // Fetch venues on mount
  useEffect(() => {
    async function fetchVenues() {
      try {
        const response = await api.venues.list({ limit: 50 });
        setVenues(response.data);
        if (response.data.length > 0) {
          setSelectedVenueId(response.data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load venues");
      } finally {
        setIsLoading(false);
      }
    }
    fetchVenues();
  }, [api]);

  const venueOptions = useMemo(() => venues.map((v) => ({ value: v.id, label: v.name })), [venues]);

  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === selectedVenueId) ?? null,
    [venues, selectedVenueId]
  );

  const embedCode = useMemo(() => {
    const venueIdValue = selectedVenueId ?? "YOUR_VENUE_ID";
    const maxParty = selectedVenue?.settings?.maxPartySize ?? 8;
    return `<!-- Add to your website -->
<div id="booking-widget"></div>
<script src="https://mattbutlerengineering.com/widget.js"></script>
<script>
  BookingWidget.init({
    container: '#booking-widget',
    venueId: '${venueIdValue}',
    // Optional customization
    maxPartySize: ${maxParty},
  });
</script>`;
  }, [selectedVenueId, selectedVenue]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    } catch {
      // Clipboard API not available - silently fail
    }
  }, [embedCode]);

  if (isLoading) {
    return <BookingWidgetDemoSkeleton />;
  }

  return (
    <div className={styles.container}>
      <PageHeader
        title="Booking Widget"
        description="Preview the embeddable booking widget. This is what guests see when making a reservation."
      />

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Venue selector */}
      <Card variant="flat" className={styles.venueSection}>
        <Stack gap="sm">
          <Text variant="label" color="primary">
            Select Venue
          </Text>
          {venueOptions.length > 0 ? (
            <Select
              label="Venue"
              options={venueOptions}
              value={selectedVenueId ?? ""}
              onChange={(value) => setSelectedVenueId(value)}
              placeholder="Choose a venue..."
            />
          ) : (
            <Alert variant="info">
              No venues found. Create a venue in the onboarding flow first.
            </Alert>
          )}
        </Stack>
      </Card>

      <Divider />

      {/* Widget preview */}
      <section>
        <Stack gap="md">
          <div className={styles.previewHeader}>
            <Text variant="label" color="primary">
              Widget Preview
            </Text>
            <SegmentedControl
              segments={[...DEVICE_SEGMENTS]}
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
                {selectedVenueId ? (
                  <BookingWidget venueId={selectedVenueId} />
                ) : (
                  <Alert variant="info">Select a venue above to preview the widget.</Alert>
                )}
              </div>
              <Text variant="caption" color="tertiary" className={styles.frameSizeLabel}>
                {DEVICE_LABELS[deviceFrame]}
              </Text>
            </div>
          </Card>
        </Stack>
      </section>

      <Divider />

      {/* Embed code */}
      <section>
        <Stack gap="md">
          <Text variant="label" color="primary">
            Embed Code
          </Text>

          <Card variant="flat" className={styles.codeCard}>
            <div className={styles.codeHeader}>
              <Text variant="caption" color="tertiary">
                HTML
              </Text>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <div className={styles.codeBlock}>
              <pre className={styles.codeBlockPre}>
                <code>{highlightEmbedCode(embedCode)}</code>
              </pre>
            </div>
          </Card>

          <Text variant="caption" color="secondary">
            The widget can be embedded on any website. Styles are self-contained and will not
            conflict with your existing CSS.
          </Text>
        </Stack>
      </section>

      <Divider />

      {/* Features */}
      <section>
        <Stack gap="md">
          <Text variant="label" color="primary">
            Widget Features
          </Text>
          <div className={styles.featuresGrid}>
            {FEATURES.map((feature) => (
              <Card key={feature.title} variant="flat" className={styles.featureCard}>
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
                      {feature.badgeLabel}
                    </Badge>
                  </div>
                  <Text variant="body" color="primary" className={styles.featureTitle}>
                    {feature.title}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {feature.description}
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
