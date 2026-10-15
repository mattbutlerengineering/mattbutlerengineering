import { createContext, useContext, useMemo, type ReactNode } from "react";
import { enUS, type RialtoMessages } from "./messages";

export interface RialtoLocale {
  /**
   * BCP 47 tag for Rialto's `Intl` formatting. `undefined` keeps today's
   * behaviour: each component's own `locale` prop, else the runtime default.
   */
  readonly locale: string | undefined;
  readonly messages: RialtoMessages;
}

const NO_PROVIDER: RialtoLocale = { locale: undefined, messages: enUS };

const RialtoLocaleContext = createContext<RialtoLocale>(NO_PROVIDER);

export interface RialtoLocaleProviderProps {
  locale?: string;
  /** Defaults to en-US. Import other locales from `@mattbutlerengineering/rialto/locales/<tag>`. */
  messages?: RialtoMessages;
  children: ReactNode;
}

/** Sets the locale and messages Rialto components render with (ADR-028). */
export function RialtoLocaleProvider({
  locale,
  messages = enUS,
  children,
}: RialtoLocaleProviderProps) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <RialtoLocaleContext.Provider value={value}>{children}</RialtoLocaleContext.Provider>;
}

/**
 * The active Rialto locale. Never throws: with no provider it returns en-US
 * messages and an `undefined` locale, so standalone consumers see exactly the
 * English they always did (ADR-025's no-throw contract, applied to text).
 */
export function useRialtoLocale(): RialtoLocale {
  return useContext(RialtoLocaleContext);
}
