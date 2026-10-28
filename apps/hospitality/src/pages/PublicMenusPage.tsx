import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { EmptyState, Text } from "@mattbutlerengineering/rialto";
import { WidgetLocaleScope } from "../components/booking-widget/index.js";
import { usePublicApiClient } from "../hooks/usePublicApiClient.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import styles from "./PublicMenu.module.css";
import { homeUrl } from "../lib/host-brand.js";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

// Same public, guest-readable destination PublicBookingPage falls back to.
const FALLBACK_HOME_URL = homeUrl();

/** Guest-facing list of a venue's active menus. Login-free; locale is the guest's own. */
export function PublicMenusPage() {
  return (
    <WidgetLocaleScope>
      <PublicMenusPageContent />
    </WidgetLocaleScope>
  );
}

function PublicMenusPageContent() {
  const { t } = useTranslation();
  const { venueSlug } = useParams<{ venueSlug: string }>();
  const publicApiClient = usePublicApiClient({ baseUrl: BASE_URL, maxRetries: 0 });

  const venueQuery = useQuery({
    queryKey: ["publicVenueBySlug", venueSlug],
    queryFn: () => publicApiClient.venues.getBySlug(venueSlug as string),
    enabled: !!venueSlug,
    retry: false,
  });
  const menusQuery = useQuery({
    queryKey: ["publicMenus", venueSlug],
    queryFn: () => publicApiClient.menus.listPublic(venueSlug as string),
    enabled: !!venueSlug,
    retry: false,
  });

  const venue = venueQuery.data;
  useDocumentTitle(
    venue
      ? t("publicMenu.menusDocumentTitle", { venue: venue.name })
      : t("publicMenu.notFoundHeading")
  );

  if (!venueSlug || venueQuery.error || menusQuery.error) {
    // Generic on purpose: the raw transport error carries the internal endpoint path.
    return (
      <main className={styles.page}>
        <div className={styles.center}>
          <EmptyState
            variant="elevated"
            heading={t("publicMenu.notFoundHeading")}
            description={t("publicMenu.notFoundDescription")}
            action={
              <a className={styles.notFoundLink} href={FALLBACK_HOME_URL}>
                {t("publicBooking.homeLink")}
              </a>
            }
          />
        </div>
      </main>
    );
  }

  if (!venue || !menusQuery.data) {
    return (
      <main className={styles.page}>
        <div className={styles.center}>
          <Text variant="body" color="secondary">
            {t("publicMenu.loading")}
          </Text>
        </div>
      </main>
    );
  }

  const menus = [...menusQuery.data].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Text variant="display" as="h1" align="center" color="primary">
          {venue.name}
        </Text>
        <Text variant="body" color="secondary" align="center">
          {t("publicMenu.menusHeading")}
        </Text>
      </header>

      <div className={styles.content}>
        {menus.length === 0 ? (
          <EmptyState
            variant="elevated"
            heading={t("publicMenu.emptyHeading")}
            description={t("publicMenu.emptyDescription")}
          />
        ) : (
          <ul className={styles.menuList}>
            {menus.map((menu) => (
              <li key={menu.id}>
                <Link className={styles.menuLink} to={`/menu/${venueSlug}/${menu.slug}`}>
                  <Text variant="label" as="span" color="primary">
                    {menu.name}
                  </Text>
                  {menu.description ? (
                    <Text variant="body" as="p" color="secondary">
                      {menu.description}
                    </Text>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className={styles.footer}>
        <Text variant="caption" color="tertiary" align="center">
          {t("publicBooking.poweredBy")}
        </Text>
      </footer>
    </main>
  );
}
