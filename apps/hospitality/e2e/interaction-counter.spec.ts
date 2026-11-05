import { test, expect } from "@playwright/test";
import { countInteractions } from "./helpers/interaction-counter.js";

const PAGE_HTML = `
  <button id="go" onclick="document.getElementById('done').hidden = false">Go</button>
  <p id="done" hidden>Done</p>
  <label>Name <input id="name" /></label>
  <label><input type="checkbox" id="agree" /> Agree</label>
  <div role="combobox" tabindex="0" aria-label="Opens" aria-expanded="false"
    onclick="document.getElementById('list').hidden = false">5:00 PM</div>
  <ul id="list" role="listbox" aria-label="Opens" hidden>
    <li role="option" onclick="document.getElementById('list').hidden = true">6:00 PM</li>
  </ul>
`;

test.describe("interaction counter", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(PAGE_HTML);
  });

  test("a click, a fill, a check, an uncheck and a press each count 1", async ({ page }) => {
    const counter = countInteractions(page);
    const counted = counter.page;
    const expectOne = async (action: () => Promise<unknown>) => {
      const before = counter.count();
      await action();
      expect(counter.count() - before).toBe(1);
    };

    await expectOne(() => counted.getByRole("button", { name: "Go" }).click());
    await expectOne(() => counted.getByLabel("Name").fill("Ada"));
    await expectOne(() => counted.getByLabel("Agree").check());
    await expectOne(() => counted.getByLabel("Agree").uncheck());
    await expectOne(() => counted.getByLabel("Name").press("Tab"));
    expect(counter.count()).toBe(5);
  });

  test("a combobox opened then chosen counts 2", async ({ page }) => {
    const counter = countInteractions(page);
    await counter.page.getByRole("combobox", { name: "Opens" }).click();
    await counter.page
      .getByRole("listbox", { name: "Opens" })
      .getByRole("option", { name: "6:00 PM" })
      .click();
    expect(counter.count()).toBe(2);
  });

  test("goto, expect and waitFor count 0", async ({ page }) => {
    const counter = countInteractions(page);
    await counter.page.goto("about:blank");
    await counter.page.setContent(PAGE_HTML);
    await expect(counter.page.getByRole("button", { name: "Go" })).toBeVisible();
    await counter.page.getByRole("button", { name: "Go" }).waitFor();
    await expect(counter.page).toHaveURL("about:blank");
    expect(counter.count()).toBe(0);
  });
});
