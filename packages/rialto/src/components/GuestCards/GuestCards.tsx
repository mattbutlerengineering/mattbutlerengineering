import { forwardRef, type HTMLAttributes } from "react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { cn } from "../../utils/class-composer";
import { Badge } from "../Badge/Badge";
import { Tag } from "../Tag/Tag";
import { normalizeGuestRisk } from "../booking-vocabulary";
import styles from "./GuestCards.module.css";

/**
 * One guest in `GuestCards`. Contact details, notes and spend are not part of
 * the card and are never shown.
 *
 * @example
 * const guest: GuestCard = { name: "Maria Garcia", visits: 12, risk: "trusted", tags: ["VIP"] };
 */
export interface GuestCard {
  name: string;
  visits: number;
  /** Raw risk score (e.g. "trusted", "RISKY"). An unknown value shows as written, in neutral. */
  risk: string;
  /** The guest's tags. Empty or absent leaves the tags row out. */
  tags?: string[];
}

/**
 * Display-only stack of guest cards: the name in the display face, the
 * localized visit count and the risk word in its Badge tone on one line, then
 * the guest's tags in a wrapping row (left out when there are none). Cards are
 * separated by spacing, not boxes; nothing in it is focusable.
 *
 * @example
 * <GuestCards
 *   guests={[
 *     { name: "Maria Garcia", visits: 12, risk: "trusted", tags: ["VIP", "Regular"] },
 *     { name: "Tom Nguyen", visits: 1, risk: "standard" },
 *   ]}
 * />
 */
export interface GuestCardsProps extends HTMLAttributes<HTMLUListElement> {
  guests: GuestCard[];
}

export const GuestCards = forwardRef<HTMLUListElement, GuestCardsProps>(
  ({ guests, className, ...props }, ref) => {
    const { messages } = useRialtoLocale();

    return (
      <ul ref={ref} aria-label={messages.guests} className={cn(styles.list, className)} {...props}>
        {guests.map(({ name, visits, risk, tags = [] }, i) => {
          const { key, tone } = normalizeGuestRisk(risk);
          return (
            <li key={i} className={styles.card}>
              <p className={styles.name}>{name}</p>
              <p className={styles.meta}>
                <span>{messages.visitCount(visits)}</span>
                <span aria-hidden="true"> · </span>
                <Badge variant={tone} size="sm">
                  {key ? messages.guestRisk[key] : risk}
                </Badge>
              </p>
              {tags.length > 0 && (
                <ul className={styles.tags}>
                  {tags.map((tag, j) => (
                    <li key={j} className={styles.tag}>
                      <Tag>{tag}</Tag>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
);
GuestCards.displayName = "GuestCards";
