// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { GuestSurface } from "../components/GuestSurface.js";
import { INDEXABLE_ROBOTS, PRIVATE_ROBOTS, useRobotsMeta } from "./useRobotsMeta.js";

function robots(): string | null {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
}

function Probe({ indexable }: { readonly indexable: boolean }) {
  useRobotsMeta(indexable);
  return null;
}

describe("useRobotsMeta", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="robots" content="index, follow" />';
  });

  it("keeps index, follow for the public landing", () => {
    render(<Probe indexable />);
    expect(robots()).toBe(INDEXABLE_ROBOTS);
    expect(robots()).toBe("index, follow");
  });

  it("sets noindex, nofollow for a non-landing route", () => {
    render(<Probe indexable={false} />);
    expect(robots()).toBe(PRIVATE_ROBOTS);
  });

  it("creates the tag when index.html has none", () => {
    document.head.innerHTML = "";
    render(<Probe indexable={false} />);
    expect(robots()).toBe("noindex, nofollow");
  });

  it("marks a guest surface (/book/:slug) noindex, nofollow", () => {
    render(
      <GuestSurface>
        <span>guest</span>
      </GuestSurface>
    );
    expect(robots()).toBe("noindex, nofollow");
  });
});
