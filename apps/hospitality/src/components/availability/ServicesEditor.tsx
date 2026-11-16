import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Select, Stack } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, Seating, VenueService } from "@mbe/types";
import { usualHours, type DraftService } from "./draft-changes.js";
import { applyFieldsToService, serviceFieldsOf } from "./draft-service-fields.js";
import { ServiceFields } from "./service-fields/ServiceFields.js";
import styles from "./ServicesEditor.module.css";

const NEW_SERVICE = "__new__";
/** Hours a service new to the venue starts with; the Manager adjusts them. */
const NEW_SERVICE_HOURS = {
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1320,
  seating: { version: 1, interval: 15 } as Seating,
  bookingTypes: ["online", "phone"] as DraftService["bookingTypes"],
};

export interface ServicesEditorProps {
  readonly services: readonly DraftService[];
  /** The venue's config: its services, so one it has had before can be added back at its hours. */
  readonly config: AvailabilityConfig;
  /** The date being looked at, for the "next day" hint. Omit it where the hours span many dates. */
  readonly date?: string;
  /** Offer "New service…" (default). Off where only the venue's existing services can be saved. */
  readonly allowNew?: boolean;
  readonly onChange: (services: DraftService[]) => void;
}

/** One service: its name (a new one), the shared service fields, and Remove. */
function ServiceRow(props: {
  readonly service: DraftService;
  readonly date: string | undefined;
  readonly idScope: string;
  readonly onChange: (service: DraftService) => void;
  readonly onRemove: () => void;
}) {
  const { service, date, idScope, onChange, onRemove } = props;
  const { t } = useTranslation();
  const name = service.name.trim() || t("availability.editor.newServiceName");

  return (
    <fieldset className={styles.row}>
      <legend className={styles.legend}>{name}</legend>
      {service.venueServiceId === null && (
        <Input
          label={t("availability.editor.serviceName")}
          value={service.name}
          maxLength={40}
          required
          onChange={(e) => onChange({ ...service, name: e.target.value })}
        />
      )}
      <ServiceFields
        value={serviceFieldsOf(service)}
        onChange={(next) => onChange(applyFieldsToService(service, next))}
        idScope={idScope}
        date={date}
      />
      <Button variant="ghost" size="sm" onClick={onRemove}>
        {t("availability.editor.remove", { name })}
      </Button>
    </fieldset>
  );
}

/** The venue's services this draft does not run yet. */
function addableServices(
  services: readonly DraftService[],
  venueServices: readonly VenueService[]
): readonly VenueService[] {
  const used = new Set(services.map((s) => s.venueServiceId));
  return venueServices.filter((v) => !v.archivedAt && !used.has(v.id));
}

/** A row for one of the venue's services, at the hours it usually runs, or for a new one to name. */
function serviceRow(
  services: readonly DraftService[],
  config: AvailabilityConfig,
  id: string
): DraftService {
  const existing = config.venueServices.find((v) => v.id === id);
  const created = id === NEW_SERVICE || !existing;
  return {
    ...NEW_SERVICE_HOURS,
    ...(created ? undefined : usualHours(config, id)),
    key: created ? `new-${services.length}-${Date.now()}` : id,
    venueServiceId: created ? null : id,
    scheduleServiceId: null,
    name: created ? "" : (existing?.name ?? ""),
  };
}

/** "+ Add service" with nothing chosen yet: the first service the venue has spare, else a new one. */
export function nextServiceRow(
  services: readonly DraftService[],
  config: AvailabilityConfig
): DraftService {
  const [first] = addableServices(services, config.venueServices);
  return serviceRow(services, config, first?.id ?? NEW_SERVICE);
}

/** The list around the shared service fields: one row per service, plus add and remove. */
export function ServicesEditor(props: ServicesEditorProps) {
  const { services, config, date, onChange } = props;
  const { t } = useTranslation();
  const idScope = useId();

  const addable = addableServices(services, config.venueServices);
  const add = (id: string) => onChange([...services, serviceRow(services, config, id)]);

  return (
    <Stack gap="md">
      {services.map((service) => (
        <ServiceRow
          key={service.key}
          service={service}
          date={date}
          idScope={`${idScope}-${service.key}`}
          onChange={(next) => onChange(services.map((s) => (s.key === service.key ? next : s)))}
          onRemove={() => onChange(services.filter((s) => s.key !== service.key))}
        />
      ))}
      <Select
        aria-label={t("availability.editor.addService")}
        placeholder={t("availability.editor.addServicePlaceholder")}
        value=""
        options={[
          ...addable.map((v) => ({ value: v.id, label: v.name })),
          ...(props.allowNew === false
            ? []
            : [{ value: NEW_SERVICE, label: t("availability.editor.newService") }]),
        ]}
        onChange={add}
      />
    </Stack>
  );
}
