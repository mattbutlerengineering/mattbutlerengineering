import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mountSideNav } from "./mount.js";
import { sections } from "./sections.js";
import type * as SectionsModule from "./sections.js";
import { SIDENAV_CONTRACT, type NavAction, type SideNavProps } from "./types.js";

vi.mock("./sections.js", async (importOriginal) => {
  const original = await importOriginal<typeof SectionsModule>();
  return { ...original, sections: vi.fn(original.sections) };
});

function makeProps(overrides: Partial<SideNavProps> = {}): SideNavProps {
  return {
    contract: SIDENAV_CONTRACT,
    pathname: "/timeline",
    locale: "en-US",
    direction: "ltr",
    flags: { isAdmin: false },
    readiness: { status: "operational", steps: ["onboarding", "operating-hours", "floor-plan"] },
    isMobileOpen: false,
    onAction: vi.fn(),
    onMobileClose: vi.fn(),
    ...overrides,
  };
}

let container: HTMLElement;

// The remote renders through flushSync in its own root, as it does in production, so these
// tests run outside React's act environment instead of wrapping every mount.
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  document.body.style.overflow = "";
});

describe("mountSideNav", () => {
  it("renders into the given container in its own root", async () => {
    const handle = mountSideNav(container, makeProps());
    const nav = within(container).getByRole("navigation", { name: "Dashboard navigation" });
    expect(container).toContainElement(nav);
    expect(within(nav).getByRole("button", { name: "Timeline" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    handle.unmount();
  });

  it("update(props) re-renders without remounting the DOM", async () => {
    const handle = mountSideNav(container, makeProps());
    const navBefore = within(container).getByRole("navigation");
    const guests = within(container).getByRole("button", { name: "Guests" });

    act(() => handle.update(makeProps({ pathname: "/guests" })));

    expect(within(container).getByRole("navigation")).toBe(navBefore);
    expect(within(container).getByRole("button", { name: "Guests" })).toBe(guests);
    expect(guests).toHaveAttribute("aria-current", "page");
    expect(within(container).getByRole("button", { name: "Timeline" })).not.toHaveAttribute(
      "aria-current"
    );
    handle.unmount();
  });

  it("update(props) relabels for a new locale and shows the admin item for admins", () => {
    const handle = mountSideNav(container, makeProps());
    expect(within(container).queryByRole("button", { name: "Users" })).toBeNull();
    act(() => handle.update(makeProps({ locale: "es-MX", flags: { isAdmin: true } })));
    expect(within(container).getByRole("button", { name: "Usuarios" })).toBeInTheDocument();
    expect(within(container).getByRole("navigation")).toHaveAccessibleName("Navegación del panel");
    handle.unmount();
  });

  it("marks the rendered root with the direction", () => {
    const handle = mountSideNav(container, makeProps({ direction: "rtl" }));
    expect(within(container).getByRole("navigation")).toHaveAttribute("dir", "rtl");
    handle.unmount();
  });

  it("slots() returns header and footer HTMLElements inside the nav, stable across updates", () => {
    const handle = mountSideNav(container, makeProps());
    const { header, footer } = handle.slots();
    expect(header).toBeInstanceOf(HTMLElement);
    expect(footer).toBeInstanceOf(HTMLElement);
    const nav = within(container).getByRole("navigation");
    expect(nav).toContainElement(header);
    expect(nav).toContainElement(footer);

    header.appendChild(document.createTextNode("venue switcher"));
    act(() => handle.update(makeProps({ pathname: "/guests" })));
    expect(handle.slots().header).toBe(header);
    expect(nav).toContainElement(header);
    expect(header).toHaveTextContent("venue switcher");
    handle.unmount();
  });

  it("unmount() removes everything, including slots, listeners and the scroll lock", () => {
    const onMobileClose = vi.fn();
    const handle = mountSideNav(container, makeProps({ isMobileOpen: true, onMobileClose }));
    expect(document.body.style.overflow).toBe("hidden");
    const { header, footer } = handle.slots();

    handle.unmount();

    expect(container).toBeEmptyDOMElement();
    expect(header.isConnected).toBe(false);
    expect(footer.isConnected).toBe(false);
    expect(document.body.style.overflow).toBe("");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onMobileClose).not.toHaveBeenCalled();
  });

  it("unmount() twice is harmless and update() afterwards fails loudly", () => {
    const handle = mountSideNav(container, makeProps());
    handle.unmount();
    expect(() => handle.unmount()).not.toThrow();
    expect(() => handle.update(makeProps())).toThrow(/unmounted/);
  });

  it("throws a contract error for a bad prop at mount and at update, rendering nothing", () => {
    expect(() =>
      mountSideNav(container, { ...makeProps(), accessToken: "x" } as unknown as SideNavProps)
    ).toThrow(/accessToken/);
    expect(container).toBeEmptyDOMElement();

    const handle = mountSideNav(container, makeProps());
    expect(() => handle.update({ ...makeProps(), router: {} } as unknown as SideNavProps)).toThrow(
      /router/
    );
    expect(within(container).getByRole("navigation")).toBeInTheDocument();
    handle.unmount();
  });
});

describe("onAction", () => {
  it("emits a route action, then asks the host to close the drawer", async () => {
    const onAction = vi.fn<(a: NavAction) => void>();
    const onMobileClose = vi.fn();
    const handle = mountSideNav(container, makeProps({ onAction, onMobileClose }));
    await userEvent.click(within(container).getByRole("button", { name: "Reservations" }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ type: "route", path: "/reservations" });
    expect(onMobileClose).toHaveBeenCalledOnce();
    handle.unmount();
  });

  it("emits chat and signout actions", async () => {
    const onAction = vi.fn<(a: NavAction) => void>();
    const handle = mountSideNav(container, makeProps({ onAction }));
    await userEvent.click(within(container).getByRole("button", { name: "Chat" }));
    await userEvent.click(within(container).getByRole("button", { name: "Sign Out" }));
    expect(onAction.mock.calls.map(([a]) => a)).toEqual([{ type: "chat" }, { type: "signout" }]);
    handle.unmount();
  });

  it("uses the latest onAction after update, with no remount", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const handle = mountSideNav(container, makeProps({ onAction: first }));
    act(() => handle.update(makeProps({ onAction: second })));
    await userEvent.click(within(container).getByRole("button", { name: "Guests" }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    handle.unmount();
  });
});

describe("sections and mobile drawer behaviour", () => {
  it("collapses a named section and persists that under its locale-independent id", async () => {
    const handle = mountSideNav(container, makeProps());
    await userEvent.click(within(container).getByRole("button", { name: "Manage" }));
    expect(within(container).queryByRole("button", { name: "Menus" })).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem("hospitality-sidebar-collapsed") ?? "[]")
    ).toEqual(["Manage"]);
    handle.unmount();
  });

  it("starts collapsed from persisted state and tolerates corrupt storage", () => {
    window.localStorage.setItem("hospitality-sidebar-collapsed", JSON.stringify(["Manage"]));
    const a = mountSideNav(container, makeProps());
    expect(within(container).queryByRole("button", { name: "Menus" })).toBeNull();
    a.unmount();

    window.localStorage.setItem("hospitality-sidebar-collapsed", "{not json");
    const b = mountSideNav(container, makeProps());
    expect(within(container).getByRole("button", { name: "Menus" })).toBeInTheDocument();
    b.unmount();
  });

  it("closes the open mobile drawer on Escape, and shows a backdrop that closes it", async () => {
    const onMobileClose = vi.fn();
    const handle = mountSideNav(container, makeProps({ isMobileOpen: true, onMobileClose }));
    await userEvent.keyboard("{Escape}");
    expect(onMobileClose).toHaveBeenCalledOnce();
    const backdrop = container.querySelector("[aria-hidden='true'][data-backdrop]");
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop as HTMLElement);
    expect(onMobileClose).toHaveBeenCalledTimes(2);
    handle.unmount();
  });

  it("does nothing on Escape while the drawer is closed", async () => {
    const onMobileClose = vi.fn();
    const handle = mountSideNav(container, makeProps({ onMobileClose }));
    await userEvent.keyboard("{Escape}");
    expect(onMobileClose).not.toHaveBeenCalled();
    handle.unmount();
  });
});

describe("render errors", () => {
  it("catches a render error in the root's boundary and reports it through onRenderError", () => {
    const onRenderError = vi.fn<(e: Error) => void>();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Any render-time failure inside the remote: its section builder throws once.
    vi.mocked(sections).mockImplementation(() => {
      throw new Error("boom");
    });
    const hostile = makeProps({ onRenderError });

    expect(() => mountSideNav(container, hostile)).not.toThrow();
    expect(onRenderError).toHaveBeenCalledOnce();
    expect(onRenderError.mock.calls[0]?.[0].message).toMatch(/boom/);
    expect(container.querySelector("nav")).toBeNull();
    consoleError.mockRestore();
    vi.mocked(sections).mockReset();
  });
});
