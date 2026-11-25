import { useEffect, useState } from "react";
import type { BookingWidgetApiClient } from "./PaymentStep.js";

/** What the venue says about the member link the guest arrived with (#9627). */
export type MemberStatus =
  { kind: "none" } | { kind: "member"; leadDays: number } | { kind: "invalid" };

const NONE: MemberStatus = { kind: "none" };

/**
 * Asks the venue whether the member link (already sent by `api` as `x-member-token`) is valid.
 * No link, or a failed call, is `none`: the guest sees the public widget untouched. A link the
 * venue refuses is `invalid`, whatever the reason, so the notice never says why.
 */
export function useMemberStatus(
  api: Pick<BookingWidgetApiClient, "publicVenue">,
  venueSlug: string | undefined,
  memberToken: string | undefined
): MemberStatus {
  const [status, setStatus] = useState<MemberStatus>(NONE);

  useEffect(() => {
    if (!memberToken || !venueSlug) return undefined;
    let cancelled = false;
    api.publicVenue.memberStatus(venueSlug).then(
      (result) => {
        if (!cancelled) {
          setStatus(
            result.member ? { kind: "member", leadDays: result.leadDays } : { kind: "invalid" }
          );
        }
      },
      () => {
        if (!cancelled) setStatus(NONE);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [api, venueSlug, memberToken]);

  return memberToken && venueSlug ? status : NONE;
}
