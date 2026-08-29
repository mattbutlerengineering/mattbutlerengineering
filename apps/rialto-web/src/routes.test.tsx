import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, matchRoutes } from "react-router";

// Rialto resolves to an unbuilt dist in the worktree, so — like every other app
// test — stub it. These stubs pass children through so nested react-router
// <Link>s render; the assertions exercise real link resolution against the real
// route table, not rialto internals.
vi.mock("@mattbutlerengineering/rialto/manifest", () => ({
  default: { components: [] },
}));

vi.mock("@mattbutlerengineering/rialto", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Spinner: () => null,
    Text: Pass,
    Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
      <button onClick={onClick}>{children}</button>
    ),
    Input: () => <input />,
    Checkbox: () => <input type="checkbox" />,
    Divider: () => <hr />,
    Avatar: () => null,
    Badge: Pass,
    HoverCard: Pass,
    Breadcrumb: () => null,
    Drawer: () => null,
    DataList: () => null,
    Stat: () => null,
    Pagination: () => null,
    Select: () => null,
    EmptyState: () => null,
    ConfirmDialog: () => null,
    DropdownMenu: () => null,
    Table: ({
      columns,
      data,
    }: {
      columns: { key: string; render?: (row: Record<string, unknown>) => ReactNode }[];
      data: Record<string, unknown>[];
    }) => (
      <table>
        <tbody>
          {data.map((row) => (
            <tr key={String(row.id)}>
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ),
    useToast: () => ({ toast: vi.fn() }),
  };
});

import { routeTree } from "./routes";
import { DEMO_ROUTES } from "./data/demo-routes";
import { SignIn } from "./pages/auth/SignIn";
import { SignUp } from "./pages/auth/SignUp";
import { DriverList } from "./pages/drivers/DriverList";
import { DriverProvider } from "./pages/drivers/DriverProvider";

const BASENAME = "/rialto";

/**
 * Resolve an app-absolute path (including the `/rialto` basename, exactly as it
 * appears in a rendered anchor's `href`) the way the running app's router would,
 * and return the matched leaf route's `path` (e.g. "drivers/:id" or "*").
 */
function leafFor(appPath: string): string | undefined {
  const matches = matchRoutes(routeTree, appPath, BASENAME);
  return matches?.at(-1)?.route.path;
}

describe("demo route table resolution", () => {
  it("resolves every DEMO_ROUTES target to a concrete demo route (never the catch-all)", () => {
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.drivers}`)).toBe("drivers");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.driverNew}`)).toBe("drivers/new");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.driver("1")}`)).toBe("drivers/:id");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.driverEdit("1")}`)).toBe("drivers/:id/edit");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.signIn}`)).toBe("login");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.signUp}`)).toBe("signup");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.dashboard}`)).toBe("dashboard");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.teamCreate}`)).toBe("teams/new");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.layouts}`)).toBe("layouts");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.authFlow}`)).toBe("auth-flow");
  });

  it("legacy un-prefixed demo paths fall through to the catch-all (documents the bug)", () => {
    expect(leafFor(`${BASENAME}/drivers/1`)).toBe("*");
    expect(leafFor(`${BASENAME}/signup`)).toBe("*");
    expect(leafFor(`${BASENAME}/signin`)).toBe("*");
  });
});

describe("demo pages emit in-demos cross-links", () => {
  it("SignIn 'Sign up' link resolves to the signup demo, not the catch-all", () => {
    render(
      <MemoryRouter basename={BASENAME} initialEntries={[`${BASENAME}${DEMO_ROUTES.signIn}`]}>
        <SignIn />
      </MemoryRouter>
    );

    const href = screen.getByRole("link", { name: /sign up/i }).getAttribute("href");
    expect(href).toBe(`${BASENAME}${DEMO_ROUTES.signUp}`);
    expect(leafFor(href!)).toBe("signup");
  });

  it("SignUp 'Sign in' link resolves to the login demo, not the catch-all", () => {
    render(
      <MemoryRouter basename={BASENAME} initialEntries={[`${BASENAME}${DEMO_ROUTES.signUp}`]}>
        <SignUp />
      </MemoryRouter>
    );

    const href = screen.getByRole("link", { name: /sign in/i }).getAttribute("href");
    expect(href).toBe(`${BASENAME}${DEMO_ROUTES.signIn}`);
    expect(leafFor(href!)).toBe("login");
  });

  it("DriverList row link resolves to the driver detail demo, not the catch-all", () => {
    render(
      <MemoryRouter basename={BASENAME} initialEntries={[`${BASENAME}${DEMO_ROUTES.drivers}`]}>
        <DriverProvider>
          <DriverList />
        </DriverProvider>
      </MemoryRouter>
    );

    // Driver-name cells render as links to the driver detail demo route.
    const rowLink = screen
      .getAllByRole("link")
      .find((a) => /\/demos\/drivers\/[^/]+$/.test(a.getAttribute("href") ?? ""));

    expect(rowLink, "expected a prefixed driver-name row link").toBeTruthy();
    const href = rowLink!.getAttribute("href")!;
    expect(href.startsWith(`${BASENAME}/demos/drivers/`)).toBe(true);
    expect(leafFor(href)).toBe("drivers/:id");
  });
});
