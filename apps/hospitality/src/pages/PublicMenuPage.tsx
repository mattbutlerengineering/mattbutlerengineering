import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { EmptyState, Text } from "@mattbutlerengineering/rialto";
import { WidgetLocaleScope } from "../components/booking-widget/index.js";
import { usePublicApiClient } from "../hooks/usePublicApiClient.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { formatCurrencyFromCents } from "../utils/format.js";
import styles from "./PublicMenu.module.css";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

/** Guest-facing single menu: sections in order, items with description and price. */
export function PublicMenuPage() {
  return (
    <WidgetLocaleScope>
      <PublicMenuPageContent />
    </WidgetLocaleScope>
  );
}

function PublicMenuPageContent() {
  const { t, i18n } = useTranslation();
  const { venueSlug, menuSlug } = useParams<{ venueSlug: string; menuSlug: string }>();
  const publicApiClient = usePublicApiClient({ baseUrl: BASE_URL, maxRetries: 0 });

  const venueQuery = useQuery({
    queryKey: ["publicVenueBySlug", venueSlug],
    queryFn: () => publicApiClient.venues.getBySlug(venueSlug as string),
    enabled: !!venueSlug,
    retry: false,
  });
  const menuQuery = useQuery({
    queryKey: ["publicMenu", venueSlug, menuSlug],
    queryFn: () => publicApiClient.menus.getPublic(venueSlug as string, menuSlug as string),
    enabled: !!venueSlug && !!menuSlug,
    retry: false,
  });

  const venue = venueQuery.data;
  const menu = menuQuery.data;
  useDocumentTitle(
    venue && menu
      ? t("publicMenu.menuDocumentTitle", { menu: menu.name, venue: venue.name })
      : t("publicMenu.notFoundHeading")
  );

  if (!venueSlug || !menuSlug || venueQuery.error || menuQuery.error) {
    // Generic on purpose: the raw transport error carries the internal endpoint path.
    return (
      <main className={styles.page}>
        <div className={styles.center}>
          <EmptyState
            variant="elevated"
            headingLevel={1}
            heading={t("publicMenu.notFoundHeading")}
            description={t("publicMenu.notFoundDescription")}
            action={
              venueSlug ? (
                <Link className={styles.notFoundLink} to={`/menu/${venueSlug}`}>
                  {t("publicMenu.backToMenus")}
                </Link>
              ) : undefined
            }
          />
        </div>
      </main>
    );
  }

  if (!venue || !menu) {
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

  const sections = [...menu.sections].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Text variant="display" as="h1" align="center" color="primary">
          {menu.name}
        </Text>
        <Text variant="body" color="secondary" align="center">
          {venue.name}
        </Text>
        {menu.description ? (
          <Text variant="body" color="secondary" align="center">
            {menu.description}
          </Text>
        ) : null}
      </header>

      <div className={styles.content}>
        {sections.map((section) => (
          <section key={section.id} className={styles.section} aria-labelledby={`s-${section.id}`}>
            <Text variant="label" as="h2" color="primary" id={`s-${section.id}`}>
              {section.name}
            </Text>
            <ul className={styles.itemList}>
              {[...section.items]
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((item) => (
                  <li
                    key={item.id}
                    className={`${styles.item} ${item.status === "SOLD_OUT" ? styles.itemSoldOut : ""}`}
                  >
                    <div className={styles.itemText}>
                      <Text variant="body" as="span" color="primary">
                        {item.name}
                      </Text>
                      {item.description ? (
                        <Text variant="caption" as="span" color="secondary">
                          {item.description}
                        </Text>
                      ) : null}
                      {item.status === "SOLD_OUT" ? (
                        <Text
                          variant="caption"
                          as="span"
                          color="on-accent"
                          className={styles.soldOut}
                        >
                          {t("publicMenu.soldOut")}
                        </Text>
                      ) : null}
                    </div>
                    <Text variant="body" as="span" color="primary" className={styles.price}>
                      {formatCurrencyFromCents(item.priceCents, menu.currencyCode, i18n.language)}
                    </Text>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className={styles.footer}>
        <Text variant="caption" color="tertiary" align="center">
          {t("publicBooking.poweredBy")}
        </Text>
      </footer>
    </main>
  );
}
