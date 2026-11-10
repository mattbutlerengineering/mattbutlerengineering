/**
 * The 768px showcase keeps its sidebar, so example layouts that key off the
 * viewport never see how narrow the content column actually is. These
 * contracts pin the container queries that restack from that column.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const examples = resolve(dirname(fileURLToPath(import.meta.url)), "../src/pages/examples");
const read = (name: string) => readFileSync(resolve(examples, name), "utf8");

describe("example layout contracts", () => {
  it("stacks the checkout summary from the row's own width", () => {
    const css = read("CheckoutExamplePage.module.css");
    expect(css).toMatch(/\.frame\s*\{[^}]*container-type:\s*inline-size/);
    const query = /@container\s*\(max-width:\s*45rem\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
    expect(query).toMatch(/\.layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it("stacks booking-wizard dates from the wizard's own width and stretches each field", () => {
    const css = read("BookingWizardExamplePage.module.css");
    expect(css).toMatch(/\.wizard\s*\{[^}]*container-type:\s*inline-size/);
    const query = /@container\s*\(max-width:\s*30rem\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
    expect(query).toMatch(/\.dateGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.dateField > :first-child\s*\{[^}]*inline-size:\s*100%/);
  });

  it("lets a notification row wrap inside the card despite Button's nowrap", () => {
    const css = read("NotificationCenterExamplePage.module.css");
    expect(css).toMatch(/\.list \.item\s*\{[^}]*white-space:\s*normal/);
    expect(css).toMatch(/\.list \.item > span\s*\{[^}]*flex-direction:\s*column/);
    expect(css).toMatch(/\.title\s*\{[^}]*display:\s*block/);
    expect(css).toMatch(/\.message\s*\{[^}]*display:\s*block/);
    expect(css).toMatch(/\.list > li\s*\{[^}]*min-inline-size:\s*0/);
  });
});
