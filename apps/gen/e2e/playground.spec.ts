import { test, expect } from "./fixtures.js";
import { AxeBuilder } from "@axe-core/playwright";
import { mockGenApi } from "./gen-api-mocks.js";

test.describe("Playground", () => {
  test("loads with prompt textarea", async ({ authPage }) => {
    await authPage.goto("/");
    await expect(authPage.getByPlaceholder("Describe the UI you want to build...")).toBeVisible();
  });

  test("Generate button is visible", async ({ authPage }) => {
    await authPage.goto("/");
    await expect(authPage.getByRole("button", { name: "Generate" })).toBeVisible();
  });

  test("can type a prompt", async ({ authPage }) => {
    await authPage.goto("/");
    const textarea = authPage.getByPlaceholder("Describe the UI you want to build...");
    await textarea.fill("a simple button");
    await expect(textarea).toHaveValue("a simple button");
    await expect(authPage.getByRole("button", { name: "Generate" })).toBeEnabled();
  });

  // F26: the hints line used to mount on focus and unmount on blur, so pressing the
  // mouse on Generate blurred the textarea, shrank the bar and moved the button out
  // from under the pointer before mouseup — the first click sent nothing.
  test("one click on Generate sends exactly one request", async ({ authPage }) => {
    const mocks = await mockGenApi(authPage, {
      generate: [{ key: "root", type: "Card", props: { title: "One click" } }],
      refineSubtree: [],
    });
    await authPage.goto("/");
    const textarea = authPage.getByPlaceholder("Describe the UI you want to build...");
    const generate = authPage.getByRole("button", { name: "Generate" });
    await textarea.fill("a simple button");

    const hints = authPage.getByText("Enter to send", { exact: false });
    await expect(hints).toBeVisible();
    const focusedBox = await generate.boundingBox();
    await textarea.blur();
    await expect(hints).toBeHidden();
    expect.soft(await generate.boundingBox()).toEqual(focusedBox);

    await textarea.focus();
    await generate.click();
    await expect.poll(() => mocks.uiRequests.length).toBe(1);
    expect(mocks.uiRequests[0]).toMatchObject({ prompt: "a simple button" });
  });

  // #7883/#8198: rialto's Dialog portals a nested Dialog into a layer inside the
  // outer one's own provider subtree, so each manages its own open state. Dismissing
  // the inner dialog must close only itself, not the outer dialog around it too.
  test("dismissing the inner dialog leaves the outer dialog open", async ({ authPage }) => {
    await mockGenApi(authPage, {
      generate: [
        { key: "root", type: "Stack", props: {} },
        {
          key: "outer",
          type: "Dialog",
          props: { open: true, title: "Outer dialog" },
          parentKey: "root",
        },
        {
          key: "inner",
          type: "Dialog",
          props: { open: true, title: "Inner dialog" },
          parentKey: "outer",
        },
      ],
      refineSubtree: [],
    });
    await authPage.goto("/");
    await authPage
      .getByPlaceholder("Describe the UI you want to build...")
      .fill("two nested dialogs");
    await authPage.getByRole("button", { name: "Generate" }).click();

    const outer = authPage.getByRole("dialog", { name: "Outer dialog" });
    const inner = authPage.getByRole("dialog", { name: "Inner dialog" });
    await expect(outer).toBeVisible();
    await expect(inner).toBeVisible();

    await inner.getByRole("button", { name: "Close dialog" }).click();

    await expect(inner).toBeHidden();
    await expect(outer).toBeVisible();
  });

  // #7907: the second click of a double-click lands on the Stop button that just replaced
  // Generate. The guard must swallow it, so the generation it started runs to completion.
  test("double-click on Generate does not abort the generation it started", async ({
    authPage,
  }) => {
    const mocks = await mockGenApi(authPage, {
      generate: [{ key: "root", type: "Card", props: { title: "Double click" } }],
      refineSubtree: [],
    });
    // Hold the response open so the second click always hits the in-flight (Stop) state
    // instead of racing a mock that finishes instantly. Registered last, so it wins.
    const requests: Array<Record<string, unknown>> = [];
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await authPage.route("**/api/gen/ui", async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      await released;
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body:
          JSON.stringify({ key: "root", type: "Card", props: { title: "Double click" } }) + "\n",
      });
    });
    await authPage.goto("/");
    await authPage.getByPlaceholder("Describe the UI you want to build...").fill("a simple card");

    await authPage.getByRole("button", { name: "Generate" }).dblclick();
    release();

    await expect(authPage.getByText("Double click", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(mocks.uiRequests).toHaveLength(0);
  });

  test("has no critical a11y violations", async ({ authPage }) => {
    await authPage.goto("/");
    // Wait for the playground to fully render
    await expect(authPage.getByPlaceholder("Describe the UI you want to build...")).toBeVisible();
    // Audit the settled rendering: the suggestion cards fade in over 350ms and axe
    // would otherwise sample their text mid-animation at a fraction of its opacity.
    await authPage.emulateMedia({ reducedMotion: "reduce" });
    // The AppBar fades in via inline framer-motion styles the CSS media query can't reach.
    await expect(authPage.getByRole("banner")).toHaveCSS("opacity", "1");
    const results = await new AxeBuilder({ page: authPage }).withTags(["wcag2aa"]).analyze();
    const violations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(violations).toHaveLength(0);
  });
});
