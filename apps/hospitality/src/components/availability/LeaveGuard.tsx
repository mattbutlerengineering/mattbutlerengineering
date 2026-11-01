import { use, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";

export interface LeaveGuardProps {
  /** An unsaved draft exists. */
  readonly active: boolean;
  /** The date whose draft would be lost. */
  readonly date: string | null;
  /** Names a draft that is not a day's. */
  readonly title?: string;
}

/**
 * Prompts before an in-app route change throws the draft away. A router consults only the last
 * blocker registered, so this mounts only while a draft exists: a clean guard that registered
 * later would otherwise shadow a dirty one and let its edits go without asking.
 */
function RouteBlocker({ date, title }: Omit<LeaveGuardProps, "active">) {
  const { t } = useTranslation();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname
  );
  return (
    <DiscardChangesDialog
      open={blocker.state === "blocked"}
      date={date}
      {...(title ? { title } : {})}
      // Leaving the page loses every draft on it, which may be more than the one this guard names.
      description={t("availability.discard.leavePage")}
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

  return inDataRouter && active ? <RouteBlocker date={props.date} title={props.title} /> : null;
}
