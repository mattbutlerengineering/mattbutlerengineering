import type { FloorPlan, Table } from "@mbe/types";

/**
 * The plan the Floor plan view draws: the one the entry came from if it still exists, else the
 * active plan with the most active tables (first in list order on a tie), else any plan.
 */
export function pickFloorPlan(
  plans: readonly FloorPlan[],
  tables: readonly Table[],
  requestedId: string | undefined
): FloorPlan | null {
  const requested = plans.find((plan) => plan.id === requestedId);
  if (requested) return requested;

  const activeTableCount = (plan: FloorPlan) =>
    tables.filter((table) => table.isActive && table.floorPlanId === plan.id).length;
  const pool = plans.some((plan) => plan.isActive) ? plans.filter((plan) => plan.isActive) : plans;

  let best: FloorPlan | null = null;
  let bestCount = -1;
  for (const plan of pool) {
    const count = activeTableCount(plan);
    if (count > bestCount) {
      best = plan;
      bestCount = count;
    }
  }
  return best;
}
