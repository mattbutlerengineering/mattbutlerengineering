import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";

/**
 * Chat beside the onboarding form (#9474). `POST /api/gen/onboarding` is mocked with the
 * server's NDJSON contract, so these specs need no model: they prove the page turns typed
 * patches into filled fields, sends hand edits back as `draft`, and writes nothing before Launch.
 */

const SENTENCE = "60-seat bistro open 5 to 10, Tuesday to Sunday, in Lisbon";

interface OnboardingRequest {
  step: string;
  draft: Record<string, string>;
  messages: { role: string; content: string }[];
}

function ndjson(...lines: unknown[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

/** Answers each step with its patch and records every request body. */
async function mockOnboardingChat(page: Page): Promise<OnboardingRequest[]> {
  const requests: OnboardingRequest[] = [];
  await page.route("**/api/gen/onboarding", async (route) => {
    const body = route.request().postDataJSON() as OnboardingRequest;
    requests.push(body);
    const patch =
      body.step === "locationTime"
        ? { ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" }
        : { defaultReservationDuration: "90", maxPartySize: "12", advanceBookingDays: "60" };
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: ndjson(
        { type: "text", content: "Got it." },
        { type: "onboarding_patch", patch: { step: body.step, data: patch } }
      ),
    });
  });
  return requests;
}

async function startOnboarding(page: Page) {
  await page.goto("onboarding");
  await page.getByLabel("Venue Name").fill("Bistro Lisboa");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("log")).toBeVisible();
}

async function tellTheChat(page: Page, text: string) {
  await page.getByRole("textbox", { name: /message|chat/i }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test.describe("Onboarding chat", () => {
  test("one sentence fills the location and settings steps", async ({ mockedPage: page }) => {
    const requests = await mockOnboardingChat(page);
    // Launch is the one save: nothing may create the venue while the chat fills the forms.
    const venueCreates: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/api\/v1\/venues(\?|$)/.test(request.url())) {
        venueCreates.push(request.url());
      }
    });
    await startOnboarding(page);

    await tellTheChat(page, SENTENCE);
    await expect(page.getByRole("combobox", { name: /Timezone/ })).toHaveValue(/Lisbon/);
    await expect(page.getByText("Filled from chat")).toHaveCount(2);
    await expect(page.getByText("Time zone: Lisbon · Currency: EUR")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Time zone and currency filled from chat");
    expect(requests[0]?.step).toBe("locationTime");
    expect(requests[0]?.messages).toEqual([{ role: "user", content: SENTENCE }]);

    await page.getByRole("button", { name: "Next" }).click();
    // Hours have no chat yet: the step shows its form only.
    await expect(page.getByRole("log")).toHaveCount(0);
    await page.getByRole("button", { name: "Dinner" }).click();
    await page.getByRole("button", { name: "Weekdays" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByRole("log")).toBeVisible();
    await tellTheChat(page, SENTENCE);
    await expect(page.getByRole("spinbutton", { name: /^Largest party/ })).toHaveValue("12");
    await expect(page.getByRole("spinbutton", { name: /^Days ahead/ })).toHaveValue("60");
    expect(requests[1]?.step).toBe("settings");
    // A fresh conversation per step: nothing from the location step rides along.
    expect(requests[1]?.messages).toHaveLength(1);

    expect(venueCreates).toEqual([]);
  });

  test("a hand edit reaches the chat on its next turn", async ({ mockedPage: page }) => {
    const requests = await mockOnboardingChat(page);
    await startOnboarding(page);

    await page.getByLabel("Timezone").fill("America/New_York");
    await page.getByRole("option", { name: "Eastern Time (America/New_York)" }).click();
    await tellTheChat(page, "and we take cards");

    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]?.draft.ianaTimezone).toBe("America/New_York");
  });

  test("the cost ceiling steps the chat aside and the form carries on", async ({
    mockedPage: page,
  }) => {
    await page.route("**/api/gen/onboarding", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: ndjson({ type: "onboarding_ceiling", fallback: "form", ceilingUsd: 0.05 }),
      })
    );
    await startOnboarding(page);

    await tellTheChat(page, SENTENCE);

    await expect(page.getByText("Let's finish this step with the form.").first()).toBeVisible();
    await expect(page.getByRole("log")).toHaveCount(0);
    await page.getByLabel("Timezone").fill("Europe/Lisbon");
    await page.getByRole("option", { name: "Western European (Europe/Lisbon)" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("button", { name: "Dinner" })).toBeVisible();
  });

  test("on a phone the chat leads, the form sits directly below, and nothing overflows", async ({
    mockedPage: page,
  }) => {
    await mockOnboardingChat(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await startOnboarding(page);

    const chat = await page.getByRole("log").boundingBox();
    const form = await page.getByLabel("Timezone").boundingBox();
    expect(chat).not.toBeNull();
    expect(form).not.toBeNull();
    expect(chat!.y).toBeLessThan(form!.y);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
