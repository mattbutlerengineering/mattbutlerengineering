import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { RialtoProvider } from "../../providers/RialtoProvider";
import { RialtoLocaleProvider, useRialtoLocale } from "../RialtoLocaleProvider";
import { enUS } from "../messages";
import { esMX } from "../locales/es-MX";

describe("useRialtoLocale", () => {
  it("returns en-US messages and no locale with no provider, without throwing", () => {
    const { result } = renderHook(() => useRialtoLocale());
    expect(result.current).toEqual({ locale: undefined, messages: enUS });
  });

  it("keeps today's English defaults byte-identical", () => {
    expect(enUS).toMatchObject({
      dismiss: "Dismiss",
      close: "Close",
      closeDialog: "Close dialog",
      dialog: "Dialog",
      drawer: "Drawer",
      popover: "Popover",
      preview: "Preview",
      notifications: "Notifications",
      confirm: "Confirm",
      cancel: "Cancel",
      pagination: "Pagination",
      previousMonth: "Previous month",
      chooseDateRange: "Choose date range",
      mainNavigation: "Main navigation",
      loadingContent: "Loading content",
      replaceImage: "Replace",
    });
    expect(enUS.pageNumber(3)).toBe("Page 3");
    expect(enUS.pageStatus(3, 20)).toBe("Page 3 of 20");
    expect(enUS.fileTypeNotAccepted("image/png")).toBe(
      "File type not accepted. Accepted: image/png"
    );
  });

  it("returns the locale and messages a RialtoLocaleProvider supplies", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        {children}
      </RialtoLocaleProvider>
    );
    const { result } = renderHook(() => useRialtoLocale(), { wrapper });
    expect(result.current).toEqual({ locale: "es-MX", messages: esMX });
  });

  it("accepts locale and messages through RialtoProvider", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RialtoProvider locale="es-MX" messages={esMX}>
        {children}
      </RialtoProvider>
    );
    const { result } = renderHook(() => useRialtoLocale(), { wrapper });
    expect(result.current).toEqual({ locale: "es-MX", messages: esMX });
  });

  it("leaves the locale context untouched when RialtoProvider gets neither prop", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RialtoLocaleProvider locale="fr-CA" messages={esMX}>
        <RialtoProvider>{children}</RialtoProvider>
      </RialtoLocaleProvider>
    );
    const { result } = renderHook(() => useRialtoLocale(), { wrapper });
    expect(result.current.locale).toBe("fr-CA");
  });

  it("defaults messages to en-US when only a locale is given", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RialtoLocaleProvider locale="en-GB">{children}</RialtoLocaleProvider>
    );
    const { result } = renderHook(() => useRialtoLocale(), { wrapper });
    expect(result.current).toEqual({ locale: "en-GB", messages: enUS });
  });
});
