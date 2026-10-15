import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { axe } from "vitest-axe";
import { enUS as rialtoEnUS } from "@mattbutlerengineering/rialto/providers";
import { createLocaleRuntime, type RuntimeDeps } from "../../i18n/runtime.js";
import { LocalePicker, type LocalePickerProps } from "./LocalePicker.js";

// jsdom cannot compute colour contrast; token-level contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

function makeRuntime(overrides: Partial<RuntimeDeps> = {}) {
  return createLocaleRuntime({
    loadAppCatalog: async () => ({}),
    loadRialtoMessages: async () => ({ ...rialtoEnUS }),
    storage: { get: () => null, set: () => true },
    browserLanguages: () => [],
    setDocumentLang: () => {},
    timeoutMs: 50,
    ...overrides,
  });
}

function renderPicker(runtime: ReturnType<typeof makeRuntime>, props: LocalePickerProps) {
  return render(
    <main>
      <I18nextProvider i18n={runtime.i18n}>
        <LocalePicker runtime={runtime} {...props} />
      </I18nextProvider>
    </main>
  );
}

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("LocalePicker accessibility (axe)", () => {
  it("sidebar, open menu", async () => {
    const { container } = renderPicker(makeRuntime(), { variant: "sidebar" });
    fireEvent.click(screen.getByRole("button", { name: /Language/ }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it("sidebar, collapsed", async () => {
    const { container } = renderPicker(makeRuntime(), { variant: "sidebar", collapsed: true });
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it("compact", async () => {
    const { container } = renderPicker(makeRuntime(), { variant: "compact" });
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it("settings", async () => {
    const { container } = renderPicker(makeRuntime(), { variant: "settings" });
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it("failed state with Retry", async () => {
    const runtime = makeRuntime({
      loadAppCatalog: async () => {
        throw new Error("offline");
      },
    });
    const { container } = renderPicker(runtime, { variant: "sidebar" });
    fireEvent.click(screen.getByRole("button", { name: /Language/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Español/ }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
