/**
 * Where focus goes when an editor page hands the Manager back to the hub after a save
 * (availability-hub ux.md, "Edit one rule": "The Manager returns to the hub with focus on that
 * row"). The editor names the row just before it leaves; the hub, which mounts afresh, takes the
 * request once on arrival. Going back in history cannot carry state to the entry it returns to,
 * so the request is held here rather than in the router.
 */

/** A request not taken by then is stale: the navigation it was made for did not happen. */
const RETURN_TTL_MS = 5_000;

let pending: { readonly testId: string; readonly at: number } | null = null;

/** Asks the hub that mounts next to put focus on the first control of this row (`hub-row-N`). */
export function focusHubRowOnReturn(testId: string): void {
  pending = { testId, at: Date.now() };
}

/** The row to focus on arrival, once; `null` when none was asked for, or it is stale. */
export function takeHubReturnRow(): string | null {
  const request = pending;
  pending = null;
  return request && Date.now() - request.at <= RETURN_TTL_MS ? request.testId : null;
}
