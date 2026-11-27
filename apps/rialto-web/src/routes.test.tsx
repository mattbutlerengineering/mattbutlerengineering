import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, matchRoutes } from "react-router";
import type { RouteObject } from "react-router";

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
    PinInput: () => <input />,
    Steps: () => null,
    Meter: () => null,
    StatusLED: () => null,
    Handshake: () => null,
    useMotionPreset: () => ({
      precision: { duration: 0 },
      spring: { duration: 0 },
      springGentle: { duration: 0 },
      tilt: { stiffness: 500, damping: 22, mass: 0.35 },
    }),
    useDeviceContext: () => ({ reducedMotion: false }),
  };
});

import { routeTree } from "./routes";
import { DEMOS_DESCRIPTION } from "./data/route-head-data";
import { DocumentTitle } from "./document-title";
import { DEMO_ROUTES } from "./data/demo-routes";
import { DEMO_PAGES } from "./data/nav-sections";
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

function flattenRoutes(routes: RouteObject[]): RouteObject[] {
  return routes.flatMap((route) => [route, ...flattenRoutes(route.children ?? [])]);
}

describe("standalone routes", () => {
  it("visual-test is wrapped in a main landmark (it has no layout supplying one; axe region, #7188)", () => {
    const route = flattenRoutes(routeTree).find(
      (candidate) =>
        candidate.path === "visual-test" &&
        isValidElement(candidate.element) &&
        candidate.element.type === "main"
    );
    expect(route).toBeTruthy();
  });
});

describe("demo route table resolution", () => {
  it("resolves every DEMO_ROUTES target to a concrete demo route (never the catch-all)", () => {
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.drivers}`)).toBe("drivers");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.driverNew}`)).toBe("drivers/new");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.driver("1")}`)).toBe("drivers/:id");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.driverEdit("1")}`)).toBe("drivers/:id/edit");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.signIn}`)).toBe("login");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.signUp}`)).toBe("signup");
    expect(leafFor(`${BASENAME}${DEMO_ROUTES.sessionExpired}`)).toBe("session-expired");
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

  it("SignIn 'Session expired' footer link resolves to the session-expired demo, not the catch-all", () => {
    render(
      <MemoryRouter basename={BASENAME} initialEntries={[`${BASENAME}${DEMO_ROUTES.signIn}`]}>
        <SignIn />
      </MemoryRouter>
    );

    const href = screen.getByRole("link", { name: /session expired/i }).getAttribute("href");
    expect(href).toBe(`${BASENAME}${DEMO_ROUTES.sessionExpired}`);
    expect(leafFor(href!)).toBe("session-expired");
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

describe("demos index route (#8535)", () => {
  it("/rialto/demos/ renders inside the showcase shell (sidebar + footer, #8641)", () => {
    const matches = matchRoutes(routeTree, `${BASENAME}/demos/`, BASENAME);
    const shell = matches?.find((match) => {
      const element = match.route.element as { type?: { name?: string } } | undefined;
      return element?.type?.name === "ShowcaseLayout";
    });
    expect(shell).toBeTruthy();
    expect(matches?.at(-1)?.route.path).toBe("demos");
  });

  it("the demos index renders a non-empty list linking to every demo page", () => {
    const shell = flattenRoutes(routeTree).find(
      (route) =>
        !route.path &&
        (route.children ?? []).some((child) => child.path === "demos" && !child.children)
    );
    const indexRoute = shell?.children?.find((r) => r.path === "demos");
    expect(indexRoute, "showcase shell must own the demos index").toBeTruthy();

    render(
      <MemoryRouter basename={BASENAME} initialEntries={[`${BASENAME}/demos/`]}>
        {indexRoute!.element}
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: /demos/i })).toBeTruthy();
    for (const page of DEMO_PAGES) {
      const link = screen.getByRole("link", { name: page.label });
      expect(link.getAttribute("href")).toBe(`${BASENAME}${page.path}`);
    }
  });
});

describe("post-deploy smoke coverage (#8892)", () => {
  type SmokeList = {
    covered: { path: string; heading: string }[];
    excluded: { path: string; reason: string }[];
  };

  /** Static-or-param demo paths below a route list; pathless layouts are walked through. */
  function demoPaths(routes: RouteObject[]): string[] {
    return routes.flatMap((route) => [
      ...(route.path !== undefined ? [route.path] : []),
      ...demoPaths(route.children ?? []),
    ]);
  }

  /** Paths relative to /rialto/demos; "" is the index page. */
  function walkedDemoPaths(): string[] {
    // The showcase shell owns the index; the `demos` layout route owns the children.
    const all = flattenRoutes(routeTree);
    const shell = all.find(
      (route) =>
        !route.path &&
        (route.children ?? []).some((child) => child.path === "demos" && !child.children)
    );
    const hasIndex = (shell?.children ?? []).some((r) => r.path === "demos");
    const children = all
      .filter((r) => r.path === "demos" && r.children)
      .flatMap((r) => demoPaths(r.children ?? []));
    return [...(hasIndex ? [""] : []), ...children];
  }

  const list = JSON.parse(
    // vitest runs with cwd = apps/rialto-web (jsdom: import.meta.url is not a file: URL)
    readFileSync(resolve(process.cwd(), "../../tests/smoke/rialto-demo-routes.json"), "utf8")
  ) as SmokeList;

  it("every demo route is smoke-covered or explicitly excluded", () => {
    const known = new Set([...list.covered, ...list.excluded].map((e) => e.path));
    const missing = walkedDemoPaths().filter((p) => !known.has(p));
    expect(missing).toEqual([]);
  });

  it("every excluded entry carries a reason, and no list entry is stale", () => {
    const walked = new Set(walkedDemoPaths());
    for (const entry of list.excluded) expect(entry.reason.length).toBeGreaterThan(0);
    const stale = [...list.covered, ...list.excluded].filter((e) => !walked.has(e.path));
    expect(stale).toEqual([]);
  });
});

describe("route document titles", () => {
  /** The title a matched leaf route sets, found in its element's direct children. */
  function titleFor(appPath: string): string | undefined {
    const element = matchRoutes(routeTree, appPath, BASENAME)?.at(-1)?.route.element;
    if (!isValidElement<{ children?: ReactNode }>(element)) return undefined;
    const found = Children.toArray(element.props.children).find(
      (child): child is ReactElement<{ title: string }> =>
        isValidElement(child) && child.type === DocumentTitle
    );
    return found?.props.title;
  }

  it.each([
    [DEMO_ROUTES.signIn, "Sign In"],
    [DEMO_ROUTES.signUp, "Sign Up"],
    [DEMO_ROUTES.sessionExpired, "Session Expired"],
    [DEMO_ROUTES.dashboard, "Pit Wall"],
    [DEMO_ROUTES.teamCreate, "Team Create"],
    [DEMO_ROUTES.layouts, "Layout Demo"],
    [DEMO_ROUTES.telemetry, "Telemetry HUD"],
    [DEMO_ROUTES.authFlow, "Auth Flow"],
    [DEMO_ROUTES.drivers, "Drivers CRUD"],
    [DEMO_ROUTES.driverNew, "New Driver"],
    [DEMO_ROUTES.driver("1"), "Driver"],
    [DEMO_ROUTES.driverEdit("1"), "Edit Driver"],
    ["/demos/visual-test", "Visual Test"],
    ["/visual-test", "Visual Test"],
    ["/privacy", "Privacy Policy"],
  ])("%s sets the title %s", (path, title) => {
    expect(titleFor(`${BASENAME}${path}`)).toBe(title);
  });

  it("the demos index is titled", () => {
    expect(titleFor(`${BASENAME}/demos`)).toBe("Demos");
  });

  it("the demos index sets its own description, distinct from the shell's", () => {
    const element = matchRoutes(routeTree, `${BASENAME}/demos`, BASENAME)?.at(-1)?.route.element;
    const found = Children.toArray(
      isValidElement<{ children?: ReactNode }>(element) ? element.props.children : []
    ).find(
      (child): child is ReactElement<{ description?: string }> =>
        isValidElement(child) && child.type === DocumentTitle
    );
    expect(found?.props.description).toBe(DEMOS_DESCRIPTION);
    expect(DEMOS_DESCRIPTION).not.toContain("precision-crafted");
  });
});
