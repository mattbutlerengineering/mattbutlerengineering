/**
 * At 375px the example column is about 279px. Notification rows are buttons,
 * so Button's nowrap and its wrapper span let the message and timestamp paint
 * past the card. The guest profile grid floor of 300px and the nowrap tab
 * labels do the same to the contact card and the Related records tab.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../src/pages/examples");

const notifications = readFileSync(
  resolve(root, "NotificationCenterExamplePage.module.css"),
  "utf8"
);
const guest = readFileSync(resolve(root, "GuestDetailExamplePage.module.css"), "utf8");

describe("example pages at a 375px column", () => {
  it("lets a notification row wrap inside the card", () => {
    const row = /\.list \.item\s*\{([^}]+)\}/.exec(notifications)?.[1] ?? "";
    const span = /\.list \.item > span\s*\{([^}]+)\}/.exec(notifications)?.[1] ?? "";
    const title = /\.title\s*\{([^}]+)\}/.exec(notifications)?.[1] ?? "";
    const message = /\.message\s*\{([^}]+)\}/.exec(notifications)?.[1] ?? "";
    const header = /\.itemHeader\s*\{([^}]+)\}/.exec(notifications)?.[1] ?? "";

    expect(row).toMatch(/white-space:\s*normal/);
    expect(span).toMatch(/min-inline-size:\s*0/);
    expect(span).toMatch(/white-space:\s*normal/);
    expect(span).toMatch(/flex-direction:\s*column/);
    expect(title).toMatch(/display:\s*block/);
    expect(title).toMatch(/overflow-wrap:\s*break-word/);
    expect(message).toMatch(/display:\s*block/);
    expect(message).toMatch(/overflow-wrap:\s*break-word/);
    expect(header).toMatch(/flex-wrap:\s*wrap/);
    expect(header).toMatch(/max-inline-size:\s*100%/);
  });

  it("lets the guest profile panels shrink below their 300px floor", () => {
    const grid = /\.panelGrid\s*\{([^}]+)\}/.exec(guest)?.[1] ?? "";
    expect(grid).toMatch(/minmax\(\s*min\(\s*100%\s*,\s*300px\s*\)\s*,\s*1fr\s*\)/);
    expect(grid).toMatch(/min-inline-size:\s*0/);
  });
});
