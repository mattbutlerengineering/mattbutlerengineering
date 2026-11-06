import { useTranslation } from "react-i18next";
import { Select } from "@mattbutlerengineering/rialto";
import type { ServiceFilter } from "./service-filter.js";
import styles from "./ServicesFilterSelect.module.css";

/** The filter's "no filter" option; a service id never takes this shape. */
const ALL_SERVICES = "all";

export interface ServicesFilterSelectProps {
  /** The services on offer; the control is not rendered for fewer than two. */
  readonly services: readonly ServiceFilter[];
  /** The service the calendar reads for, or `null` for all. */
  readonly value: string | null;
  readonly onChange: (id: string | null) => void;
}

/** ux.md F2: "All services" or one service, for a venue with 2+ services. */
export function ServicesFilterSelect(props: ServicesFilterSelectProps) {
  const { services, value, onChange } = props;
  const { t } = useTranslation();
  if (services.length < 2) return null;
  return (
    <div className={styles.filter}>
      <Select
        aria-label={t("availability.toolbar.servicesFilter")}
        value={value ?? ALL_SERVICES}
        options={[
          { value: ALL_SERVICES, label: t("availability.toolbar.allServices") },
          ...services.map((s) => ({ value: s.id, label: s.name })),
        ]}
        onChange={(id) => onChange(id === ALL_SERVICES ? null : id)}
      />
    </div>
  );
}
