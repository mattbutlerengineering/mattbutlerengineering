import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@mattbutlerengineering/rialto";
import { FLOOR_MATERIALS, type FloorMaterial, type FloorPlanSection } from "@mbe/types";

/** The value the "no floor finish" option carries; `Select` options are strings. */
const NONE_VALUE = "";

export interface SectionMaterialPickerProps {
  section: FloorPlanSection;
  /** The chosen material, or `null` when the operator clears it. */
  onChange: (material: FloorMaterial | null) => void;
  disabled?: boolean;
}

/**
 * Picks (or clears) one section's floor material. The accessible name carries
 * the section's own name, so a sidebar listing several sections exposes several
 * distinguishable controls rather than several identical ones.
 */
export function SectionMaterialPicker({ section, onChange, disabled }: SectionMaterialPickerProps) {
  const { t } = useTranslation();

  const options = useMemo(
    () => [
      { value: NONE_VALUE, label: t("floorPlan.sections.materialNone") },
      ...FLOOR_MATERIALS.map((material) => ({
        value: material,
        label: t(`floorPlan.materials.${material}`),
      })),
    ],
    [t]
  );

  return (
    <Select
      aria-label={t("floorPlan.sections.materialFor", { name: section.name })}
      options={options}
      value={section.floorMaterial ?? NONE_VALUE}
      disabled={disabled}
      onChange={(value) => onChange(value === NONE_VALUE ? null : (value as FloorMaterial))}
    />
  );
}
