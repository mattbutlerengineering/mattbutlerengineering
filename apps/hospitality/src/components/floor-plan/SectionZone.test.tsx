import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SectionZoneData } from "./SectionZone.js";
import { TEXTURE_PATTERN_SCALE } from "./floor-textures.js";
import {
  SECTION_LABEL_FALLBACKS,
  SECTION_LABEL_TOKENS,
  type SectionLabelTheme,
} from "./section-label-theme.js";
import { relativeLuminance, contrastRatio } from "../../test/png-luminance.js";

vi.mock("react-konva", () => ({
  Group: ({ children, name }: { children?: React.ReactNode; name?: string }) => (
    <div data-testid="zone" role="group" aria-label={name}>
      {children}
    </div>
  ),
  Rect: ({
    x,
    y,
    width,
    height,
    fill,
    opacity,
    listening,
    name,
    fillPatternImage,
    fillPatternRepeat,
    fillPatternScale,
  }: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fill?: string;
    opacity?: number;
    listening?: boolean;
    name?: string;
    fillPatternImage?: HTMLImageElement;
    fillPatternRepeat?: string;
    fillPatternScale?: { x: number; y: number };
  }) => (
    <div
      data-testid={name ?? "zone-rect"}
      data-x={x}
      data-y={y}
      data-width={width}
      data-height={height}
      data-fill={fill}
      data-opacity={opacity}
      data-listening={String(listening)}
      data-has-pattern={String(Boolean(fillPatternImage))}
      data-pattern-repeat={fillPatternRepeat}
      data-pattern-scale={fillPatternScale ? `${fillPatternScale.x},${fillPatternScale.y}` : ""}
    />
  ),
  Label: ({ children, name }: { children?: React.ReactNode; name?: string }) => (
    <div data-testid={name ?? "zone-label"}>{children}</div>
  ),
  Tag: ({ fill, opacity }: { fill?: string; opacity?: number }) => (
    <div data-testid="zone-label-plate" data-fill={fill} data-opacity={opacity} />
  ),
  Text: ({ text, fill }: { text: string; fill?: string }) => <span data-fill={fill}>{text}</span>,
}));

import {
  SectionZone,
  SECTION_LABEL_NAME,
  SECTION_TINT_NAME,
  SECTION_TEXTURE_NAME,
} from "./SectionZone.js";

const AXE = { rules: { "color-contrast": { enabled: false } } };
const zone: SectionZoneData = {
  id: "s1",
  name: "Patio",
  color: "#3366cc",
  x: 10,
  y: 20,
  width: 200,
  height: 150,
};

/** A loaded 64x64 image is all SectionZone needs; nothing reads its pixels. */
const texture = { width: 64, height: 64 } as HTMLImageElement;

describe("SectionZone", () => {
  it("draws a tinted rectangle at the zone's geometry with its name", () => {
    render(<SectionZone zone={zone} />);
    const rect = screen.getByTestId(SECTION_TINT_NAME);
    expect(rect.dataset.x).toBe("10");
    expect(rect.dataset.y).toBe("20");
    expect(rect.dataset.width).toBe("200");
    expect(rect.dataset.height).toBe("150");
    expect(rect.dataset.fill).toBe("#3366cc");
    expect(screen.getByText("Patio")).toBeTruthy();
  });

  it("never captures pointer events, so tables above it stay draggable", () => {
    render(<SectionZone zone={zone} />);
    expect(screen.getByTestId(SECTION_TINT_NAME).dataset.listening).toBe("false");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <SectionZone zone={zone} />
      </main>
    );
    expect((await axe(container, AXE)).violations).toEqual([]);
  });

  describe("floor texture", () => {
    it("renders nothing extra for a section with no material", () => {
      render(<SectionZone zone={zone} />);
      expect(screen.queryByTestId(SECTION_TEXTURE_NAME)).toBeNull();
    });

    it("paints the texture beneath the tint, over the zone's own rectangle", () => {
      render(<SectionZone zone={zone} texture={texture} />);
      const painted = screen.getByTestId(SECTION_TEXTURE_NAME);
      expect(painted.dataset.hasPattern).toBe("true");
      expect(painted.dataset.patternRepeat).toBe("repeat");
      expect(painted.dataset.x).toBe("10");
      expect(painted.dataset.y).toBe("20");
      expect(painted.dataset.width).toBe("200");
      expect(painted.dataset.height).toBe("150");
      expect(painted.dataset.listening).toBe("false");
      // No solid fill: Konva's fill falls through to the pattern only when no colour is set.
      expect(painted.dataset.fill).toBeUndefined();

      const order = [...screen.getByTestId("zone").children].map((c) =>
        c.getAttribute("data-testid")
      );
      expect(order.indexOf(SECTION_TEXTURE_NAME)).toBeLessThan(order.indexOf(SECTION_TINT_NAME));
    });

    it("scales the pattern in canvas units, independently of the stage zoom", () => {
      render(<SectionZone zone={zone} texture={texture} />);
      // A zoom-derived scale is what makes a Konva pattern slide and smear; this
      // constant keeps the pattern in the same space as the geometry it fills.
      expect(screen.getByTestId(SECTION_TEXTURE_NAME).dataset.patternScale).toBe(
        `${TEXTURE_PATTERN_SCALE.x},${TEXTURE_PATTERN_SCALE.y}`
      );
    });

    it("still shows the flat colour under a texture, so the section stays identifiable", () => {
      render(<SectionZone zone={zone} texture={texture} />);
      expect(screen.getByTestId(SECTION_TINT_NAME).dataset.fill).toBe("#3366cc");
    });
  });

  describe("name legibility over a texture", () => {
    it("sits on a fully opaque plate, so no texture pixel reaches the text", () => {
      const theme: SectionLabelTheme = { plate: "#f8f6f3", text: "#1a1918" };
      render(<SectionZone zone={zone} texture={texture} labelTheme={theme} />);
      const plate = screen.getByTestId("zone-label-plate");
      expect(plate.dataset.fill).toBe("#f8f6f3");
      // Absent or 1 both mean opaque; anything lower would let the floor through.
      expect(plate.dataset.opacity).toBeUndefined();
      expect(screen.getByText("Patio").dataset.fill).toBe("#1a1918");
    });

    it("is drawn above both the texture and the tint", () => {
      render(<SectionZone zone={zone} texture={texture} />);
      const order = [...screen.getByTestId("zone").children].map((c) =>
        c.getAttribute("data-testid")
      );
      expect(order.indexOf(SECTION_LABEL_NAME)).toBeGreaterThan(order.indexOf(SECTION_TINT_NAME));
    });
  });
});

/* ── Rialto token drift guard + measured plate contrast ──────────────
 * Reads the real token source rather than mirroring hex values here, the same
 * way TableShape.test.tsx does for the table fills. */
const RIALTO_COLORS_CSS = resolve(process.cwd(), "../../packages/rialto/src/tokens/colors.css");

function readToken(tokenName: string, theme: "light" | "dark"): string {
  const css = readFileSync(RIALTO_COLORS_CSS, "utf-8");
  const selector = theme === "light" ? ":root" : '\\[data-theme="dark"\\]';
  const block = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  const value = block.match(new RegExp(`${tokenName}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Token ${tokenName} not found in ${theme} block`);
  return value.trim();
}

/** Parses `#rrggbb` or `rgb(r g b / a)` into 8-bit channels plus alpha. */
function parseColor(value: string): { r: number; g: number; b: number; a: number } {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
  }
  const rgb = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/);
  if (!rgb) throw new Error(`Unparseable colour: ${value}`);
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
    a: rgb[4] === undefined ? 1 : Number(rgb[4]),
  };
}

/** Luminance of `over` composited onto the opaque `under`. */
function compositedLuminance(over: string, under: string): number {
  const fg = parseColor(over);
  const bg = parseColor(under);
  const mix = (f: number, b: number) => f * fg.a + b * (1 - fg.a);
  return relativeLuminance(mix(fg.r, bg.r), mix(fg.g, bg.g), mix(fg.b, bg.b));
}

describe("section label theme", () => {
  it.each(["light", "dark"] as const)("matches the live rialto tokens in %s", (theme) => {
    expect(SECTION_LABEL_FALLBACKS[theme]).toEqual({
      plate: readToken(SECTION_LABEL_TOKENS.plate, theme),
      text: readToken(SECTION_LABEL_TOKENS.text, theme),
    });
  });

  it.each(["light", "dark"] as const)("clears WCAG AA on its plate in %s", (theme) => {
    const { plate, text } = SECTION_LABEL_FALLBACKS[theme];
    expect(parseColor(plate).a).toBe(1); // an opaque plate is what makes this texture-independent
    const ratio = contrastRatio(
      compositedLuminance(text, plate),
      compositedLuminance(plate, plate)
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
