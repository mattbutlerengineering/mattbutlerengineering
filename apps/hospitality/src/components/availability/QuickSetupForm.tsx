import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import {
  emptyService,
  replaceService,
  setSharedDays,
  type KeptHours,
  type QuickSetupDraft,
  type ServiceDraft,
} from "./quick-setup-draft.js";
import { type QuickSetupIssue } from "./quick-setup-validate.js";
import { moveServiceStart, setDaysAndReplace } from "./quick-setup-placement.js";
import {
  issuesFor,
  QuickSetupFixContext,
  QuickSetupIdScopeContext,
  quickSetupFieldId,
  quickSetupLineId,
  useQuickSetupFieldId,
  type QuickSetupFix,
} from "./quick-setup-field-helpers.js";
import { ServiceLineHeader } from "./quick-setup-line-header.js";
import { DayPicker } from "./quick-setup-fields.js";
import { ServiceRow } from "./QuickSetupServiceRow.js";
import { RegularWeekStrip } from "./RegularWeekStrip.js";
import { PreviewRow } from "./quick-setup-preview-row.js";
import { useWeekdaySummary } from "./ScheduleFormParts.js";
import styles from "./QuickSetupForm.module.css";
import lineStyles from "./QuickSetupLine.module.css";

export interface QuickSetupFormProps {
  readonly draft: QuickSetupDraft;
  readonly onChange: (draft: QuickSetupDraft) => void;
  /** Problems to show; the owner decides when (after a save attempt, or live in the wizard). */
  readonly issues: readonly QuickSetupIssue[];
  /** The venue does not exist yet (the onboarding wizard): the strip shows the typed hours only. */
  readonly local?: boolean;
  /**
   * The form in Change regular week's drawer (ux.md S14): no strip beside it.
   */
  readonly inDrawer?: boolean;
  /** The days belong to where the schedule is used, not to this form (Edit schedule): shown, not changed. */
  readonly fixedDays?: boolean;
  /** The id prefix of this form's fields, for an owner that must find them itself (focus a problem). */
  readonly idScope?: string;
  /**
   * Each service is a closed line on a phone (ux.md F2): one open at a time, plus any with a
   * problem. Never set in onboarding. The owner re-keys the form after a save to close every line.
   * On every viewport the lines stack over a single column: the closed preview row follows them.
   */
  readonly collapsible?: boolean;
  /** The owner shows the preview itself (a draft preview while dirty): none is rendered here. */
  readonly hidePreview?: boolean;
  /**
   * What the owner's save falls back to for a service that carries no seating or booking types
   * of its own, by name trimmed and lower-cased (`storedKeptByName`). The row shows these, so it
   * shows what will be saved. Omit it where the save falls back to the defaults.
   */
  readonly storedKept?: Readonly<Record<string, KeptHours>>;
  /** With `collapsible`: the service open on arrival (Regular hours' `?service=`). */
  readonly initialOpenId?: string | null;
  /**
   * With `collapsible`: rendered right after the open service (after the last one when none is
   * open), so it is the next Tab stop after the fields being edited (Regular hours' save bar).
   */
  readonly afterOpenService?: ReactNode;
}

/** A service nothing has been typed into: there is no line to read, so it starts open. */
function isBlankService(service: ServiceDraft) {
  return (
    service.name === "" &&
    service.opens === null &&
    service.lastSeating === null &&
    service.closes === null &&
    service.blocks.length === 0
  );
}

function DaysField({ draft, onChange, issues, fixedDays }: QuickSetupFormProps) {
  const fieldId = useQuickSetupFieldId();
  const { t } = useTranslation();
  const summarize = useWeekdaySummary();
  // F1 5: nothing follows the shared days, so there is nothing to ask.
  if (draft.services.length > 0 && draft.services.every((s) => s.days !== null)) {
    return (
      <fieldset className={styles.days} id={fieldId(null, "days")}>
        <legend className={styles.legend}>{t("availability.quickSetup.days")}</legend>
        <Text variant="body" color="secondary">
          {t("availability.quickSetup.everyServiceOwnDays")}
        </Text>
      </fieldset>
    );
  }
  if (fixedDays) {
    return (
      <Text variant="body">
        {t("availability.quickSetup.daysSummary", { days: summarize(draft.days) })}
      </Text>
    );
  }
  const problems = issuesFor(issues, null, "days");
  return (
    <DayPicker
      id={fieldId(null, "days")}
      legend={t("availability.quickSetup.days")}
      days={draft.days}
      onChange={(days) => onChange(setSharedDays(draft, days))}
      draft={draft}
      problems={problems}
    />
  );
}

/**
 * The S1 form: services (name chips, three times, their own days and hours) over shared days,
 * with the guest preview strip beside it. Controlled; the card and the onboarding wizard each own what happens next.
 */
export function QuickSetupForm({
  draft,
  onChange,
  issues,
  local = false,
  inDrawer = false,
  fixedDays = false,
  idScope,
  collapsible = false,
  hidePreview = false,
  storedKept,
  initialOpenId = null,
  afterOpenService,
}: QuickSetupFormProps) {
  const { t } = useTranslation();
  // Field ids carry the form instance: the week panel and the drawer opened from it can hold the
  // same draft (same service ids) at once, and a shared id would hand one form's labels to the other.
  const ownScopeId = useId();
  const scope = idScope ?? ownScopeId;
  // The same sentence twice would change no DOM, so a screen reader would stay silent the second
  // time: `repeat` flips a trailing no-break space to make each announcement a DOM change.
  const [announcement, setAnnouncement] = useState({ message: "", repeat: false });
  const announce = (message: string) =>
    setAnnouncement((last) => ({ message, repeat: !last.repeat }));
  const focusAfterChangeRef = useRef<{ id: string; target: "name" | "header" } | null>(null);

  // Phone lines (ux.md F2): the one service the Manager opened, plus every service with a problem.
  // Forced-open is derived from `issues`, never stored, so fixing a problem releases the service.
  // A brand-new empty service starts open: it has no line worth reading yet.
  const [openId, setOpenId] = useState<string | null>(
    () => initialOpenId ?? draft.services.find(isBlankService)?.id ?? null
  );
  const firstIssueOf = new Map<string, QuickSetupIssue>();
  for (const issue of issues) {
    if (issue.serviceId !== null && !firstIssueOf.has(issue.serviceId)) {
      firstIssueOf.set(issue.serviceId, issue);
    }
  }
  const isOpen = (id: string) => openId === id || firstIssueOf.has(id);
  const slotAfter = draft.services.some((s) => s.id === openId)
    ? openId
    : (draft.services.at(-1)?.id ?? null);

  useEffect(() => {
    const pending = focusAfterChangeRef.current;
    if (pending === null) return;
    focusAfterChangeRef.current = null;
    const id =
      pending.target === "name"
        ? quickSetupFieldId(pending.id, "name", undefined, scope)
        : quickSetupLineId(pending.id, "header", scope);
    document.getElementById(id)?.focus();
  }, [draft.services.length, scope]);

  const addService = () => {
    const service = emptyService(crypto.randomUUID());
    focusAfterChangeRef.current = { id: service.id, target: "name" };
    // The new service opens and the others close (forced ones stay open).
    setOpenId(service.id);
    announce(t("availability.quickSetup.serviceAdded", { n: draft.services.length + 1 }));
    onChange({ ...draft, services: [...draft.services, service] });
  };
  const removeService = (id: string) => {
    announce("");
    // The removed row's controls are gone. Lines: focus goes to the next service's header, else
    // the previous one's. Otherwise: the name of the service before it (after it, for the first).
    const at = draft.services.findIndex((s) => s.id === id);
    const neighbour = collapsible
      ? (draft.services[at + 1] ?? draft.services[at - 1])
      : draft.services[at > 0 ? at - 1 : 1];
    focusAfterChangeRef.current = neighbour
      ? { id: neighbour.id, target: collapsible ? "header" : "name" }
      : null;
    if (openId === id) setOpenId(null);
    onChange({ ...draft, services: draft.services.filter((s) => s.id !== id) });
  };

  const applyFix = (fix: QuickSetupFix) => {
    const service = draft.services.find((s) => s.id === fix.serviceId);
    if (!service) return;
    onChange(
      replaceService(
        draft,
        fix.kind === "time"
          ? moveServiceStart(service, fix.opensAt)
          : setDaysAndReplace(draft, service, fix.days)
      )
    );
  };

  return (
    <QuickSetupIdScopeContext value={scope}>
      <QuickSetupFixContext value={applyFix}>
        <div className={inDrawer || collapsible ? styles.layoutSingle : styles.layout}>
          <Stack gap="md">
            {draft.services.map((service, index) => {
              const open = !collapsible || isOpen(service.id);
              const forced = firstIssueOf.has(service.id);
              // The same keyed wrapper in both modes: rotating across the phone width keeps the rows.
              return [
                <div key={service.id}>
                  {collapsible && (
                    <ServiceLineHeader
                      draft={draft}
                      service={service}
                      open={open}
                      problem={firstIssueOf.get(service.id) ?? null}
                      // A line with a problem is pinned open, never closed: fixing it must not
                      // collapse the fields the Manager is typing into.
                      onToggle={() =>
                        setOpenId(openId === service.id && !forced ? null : service.id)
                      }
                    />
                  )}
                  {/* A closed service mounts no fields: it has no problem, so nothing hidden needs focus.
                      Focus inside a line adopts it, so what is being edited stays open after its problem clears. */}
                  <div
                    id={quickSetupLineId(service.id, "fields", scope)}
                    className={collapsible && open ? lineStyles.fields : undefined}
                    onFocusCapture={() => setOpenId(service.id)}
                  >
                    {open && (
                      <ServiceRow
                        draft={draft}
                        service={service}
                        index={index}
                        removable={draft.services.length > 1}
                        issues={issues}
                        onChange={(next) => onChange(replaceService(draft, next))}
                        onRemove={() => removeService(service.id)}
                        announce={announce}
                        // The wizard saves the legacy hours shape, which has no seating or
                        // booking types: a control for them there would save nothing.
                        optionFields={!local}
                        storedKept={storedKept?.[service.name.trim().toLowerCase()]}
                      />
                    )}
                  </div>
                </div>,
                // A sibling of the rows, so a sticky slot is held by the whole list, not one row.
                service.id === slotAfter && afterOpenService ? (
                  <div key="after-open-service">{afterOpenService}</div>
                ) : null,
              ];
            })}
            <div>
              <Button variant="secondary" onClick={addService}>
                {t("availability.quickSetup.addService")}
              </Button>
            </div>
            <DaysField draft={draft} onChange={onChange} issues={issues} fixedDays={fixedDays} />
            <Text className={styles.visuallyHidden} role="status">
              {announcement.message}
              {announcement.repeat ? "\u00a0" : ""}
            </Text>
          </Stack>
          {!inDrawer && !hidePreview && (
            <div className={collapsible ? styles.previewBelow : styles.stripColumn}>
              {collapsible ? (
                <PreviewRow draft={draft} local={local} />
              ) : (
                <RegularWeekStrip draft={draft} local={local} />
              )}
            </div>
          )}
        </div>
      </QuickSetupFixContext>
    </QuickSetupIdScopeContext>
  );
}
