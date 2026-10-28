import { useRef, useEffect } from "react";
import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { EmptyState, Button, Text } from "@mattbutlerengineering/rialto";
import {
  BookingWidget,
  WidgetLocaleScope,
  hasOperatingHours,
} from "../components/booking-widget/index.js";
import { usePublicApiClient } from "../hooks/usePublicApiClient.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import styles from "./PublicBookingPage.module.css";
import { homeUrl } from "../lib/host-brand.js";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

// A guest arriving from an external link (email, social bio, QR code) has no
// browser history to go back to — window.history.back() on an empty stack
// lands them on about:blank. Fall back to a real, navigable link in that case.
//
// This must be a PUBLIC page. /hospitality is the authenticated staff dashboard
// (main.tsx routes its index through DashboardLayout), so sending a guest there
// swaps one dead end for an Auth0 login wall they have no account for. The
// serving host's root is the destination: the marketing site on
// mattbutlerengineering.com, the eat-sheet landing on eat-sheet.com (#7709),
// which serves nothing else. Derived from the host, never a fixed domain.
const FALLBACK_HOME_URL = homeUrl();

/** The guest's page locale is the widget's own (stored choice, else browser) — never the dashboard's. */
export function PublicBookingPage() {
  return (
    <WidgetLocaleScope>
      <PublicBookingPageContent />
    </WidgetLocaleScope>
  );
}

function PublicBookingPageContent() {
  const { t } = useTranslation();
  const { venueSlug } = useParams<{ venueSlug: string }>();
  // Guests resolve the venue through the unauthenticated by-slug read
  // (getBySlug -> /api/v1/venues/by-slug/:slug), the endpoint dedicated to
  // public booking URLs. It returns a curated PublicVenue projection —
  // including the id the booking widget needs for its venue-scoped calls —
  // which the deposit-only public config endpoint deliberately withholds
  // (#4022). The public client attaches no access token.
  const publicApiClient = usePublicApiClient({ baseUrl: BASE_URL, maxRetries: 0 });

  // Tracks the widget's currently-held (not yet confirmed) reservation slot,
  // updated via BookingWidget's onHoldChange — see the pagehide handler below.
  const activeHoldRef = useRef<{ holdId: string; sessionId: string | null } | null>(null);

  const {
    data: venue,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["publicVenueBySlug", venueSlug],
    queryFn: async () => {
      if (!venueSlug) throw new Error("No venue specified.");
      return publicApiClient.venues.getBySlug(venueSlug);
    },
    enabled: !!venueSlug,
    retry: false,
  });

  // Optional extra: a failed menus request just means no link, never a broken booking page.
  const { data: menus } = useQuery({
    queryKey: ["publicMenus", venueSlug],
    queryFn: () => publicApiClient.menus.listPublic(venueSlug as string),
    enabled: !!venueSlug,
    retry: false,
  });

  // The default title (venue still resolving, or a not-found slug) distinguishes this guest
  // surface from a staff-sounding "Dashboard" tab (#4973).
  useDocumentTitle(
    venue
      ? t("publicBooking.venueDocumentTitle", { venue: venue.name })
      : t("publicBooking.documentTitle")
  );

  // Release the active hold when the guest closes/navigates away before
  // confirming — a `pagehide` handler firing a `DELETE` (release is DELETE,
  // never POST — `sendBeacon` only sends POST, which is why the previous
  // implementation never actually released anything; see #4978).
  // `keepalive: true` lets the request outlive the unloading page, which is
  // why this is a raw `fetch` rather than `api.holds.releaseForVenue` —
  // @mbe/api-client has no keepalive seam. The URL is the slug-scoped public
  // route (#4487); the authenticated /api/v1/holds would 401 here.
  useEffect(() => {
    if (!venueSlug) return undefined;

    const handlePageHide = () => {
      const activeHold = activeHoldRef.current;
      if (!activeHold) return;
      fetch(`${BASE_URL}/public/v1/venues/${venueSlug}/holds/${activeHold.holdId}`, {
        method: "DELETE",
        keepalive: true,
        headers: activeHold.sessionId ? { "x-session-id": activeHold.sessionId } : undefined,
      });
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [venueSlug]);

  // Branded, deliberately generic not-found. The raw transport error carries
  // the internal endpoint path (e.g. "GET /api/v1/venues/by-slug/... failed: 404")
  // and must never be surfaced to the guest.
  const renderNotFound = () => {
    // An empty history stack (history.length <= 1) means the guest arrived
    // directly — history.back() would strand them on about:blank. Offer a
    // real navigable link instead of a JS-only back action in that case.
    const canGoBack = window.history.length > 1;
    return (
      <main className={styles.page}>
        <div className={styles.errorCenter}>
          <EmptyState
            variant="elevated"
            heading={t("publicBooking.notFoundHeading")}
            description={t("publicBooking.notFoundDescription")}
            action={
              canGoBack ? (
                <Button variant="primary" onClick={() => window.history.back()}>
                  {t("publicBooking.goBack")}
                </Button>
              ) : (
                <a className={styles.notFoundLink} href={FALLBACK_HOME_URL}>
                  {t("publicBooking.homeLink")}
                </a>
              )
            }
          />
        </div>
      </main>
    );
  };

  if (!venueSlug) return renderNotFound();

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingCenter}>
          <Text variant="body" color="secondary">
            {t("publicBooking.loading")}
          </Text>
        </div>
      </main>
    );
  }

  if (error || !venue) return renderNotFound();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Text variant="display" as="h1" align="center" color="primary">
          {venue.name}
        </Text>
        <Text variant="body" color="secondary" align="center">
          {t("publicBooking.tagline")}
        </Text>
        {menus && menus.length > 0 ? (
          <Text variant="body" align="center">
            <Link className={styles.menuLink} to={`/menu/${venueSlug}`}>
              {t("publicMenu.viewMenu")}
            </Link>
          </Text>
        ) : null}
      </header>

      <div className={styles.widgetWrapper}>
        <BookingWidget
          venueId={venue.id}
          venueSlug={venue.slug}
          apiBaseUrl={BASE_URL}
          hasOperatingHours={hasOperatingHours(venue.operatingHours)}
          maxPartySize={venue.settings?.maxPartySize}
          phone={venue.phone}
          venueTimezone={venue.ianaTimezone}
          onHoldChange={(info) => {
            activeHoldRef.current = info;
          }}
        />
      </div>

      <footer className={styles.footer}>
        <Text variant="caption" color="tertiary" align="center">
          {t("publicBooking.poweredBy")}
        </Text>
      </footer>
    </main>
  );
}
