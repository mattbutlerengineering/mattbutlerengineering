import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@mattbutlerengineering/rialto";
import { FLOOR_MATERIALS, type FloorMaterial } from "@mbe/types";

/** The value the "no floor finish" option carries; `Select` options are strings. */
const NONE_VALUE = "";

export interface PlanFloorMaterialPickerProps {
  /** The plan's saved material; `null`/`undefined` = bare floor. */
  value: FloorMaterial | null | undefined;
  /** The chosen material, or `null` when the operator picks None. */
  onChange: (material: FloorMaterial | null) => void;
  disabled?: boolean;
}

/** Picks (or clears) the plan-level floor drawn beneath every section. */
export function PlanFloorMaterialPicker({
  value,
  onChange,
  disabled,
}: PlanFloorMaterialPickerProps) {
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
      aria-label={t("floorPlan.planFloor.label")}
      options={options}
      value={value ?? NONE_VALUE}
      disabled={disabled}
      onChange={(next) => onChange(next === NONE_VALUE ? null : (next as FloorMaterial))}
    />
  );
}
