import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  AspectRatio: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

import { ShippedVideo } from "./ShippedVideo.js";

const video = {
  slug: "demo",
  src: "/videos/demo.mp4",
  title: "Demo tour",
  transcript: "What it is and what it does.",
  recordedAt: "2026-11-13",
};

describe("ShippedVideo", () => {
  it("renders a controlled, non-autoplaying video from the same-origin src", () => {
    const { container } = render(<ShippedVideo video={video} />);
    const el = container.querySelector("video");
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute("src", "/videos/demo.mp4");
    expect(el).toHaveAttribute("controls");
    expect(el).toHaveAttribute("preload", "metadata");
    expect(el).not.toHaveAttribute("autoplay");
    expect(el).toHaveAttribute("aria-label", "Demo tour");
  });

  it("offers the transcript in a collapsed disclosure", () => {
    const { container } = render(<ShippedVideo video={video} />);
    expect(screen.getByText("Transcript")).toBeInTheDocument();
    expect(screen.getByText("What it is and what it does.")).toBeInTheDocument();
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
  });
});
