import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { localeRuntime } from "../i18n/runtime.js";
import { DashboardSidebar } from "./DashboardSidebar.js";
import { LocalePicker } from "./LocalePicker/index.js";

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
