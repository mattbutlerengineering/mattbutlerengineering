import { use, useEffect } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";

export interface LeaveGuardProps {
  /** An unsaved draft exists. */
  readonly active: boolean;
  /** The date whose draft would be lost. */
  readonly date: string | null;
}

/** Prompts before an in-app route change throws the draft away. */
function RouteBlocker({ active, date }: LeaveGuardProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname
  );
  return (
    <DiscardChangesDialog
      open={blocker.state === "blocked"}
      date={date}
      onDiscard={() => blocker.proceed?.()}
      onKeepEditing={() => blocker.reset?.()}
    />
  );
}

/**
 * Guards the ways of leaving that the drawer cannot see (ux.md F2 step 6, "navigating away"):
 * closing or reloading the tab, and, under the app's data router, moving to another page.
 */
export function LeaveGuard(props: LeaveGuardProps) {
  const { active } = props;
  const inDataRouter = use(UNSAFE_DataRouterContext) !== null;

  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  return inDataRouter ? <RouteBlocker {...props} /> : null;
}
