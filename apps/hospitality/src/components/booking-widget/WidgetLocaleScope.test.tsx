import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { localeRuntime, LocaleBridge } from "../../i18n/runtime.js";
import { LocalePicker } from "../LocalePicker";
import {
  WidgetLocaleScope,
  useWidgetLocaleRuntime,
  WIDGET_LOCALE_STORAGE_KEY,
} from "./WidgetLocaleScope.js";

function Probe({ id }: { id: string }) {
  const { i18n } = useTranslation();
  return <span data-testid={id}>{i18n.language}</span>;
}

function WidgetPicker() {
  const runtime = useWidgetLocaleRuntime();
  return runtime ? <LocalePicker variant="compact" runtime={runtime} /> : null;
}

function Details() {
  const [name, setName] = useState("");
  return <input aria-label="guest-name" value={name} onChange={(e) => setName(e.target.value)} />;
}

function renderWithDashboard(ui: React.ReactNode) {
  return render(
    <I18nextProvider i18n={localeRuntime.i18n}>
      <LocaleBridge>
        <Probe id="dashboard" />
        {ui}
      </LocaleBridge>
    </I18nextProvider>
  );
}

function pickSpanish() {
  fireEvent.click(screen.getByRole("button", { name: /Language|Idioma|Langue/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Español/ }));
}

describe("WidgetLocaleScope", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    await localeRuntime.changeLocale("en-US");
    localStorage.clear();
  });

  it("widget switch leaves the dashboard locale and storage untouched", async () => {
    renderWithDashboard(
      <WidgetLocaleScope>
        <Probe id="widget" />
        <WidgetPicker />
      </WidgetLocaleScope>
    );
    pickSpanish();
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveTextContent("es-MX"));
    expect(screen.getByTestId("dashboard")).toHaveTextContent("en-US");
    expect(localStorage.getItem(WIDGET_LOCALE_STORAGE_KEY)).toBe("es-MX");
    expect(localStorage.getItem("mbe-hospitality-locale")).toBeNull();
  });

  it("dashboard switch leaves an already-booted widget alone", async () => {
    renderWithDashboard(
      <WidgetLocaleScope>
        <Probe id="widget" />
      </WidgetLocaleScope>
    );
    await act(() => localeRuntime.changeLocale("fr-CA"));
    expect(screen.getByTestId("dashboard")).toHaveTextContent("fr-CA");
    expect(screen.getByTestId("widget")).toHaveTextContent("en-US");
    expect(localStorage.getItem(WIDGET_LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("followDashboardOnce defaults the widget to the dashboard locale", async () => {
    await localeRuntime.changeLocale("es-MX");
    renderWithDashboard(
      <WidgetLocaleScope followDashboardOnce>
        <Probe id="widget" />
      </WidgetLocaleScope>
    );
    expect(await screen.findByTestId("widget")).toHaveTextContent("es-MX");
  });

  it("without followDashboardOnce the widget defaults to the browser, not the dashboard", async () => {
    await localeRuntime.changeLocale("es-MX");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR"]);
    renderWithDashboard(
      <WidgetLocaleScope>
        <Probe id="widget" />
      </WidgetLocaleScope>
    );
    expect(await screen.findByTestId("widget")).toHaveTextContent("fr-CA");
  });

  it("a stored widget choice beats the dashboard default", async () => {
    localStorage.setItem(WIDGET_LOCALE_STORAGE_KEY, "fr-CA");
    await localeRuntime.changeLocale("es-MX");
    renderWithDashboard(
      <WidgetLocaleScope followDashboardOnce>
        <Probe id="widget" />
      </WidgetLocaleScope>
    );
    expect(await screen.findByTestId("widget")).toHaveTextContent("fr-CA");
  });

  it("marks its subtree with the active lang", async () => {
    const { container } = renderWithDashboard(
      <WidgetLocaleScope>
        <Probe id="widget" />
        <WidgetPicker />
      </WidgetLocaleScope>
    );
    pickSpanish();
    await waitFor(() => expect(container.querySelector('div[lang="es-MX"]')).not.toBeNull());
  });

  it("switching mid-flow keeps entered guest details", async () => {
    renderWithDashboard(
      <WidgetLocaleScope>
        <Details />
        <WidgetPicker />
      </WidgetLocaleScope>
    );
    fireEvent.change(screen.getByLabelText("guest-name"), { target: { value: "Ada" } });
    pickSpanish();
    await waitFor(() => expect(screen.getByRole("button", { name: /Idioma/ })).toBeInTheDocument());
    expect(screen.getByLabelText("guest-name")).toHaveValue("Ada");
  });
});
