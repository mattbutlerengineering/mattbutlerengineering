import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { useRialtoLocale } from "@mattbutlerengineering/rialto/providers";
import { localeRuntime, LocaleBridge } from "../../i18n/runtime.js";
import { WidgetLocaleScope, WIDGET_LOCALE_STORAGE_KEY } from "./WidgetLocaleScope.js";
import { ToastLocaleOverride } from "./ToastLocaleOverride.js";

/** Stands in for dashboard chrome (Sidebar, Navbar…) that reads rialto's locale outside any guest scope. */
function StaffChrome() {
  const { messages } = useRialtoLocale();
  return <span data-testid="staff-chrome">{messages.notifications}</span>;
}

function App({ guest, staffDemo = false }: { guest: boolean; staffDemo?: boolean }) {
  return (
    <I18nextProvider i18n={localeRuntime.i18n}>
      <LocaleBridge>
        <ToastLocaleOverride>
          <StaffChrome />
          {guest ? (
            <WidgetLocaleScope followDashboardOnce={staffDemo}>guest</WidgetLocaleScope>
          ) : (
            <span>staff</span>
          )}
        </ToastLocaleOverride>
      </LocaleBridge>
    </I18nextProvider>
  );
}

describe("ToastLocaleOverride", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    await localeRuntime.changeLocale("en-US");
    localStorage.clear();
  });

  it.each([
    ["es-MX", "Notificaciones"],
    ["fr-CA", "Avis"],
  ])("labels the one live region in the guest locale (%s)", async (tag, label) => {
    localStorage.setItem(WIDGET_LOCALE_STORAGE_KEY, tag);
    render(<App guest />);
    await waitFor(() => expect(screen.getByRole("region", { name: label })).toBeInTheDocument());
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("keeps the dashboard locale on staff routes and returns to it after leaving a guest route", async () => {
    localStorage.setItem(WIDGET_LOCALE_STORAGE_KEY, "es-MX");
    const view = render(<App guest />);
    await waitFor(() => screen.getByRole("region", { name: "Notificaciones" }));
    view.rerender(<App guest={false} />);
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument()
    );
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("leaves dashboard chrome outside the guest scope in the dashboard locale", async () => {
    localStorage.setItem(WIDGET_LOCALE_STORAGE_KEY, "fr-CA");
    render(<App guest />);
    await waitFor(() => screen.getByRole("region", { name: "Avis" }));
    expect(screen.getByTestId("staff-chrome")).toHaveTextContent("Notifications");
  });

  it("does not switch the toast region for the staff widget demo (followDashboardOnce)", async () => {
    localStorage.setItem(WIDGET_LOCALE_STORAGE_KEY, "fr-CA");
    render(<App guest staffDemo />);
    // render() flushes effects inside act(), so any publish has already happened here.
    await waitFor(() => expect(screen.getByText("guest")).toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByTestId("staff-chrome")).toHaveTextContent("Notifications");
  });
});
