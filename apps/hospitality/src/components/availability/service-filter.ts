import type { AvailabilityConfig, AvailabilityDaySummary } from "@mbe/types";

/** One service the calendar can be narrowed to (ux.md F2 step 1: the Services filter). */
export interface ServiceFilter {
  readonly id: string;
  readonly name: string;
}

/**
 * The services the filter offers, in the venue's order. A venue with fewer than two active
 * services has nothing to narrow to, so the control is not shown (empty list).
 */
export function filterableServices(config: AvailabilityConfig): readonly ServiceFilter[] {
  const active = [...config.venueServices.filter((s) => !s.archivedAt)]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ id: s.id, name: s.name }));
  return active.length >= 2 ? active : [];
}

/** The chosen service, or `null` for "All": also when that service is gone from the venue. */
export function resolveServiceFilter(
  services: readonly ServiceFilter[],
  chosenId: string | null
): ServiceFilter | null {
  return services.find((s) => s.id === chosenId) ?? null;
}

/**
 * One day as it reads for a single service: that service's line, a count of one (or none, when it
 * does not run that day) and only the closures that touch its hours. A closure counts when its
 * window overlaps the service's open-to-close window, so a 10–11 PM closure belongs to Dinner and
 * not Lunch, and a whole-day closure belongs to both. Online/phone/waitlist availability is the
 * day's own and does not change. A day from an older API, which sends no service lines, is returned as it is.
 */
export function filterDaySummary(
  summary: AvailabilityDaySummary,
  serviceId: string
): AvailabilityDaySummary {
  if (summary.services === undefined) return summary;
  const services = summary.services.filter((s) => s.venueServiceId === serviceId);
  const closures = summary.closures.filter((c) =>
    services.some((s) => c.from < s.closesAt && c.to > s.opensAt)
  );
  return { ...summary, services, serviceCount: services.length, closures };
}

/** Every day as it reads for `service`; the same list, untouched, when there is no filter. */
export function filterDays(
  days: readonly AvailabilityDaySummary[] | undefined,
  service: ServiceFilter | null
): readonly AvailabilityDaySummary[] | undefined {
  if (!days || !service) return days;
  return days.map((d) => filterDaySummary(d, service.id));
}
