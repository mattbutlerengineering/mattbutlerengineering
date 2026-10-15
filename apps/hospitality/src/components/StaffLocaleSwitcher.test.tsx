import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router";
import { localeRuntime } from "../i18n/runtime.js";
import { DashboardSidebar } from "./DashboardSidebar.js";
import { LocalePicker } from "./LocalePicker/index.js";
import { LanguageRegionCard } from "./LanguageRegionCard.js";

afterEach(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
  localStorage.clear();
});

describe("staff locale switcher in the sidebar footer", () => {
  it("switches in place without losing form input and persists the choice", async () => {
    render(
      <BrowserRouter>
        <input aria-label="note" defaultValue="" />
        <DashboardSidebar
          sections={[]}
          activePath="/"
          onAction={() => {}}
          footerSlot={<LocalePicker variant="sidebar" />}
        />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByLabelText("note"), { target: { value: "table by window" } });
    fireEvent.click(screen.getByRole("button", { name: /Language/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Español/ }));
    await waitFor(() => expect(localeRuntime.i18n.language).toBe("es-MX"));
    expect(screen.getByLabelText("note")).toHaveValue("table by window");
    expect(screen.getByRole("button", { name: /Idioma/ })).toBeInTheDocument();
    expect(Object.values(localStorage)).toContain("es-MX");
  });
});

describe("staff locale switcher in the Settings card", () => {
  it("switches from the Settings select without losing form input and persists the choice", async () => {
    Element.prototype.scrollIntoView = vi.fn(); // jsdom has none; the open listbox scrolls to its active option
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="note" defaultValue="" />
        <LanguageRegionCard />
      </>
    );
    await user.type(screen.getByLabelText("note"), "table by window");
    await user.click(screen.getByRole("combobox", { name: /Language/ }));
    await user.click(await screen.findByRole("option", { name: /Español/ }));
    await waitFor(() => expect(localeRuntime.i18n.language).toBe("es-MX"));
    expect(screen.getByLabelText("note")).toHaveValue("table by window");
    expect(screen.getByText("Idioma y región")).toBeInTheDocument();
    expect(Object.values(localStorage)).toContain("es-MX");
  });
});
