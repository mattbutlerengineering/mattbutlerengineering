import { Stat } from "@mattbutlerengineering/rialto";

export interface KpiStatProps {
  label: string;
  /** `null` / `undefined` means "not known yet" — rendered as "—" and spoken as "unavailable". */
  value: number | string | null | undefined;
  size?: "sm" | "md" | "lg";
}

/**
 * A KPI that is honest about not knowing (ux.md decision (f)): while loading or after a failed
 * load it shows "—" and its accessible name becomes "<label>, unavailable". With a value it is
 * rialto's `Stat` untouched — the `aria-label` is only spread when nullish, because an explicit
 * `undefined` would erase `Stat`'s own label.
 */
export function KpiStat({ label, value, size = "sm" }: KpiStatProps) {
  const unavailable = value === null || value === undefined;
  return (
    <Stat
      label={label}
      value={unavailable ? "—" : value}
      size={size}
      {...(unavailable ? { "aria-label": `${label}, unavailable` } : {})}
    />
  );
}
