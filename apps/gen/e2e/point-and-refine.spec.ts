import type { Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";
import { mockGenApi } from "./gen-api-mocks.js";
import type { FlatElementLine } from "./gen-api-mocks.js";

const GENERATED: FlatElementLine[] = [
  { key: "root", type: "Stack", props: { direction: "column", gap: "md" } },
  { key: "header", type: "Card", props: { title: "Header card" }, parentKey: "root" },
  { key: "body", type: "Stack", props: { direction: "column", gap: "sm" }, parentKey: "root" },
  { key: "kpi", type: "Card", props: { title: "Original KPI" }, parentKey: "body" },
  { key: "footer", type: "Card", props: { title: "Footer card" }, parentKey: "root" },
];

/** Same root key as the selected node ("body"); the KPI card is retitled and a Badge appears. */
const REFINED_BODY: FlatElementLine[] = [
  { key: "body", type: "Stack", props: { direction: "row", gap: "sm" } },
  { key: "kpi", type: "Card", props: { title: "Refined KPI" }, parentKey: "body" },
  {
    key: "kpi-badge",
    type: "Badge",
    props: { variant: "success", label: "On track" },
    parentKey: "body",
  },
];

const SUBTREE_KEYS = ["body", "kpi", "kpi-badge"];

interface RenderedNode {
  text: string;
  html: string;
}

/** Everything the preview renders, keyed by spec key (`data-gen-node`), minus selection chrome. */
async function renderedNodes(page: Page): Promise<Record<string, RenderedNode>> {
  return page.locator("[data-gen-node]").evaluateAll((nodes) =>
    Object.fromEntries(
      nodes.map((node) => [
        (node as HTMLElement).dataset.genNode ?? "",
        {
          text: node.textContent ?? "",
          html: node.innerHTML.replace(/ data-(selected|cursor|changed)="[^"]*"/g, ""),
        },
      ])
    )
  );
}

function outsideSubtree(nodes: Record<string, RenderedNode>): Record<string, RenderedNode> {
  // `root` is an ancestor, so its markup legitimately changes with its descendants.
  return Object.fromEntries(
    Object.entries(nodes).filter(([key]) => key !== "root" && !SUBTREE_KEYS.includes(key))
  );
}

test.describe("Point and refine", () => {
  test("refines only the selected subtree, replays it identically and undoes it", async ({
    authPage: page,
  }) => {
    const mocks = await mockGenApi(page, { generate: GENERATED, refineSubtree: REFINED_BODY });
    await page.goto("/");

    // 1. Generate.
    const prompt = page.getByPlaceholder("Describe the UI you want to build...");
    await prompt.fill("a kpi dashboard");
    await prompt.press("Enter");
    const history = page.getByRole("listbox", { name: "Prompt history" });
    await expect(history.getByRole("option")).toHaveCount(1);
    expect(mocks.uiRequests).toHaveLength(1);

    // 2. Select a node by keyboard and read its catalog type from the inspector.
    await page.getByRole("button", { name: "Select component" }).click();
    const overlay = page.getByRole("group", { name: "Select component" });
    await overlay.focus();
    for (let step = 0; step < 3; step += 1) await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-gen-node="body"]')).toHaveAttribute("data-cursor", "true");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-gen-node="body"]')).toHaveAttribute("data-selected", "true");

    const inspector = page.getByRole("complementary", { name: "Selected component" });
    await expect(inspector.getByText("Stack", { exact: true }).last()).toBeVisible();
    await expect(inspector.getByText("1 direct child · 2 in subtree")).toBeVisible();

    // Scoped to the selection overlay and the node panel. color-contrast is excluded: the
    // text-secondary/tertiary tokens measure 4.07:1 on the recessed surface the panel uses
    // (the same pair fails the prompt bar's character count), a rialto token matter tracked apart.
    const axe = await new AxeBuilder({ page })
      .include('[role="group"][aria-label="Select component"]')
      .include('aside[aria-label="Selected component"]')
      .withTags(["wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual(
      []
    );

    // 3. Refine the selection: only its subtree changes.
    const before = await renderedNodes(page);
    expect(Object.keys(before).sort()).toEqual(["body", "footer", "header", "kpi", "root"]);

    await inspector.getByLabel("Change this component").fill("make it a row with a badge");
    await inspector.getByRole("button", { name: "Refine", exact: true }).click();
    await expect(history.getByRole("option")).toHaveCount(2);
    await expect(inspector.getByText("Added: Badge")).toBeVisible();

    expect(mocks.uiRequests).toHaveLength(2);
    expect(mocks.uiRequests[1]?.target).toEqual({ key: "body", type: "Stack" });

    const refined = await renderedNodes(page);
    expect(Object.keys(refined).sort()).toEqual([
      "body",
      "footer",
      "header",
      "kpi",
      "kpi-badge",
      "root",
    ]);
    expect(outsideSubtree(refined)).toEqual(outsideSubtree(before));
    expect(refined.kpi?.text).toContain("Refined KPI");
    expect(before.kpi?.text).toContain("Original KPI");

    // 5. Undo restores the original, redo re-applies the refinement; neither calls the model.
    await page.keyboard.press("Alt+KeyZ");
    await expect(page.locator('[data-gen-node="kpi-badge"]')).toHaveCount(0);
    expect(await renderedNodes(page)).toEqual(before);
    await page.keyboard.press("Alt+Shift+KeyZ");
    await expect(page.locator('[data-gen-node="kpi-badge"]')).toHaveCount(1);
    expect(await renderedNodes(page)).toEqual(refined);
    expect(mocks.uiRequests).toHaveLength(2);

    // 4. Replay the stored refinement from History (actions reveal on hover): same result, no model call.
    await history.getByRole("option").filter({ hasText: "a kpi dashboard" }).click();
    await expect(page.locator('[data-gen-node="kpi-badge"]')).toHaveCount(0);
    const refinedEntry = history.getByRole("option").filter({ hasText: "Refined" });
    await refinedEntry.hover();
    await refinedEntry.getByRole("button", { name: "Replay prompt" }).click();
    await expect(page.locator('[data-gen-node="kpi-badge"]')).toHaveCount(1);
    expect(await renderedNodes(page)).toEqual(refined);
    expect(mocks.uiRequests).toHaveLength(2);
  });
});
