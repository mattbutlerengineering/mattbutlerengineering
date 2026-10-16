import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { esMX as rialtoESMX } from "@mattbutlerengineering/rialto/locales/es-MX";
import { createLocaleRuntime, type RuntimeDeps } from "../../i18n/runtime.js";
import type { LocaleTag } from "../../i18n/locales.js";
import esMX from "../../i18n/catalogs/es-MX.json";
import { LocalePicker, type LocalePickerProps } from "./LocalePicker.js";

function makeRuntime(overrides: Partial<RuntimeDeps> = {}) {
  const store = new Map<string, string>();
  const deps: RuntimeDeps = {
    loadAppCatalog: vi.fn(async (tag: LocaleTag) => (tag === "es-MX" ? esMX : {})),
    loadRialtoMessages: vi.fn(async () => ({ ...rialtoESMX })),
    storage: {
      get: (key) => store.get(key) ?? null,
      set: (key, value) => {
        store.set(key, value);
        return true;
      },
    },
    browserLanguages: () => [],
    setDocumentLang: () => {},
    timeoutMs: 50,
    ...overrides,
  };
  return { runtime: createLocaleRuntime(deps), store };
}

function renderPicker(
  runtime: ReturnType<typeof makeRuntime>["runtime"],
  props: Partial<LocalePickerProps> = {}
) {
  return render(
    <I18nextProvider i18n={runtime.i18n}>
      <LocalePicker variant="sidebar" runtime={runtime} {...props} />
    </I18nextProvider>
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Language/ }));
}

describe("LocalePicker", () => {
  it("opens the sidebar menu upward (the picker is pinned to the sidebar bottom) and the compact menu downward", () => {
    const { runtime } = makeRuntime();
    const { unmount } = renderPicker(runtime);
    openMenu();
    expect(screen.getByRole("menu")).toHaveAttribute("data-side", "top");
    unmount();

    renderPicker(runtime, { variant: "compact" });
    openMenu();
    expect(screen.getByRole("menu")).toHaveAttribute("data-side", "bottom");
  });

  it("lists all four endonyms, machine-translation tags on es-MX and fr-CA only", () => {
    const { runtime } = makeRuntime();
    renderPicker(runtime);
    openMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("English (US)"),
      expect.stringContaining("English (UK)"),
      expect.stringContaining("Español (México)"),
      expect.stringContaining("Français (Canada)"),
    ]);
    expect(items[0]!.textContent).not.toMatch(/autom/);
    expect(items[1]!.textContent).not.toMatch(/autom/);
    expect(items[2]!.textContent).toContain("Traducción autom.");
    expect(items[3]!.textContent).toContain("Traduction autom.");
  });

  it("names the trigger with the current locale, including when the sidebar is collapsed", () => {
    const { runtime } = makeRuntime();
    renderPicker(runtime, { collapsed: true });
    const trigger = screen.getByRole("button", { name: "Language: English (US)" });
    expect(trigger).not.toHaveTextContent("English");
  });

  it("compact variant shows the short code", () => {
    const { runtime } = makeRuntime();
    renderPicker(runtime, { variant: "compact" });
    expect(screen.getByRole("button", { name: /Language/ })).toHaveTextContent("EN-US");
  });

  it("switches and persists on selection", async () => {
    const { runtime, store } = makeRuntime();
    renderPicker(runtime);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Español/ }));
    await waitFor(() => expect(runtime.i18n.language).toBe("es-MX"));
    expect(store.get("mbe-hospitality-locale")).toBe("es-MX");
    expect(screen.getByRole("button", { name: "Idioma: Español (México)" })).toBeInTheDocument();
  });

  it("shows a spinner and keeps the current text while the load is pending", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { runtime } = makeRuntime({
      loadAppCatalog: async () => {
        await gate;
        return esMX;
      },
    });
    renderPicker(runtime);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Español/ }));
    expect(await screen.findByRole("status", { name: "Loading Español (México)…" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Language: English (US)" })).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("keeps the trigger enabled and focused while a switch is pending (focus is not dropped to body)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { runtime } = makeRuntime({
      loadAppCatalog: async () => {
        await gate;
        return esMX;
      },
      // The load is held open on purpose until release(); the 50 ms default
      // would time the switch out first on a loaded CI runner (coverage on),
      // leaving the language at en-US.
      timeoutMs: 10_000,
    });
    const { container } = renderPicker(runtime);
    const trigger = screen.getByRole("button", { name: /Language/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.keyDown(screen.getAllByRole("menuitem")[0]!, { key: "End" });
    fireEvent.keyDown(screen.getAllByRole("menuitem")[3]!, { key: "ArrowUp" });
    fireEvent.keyDown(screen.getAllByRole("menuitem")[2]!, { key: "Enter" });
    await screen.findByRole("status");
    expect(trigger).not.toBeDisabled();
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(trigger).toHaveFocus());
    release();
    await waitFor(() => expect(runtime.i18n.language).toBe("es-MX"));
    expect(container.firstElementChild).not.toHaveAttribute("aria-busy");
  });

  it("marks the current locale's endonym with its own lang", () => {
    const { runtime } = makeRuntime();
    renderPicker(runtime);
    expect(screen.getByText("English (US)", { selector: "[lang]" })).toHaveAttribute(
      "lang",
      "en-US"
    );
  });

  it("on rejection keeps the value, shows Retry, and Retry succeeds", async () => {
    let fail = true;
    const { runtime } = makeRuntime({
      loadAppCatalog: async () => {
        if (fail) throw new Error("offline");
        return esMX;
      },
    });
    renderPicker(runtime);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Español/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load Español (México)");
    expect(runtime.i18n.language).toBe("en-US");
    expect(screen.getByRole("button", { name: "Language: English (US)" })).toBeInTheDocument();

    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(runtime.i18n.language).toBe("es-MX"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is keyboard operable: Enter opens, arrows move, Enter selects", async () => {
    const { runtime } = makeRuntime();
    renderPicker(runtime);
    const trigger = screen.getByRole("button", { name: /Language/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    fireEvent.keyDown(items[1]!, { key: "ArrowDown" });
    fireEvent.keyDown(items[2]!, { key: "Enter" });
    await waitFor(() => expect(runtime.i18n.language).toBe("es-MX"));
  });

  it("settings variant: labelled select plus a machine-translation note only for MT locales", async () => {
    const { runtime } = makeRuntime();
    renderPicker(runtime, { variant: "settings" });
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveTextContent("English (US)");
    expect(screen.queryByText(/machine/i)).not.toBeInTheDocument();

    await act(() => runtime.changeLocale("es-MX"));
    expect(await screen.findByText("Las traducciones son automáticas.")).toBeInTheDocument();
  });
});
