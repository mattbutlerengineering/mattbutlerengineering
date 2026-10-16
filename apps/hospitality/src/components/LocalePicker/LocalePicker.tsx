import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DropdownMenu, Select, Spinner, Text } from "@mattbutlerengineering/rialto";
import { localeRuntime, type LocaleRuntime } from "../../i18n/runtime.js";
import { SUPPORTED_LOCALES, type LocaleTag } from "../../i18n/locales.js";
import { MACHINE_TRANSLATION_TAGS } from "./machine-translation-tags.js";
import styles from "./LocalePicker.module.css";

export interface LocalePickerProps {
  /** `sidebar`: globe + endonym menu (icon-only when `collapsed`); `settings`: labelled select with MT note; `compact`: short-code menu for headers. */
  variant: "sidebar" | "settings" | "compact";
  /** Sidebar only: show just the globe. The accessible name still carries the current locale. */
  collapsed?: boolean;
  /** Which runtime to switch. Defaults to the dashboard's; the booking widget passes its own. */
  runtime?: LocaleRuntime;
}

function endonymOf(tag: string): string {
  return SUPPORTED_LOCALES.find((l) => l.tag === tag)?.endonym ?? tag;
}

/**
 * Explicit locale choice. A switch is all-or-nothing (see the runtime): while
 * it is pending the current text stays and a spinner shows; on rejection the
 * value is unchanged and an inline Retry is offered.
 */
export function LocalePicker({
  variant,
  collapsed = false,
  runtime = localeRuntime,
}: LocalePickerProps) {
  const { t, i18n } = useTranslation(undefined, { i18n: runtime.i18n });
  const current = i18n.language as LocaleTag;
  const [pending, setPending] = useState<LocaleTag | null>(null);
  const [failed, setFailed] = useState<LocaleTag | null>(null);

  async function pick(tag: LocaleTag) {
    if (tag === current || pending) return;
    setPending(tag);
    setFailed(null);
    try {
      await runtime.changeLocale(tag);
    } catch {
      setFailed(tag);
    } finally {
      setPending(null);
    }
  }

  const currentEndonym = endonymOf(current);
  const currentLocale = SUPPORTED_LOCALES.find((l) => l.tag === current);
  const triggerName = t("localePicker.triggerName", { locale: currentEndonym });

  return (
    <div className={styles.root} data-variant={variant} aria-busy={pending !== null || undefined}>
      <div className={styles.row}>
        {variant === "settings" ? (
          <Select
            label={t("localePicker.label")}
            options={SUPPORTED_LOCALES.map((l) => ({ value: l.tag, label: l.endonym }))}
            value={current}
            onChange={(value) => void pick(value as LocaleTag)}
          />
        ) : (
          <DropdownMenu
            // The sidebar picker sits at the bottom of a clipped column (over the
            // command-palette hint), so it opens upward; the header-style compact
            // picker has room below.
            side={variant === "sidebar" ? "top" : "bottom"}
            trigger={
              <Button variant="ghost" size="sm" className={styles.trigger} aria-label={triggerName}>
                <Text as="span" aria-hidden>
                  🌐
                </Text>
                {variant === "compact" ? (
                  <Text as="span" aria-hidden lang={current}>
                    {current.toUpperCase()}
                  </Text>
                ) : (
                  !collapsed && (
                    <Text as="span" aria-hidden lang={current}>
                      {currentEndonym}
                    </Text>
                  )
                )}
              </Button>
            }
            items={SUPPORTED_LOCALES.map((l) => ({
              id: l.tag,
              label: l.endonym,
              icon: (
                <Text as="span" aria-hidden>
                  {l.tag === current ? "✓" : ""}
                </Text>
              ),
              shortcut: MACHINE_TRANSLATION_TAGS[l.tag],
              onSelect: () => void pick(l.tag),
            }))}
          />
        )}
        {pending && (
          <Spinner size="sm" label={t("localePicker.loading", { locale: endonymOf(pending) })} />
        )}
      </div>
      {variant === "settings" && currentLocale?.machineTranslated && (
        <Text variant="caption">{t("localePicker.machineTranslated")}</Text>
      )}
      {failed && (
        <div className={styles.error} role="alert">
          <Text variant="caption">
            {t("localePicker.loadError", { locale: endonymOf(failed) })}
          </Text>
          <Button variant="ghost" size="sm" onClick={() => void pick(failed)}>
            {t("localePicker.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
