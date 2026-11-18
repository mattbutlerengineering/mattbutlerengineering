import { describe, it, expect, expectTypeOf } from "vitest";
import { createElement } from "react";
import { assertSideNavProps, SideNavContractError } from "./validate-props.js";
import { SIDENAV_CONTRACT, type SideNavProps } from "./types.js";

const noop = (): void => undefined;
const good = (): SideNavProps => ({
  contract: SIDENAV_CONTRACT,
  pathname: "/timeline",
  locale: "en-US",
  direction: "ltr",
  flags: { isAdmin: false },
  readiness: { status: "operational", steps: [] },
  isMobileOpen: false,
  onAction: noop,
  onMobileClose: noop,
});

/** The contract error's message, or "accepted" when the props pass. Any other error is a bug. */
const rejection = (value: unknown): string => {
  try {
    assertSideNavProps(value);
    return "accepted";
  } catch (error) {
    if (!(error instanceof SideNavContractError)) throw error;
    return error.message;
  }
};

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

const REJECTED: readonly (readonly [string, unknown, RegExp])[] = [
  ["a token key", { ...good(), accessToken: "abc" }, /accessToken.*token/],
  ["a bare token key", { ...good(), token: "abc" }, /token/],
  ["a token in flags", { ...good(), flags: { isAdmin: false, token: "x" } }, /flags\.token/],
  ["a JWT as the pathname", { ...good(), pathname: JWT }, /looks like a token/],
  ["a router object", { ...good(), router: { navigate: noop } }, /router.*plain props/],
  ["a navigate function", { ...good(), navigate: noop }, /navigate/],
  ["a React element prop", { ...good(), header: createElement("div") }, /header/],
  [
    "a React element in flags",
    { ...good(), flags: { isAdmin: createElement("div") } },
    /flags\.isAdmin.*element/,
  ],
  ["a newer contract version", { ...good(), contract: SIDENAV_CONTRACT + 1 }, /contract: expected/],
  ["a string contract version", { ...good(), contract: "1" }, /contract: expected/],
  ["a numeric pathname", { ...good(), pathname: 5 }, /pathname/],
  ["a bad direction", { ...good(), direction: "up" }, /direction/],
  ["a string isAdmin", { ...good(), flags: { isAdmin: "yes" } }, /isAdmin/],
  [
    "an unknown status",
    { ...good(), readiness: { status: "bogus", steps: [] } },
    /readiness\.status/,
  ],
  [
    "non-string steps",
    { ...good(), readiness: { status: "setup", steps: [1] } },
    /readiness\.steps/,
  ],
  ["a numeric isMobileOpen", { ...good(), isMobileOpen: 1 }, /isMobileOpen/],
  ["a string onAction", { ...good(), onAction: "x" }, /onAction/],
  ["a string onRenderError", { ...good(), onRenderError: "x" }, /onRenderError/],
  ["null", null, /props/],
];

describe("assertSideNavProps (runtime)", () => {
  it("accepts plain data and callbacks", () => {
    expect(rejection(good())).toBe("accepted");
    expect(rejection({ ...good(), onRenderError: noop })).toBe("accepted");
  });

  it.each(REJECTED)("rejects %s", (_name, value, pattern) => {
    expect(rejection(value)).toMatch(pattern);
  });
});

describe("SideNavProps (type level)", () => {
  it("has no token, router or element field", () => {
    expectTypeOf<SideNavProps>().not.toHaveProperty("token");
    expectTypeOf<SideNavProps>().not.toHaveProperty("accessToken");
    expectTypeOf<SideNavProps>().not.toHaveProperty("router");
    expectTypeOf<SideNavProps["pathname"]>().toEqualTypeOf<string>();
    expectTypeOf<SideNavProps["flags"]>().toEqualTypeOf<{ readonly isAdmin: boolean }>();
  });

  it("refuses extra fields at compile time", () => {
    // @ts-expect-error a token can not be passed
    const withToken: SideNavProps = { ...good(), accessToken: "x" };
    // @ts-expect-error a router object can not be passed
    const withRouter: SideNavProps = { ...good(), router: {} };
    // @ts-expect-error a React element can not be passed as pathname
    const withElement: SideNavProps = { ...good(), pathname: createElement("div") };
    expect([withToken, withRouter, withElement]).toHaveLength(3);
  });
});
