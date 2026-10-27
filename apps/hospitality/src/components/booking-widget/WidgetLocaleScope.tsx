import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import {
  browserDeps,
  createLocaleRuntime,
  LocaleBridge,
  type LocaleRuntime,
} from "../../i18n/runtime.js";
import { PublishGuestToastLocale } from "./ToastLocaleOverride.js";
import { DEFAULT_LOCALE, type LocaleTag } from "../../i18n/locales.js";

export const WIDGET_LOCALE_STORAGE_KEY = "mbe-booking-widget-locale";

/**
 * The widget's own runtime: its own i18next instance and storage key, and it
 * never touches `<html lang>` (the scope marks its subtree with `lang`
 * instead), so a guest's choice and a staff member's never move each other.
 */
function createWidgetRuntime(): LocaleRuntime {
  return createLocaleRuntime({
    ...browserDeps,
    setDocumentLang: () => {},
    storageKey: WIDGET_LOCALE_STORAGE_KEY,
  });
}

const WidgetLocaleContext = createContext<LocaleRuntime | null>(null);

/** The enclosing widget runtime, or null when the widget is rendered outside a scope. */
export function useWidgetLocaleRuntime(): LocaleRuntime | null {
  return useContext(WidgetLocaleContext);
}

export interface WidgetLocaleScopeProps {
  /** Demo page only: start in the dashboard's language when the guest has no stored choice. */
  followDashboardOnce?: boolean;
  /** Overrides the default runtime (tests). */
  runtime?: LocaleRuntime;
  children: ReactNode;
}

function WidgetLang({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  return (
    <div lang={i18n.language} style={{ display: "contents" }}>
      {children}
    </div>
  );
}

/**
 * Gives everything inside it a locale independent of the dashboard. The
 * dashboard's language is read once, at boot, as a default; after that the two
 * never influence each other. Children keep their identity across a locale
 * switch, so in-progress guest details survive it.
 */
export function WidgetLocaleScope({
  followDashboardOnce = false,
  runtime: provided,
  children,
}: WidgetLocaleScopeProps) {
  const [runtime] = useState(() => provided ?? createWidgetRuntime());
  const dashboardLanguage = useTranslation().i18n.language as LocaleTag;
  const preferred = followDashboardOnce ? dashboardLanguage : undefined;
  const [bootTag] = useState(() => runtime.bootTarget(preferred));
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let live = true;
    void runtime.bootLocale(preferred).then(() => {
      if (live) setBooted(true);
    });
    return () => {
      live = false;
    };
    // Boot once per scope: later dashboard changes must not move the widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime]);

  // en-US is bundled, so nothing loads before paint; any other target waits to avoid a flash of English.
  if (!booted && bootTag !== DEFAULT_LOCALE) return null;

  return (
    <WidgetLocaleContext.Provider value={runtime}>
      <I18nextProvider i18n={runtime.i18n}>
        <LocaleBridge runtime={runtime}>
          {/* The staff demo page is a dashboard route: its toasts stay in the dashboard locale. */}
          {!followDashboardOnce && <PublishGuestToastLocale />}
          <WidgetLang>{children}</WidgetLang>
        </LocaleBridge>
      </I18nextProvider>
    </WidgetLocaleContext.Provider>
  );
}
