import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";
import type { Table } from "@mbe/types";

/* Contact-shadow and theme-keyed chair behaviour (#7845). The Konva
 * primitives are DOM stand-ins that surface the shadow props under test. */

const toSpy = vi.fn();
const cacheSpy = vi.fn();
let reducedMotion = false;

vi.mock("@mattbutlerengineering/rialto/providers", () => ({
  useMotionPreset: () => ({
    reduced: reducedMotion,
    precision: reducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0, 0, 1, 1] },
  }),
}));

vi.mock("react-konva", () => {
  interface ShapeMockProps {
    name?: string;
    fill?: string;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetY?: number;
    shadowEnabled?: boolean;
    listening?: boolean;
  }
  function shapeMock(kind: string) {
    return function ShapeMock(props: ShapeMockProps) {
      return (
        <div
          data-testid={`konva-${kind}`}
          data-name={props.name}
          data-fill={props.fill}
          data-shadow-color={props.shadowColor}
          data-shadow-blur={props.shadowBlur}
          data-shadow-offset-y={props.shadowOffsetY}
          data-listening={String(props.listening)}
        />
      );
    };
  }
  const GroupMock = React.forwardRef(function GroupMock(
    { children, name }: { children?: React.ReactNode; name?: string },
    ref: React.Ref<unknown>
  ) {
    React.useEffect(() => {
      if (ref && typeof ref === "object" && "current" in ref) {
        (ref as React.MutableRefObject<unknown>).current = {
          to: toSpy,
          cache: cacheSpy,
        };
      }
    });
    return <div data-name={name}>{children}</div>;
  });
  return {
    Group: GroupMock,
    Rect: shapeMock("rect"),
    Circle: shapeMock("circle"),
    Line: shapeMock("line"),
    Path: shapeMock("path"),
    Label: GroupMock,
    Tag: shapeMock("tag"),
    Text: () => null,
  };
});

import { TableShape } from "./TableShape.js";
import { SEAT_NAME, SEAT_TONES, SHADOW_TONES, TABLE_SHADOW_NAME } from "./furniture-tokens.js";

const table: Table = {
  id: "t1",
  name: "Table 1",
  tableNumber: "T1",
  capacity: 4,
  minCovers: 1,
  maxCovers: 4,
  location: null,
  isActive: true,
  priority: 0,
  status: "AVAILABLE",
  venueId: "v1",
  floorPlanId: "fp1",
  shapeMetadata: { x: 100, y: 100, width: 80, height: 60, shape: "rectangle" },
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const props = {
  isSelected: false,
  isDragging: false,
  onSelect: vi.fn(),
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
};

const shadowNode = () =>
  document.querySelector<HTMLElement>(`[data-name="${TABLE_SHADOW_NAME}"]`) as HTMLElement;
const seatFrames = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-name="${SEAT_NAME}"] > [data-testid="konva-rect"]:first-child`
    )
  );

function setTheme(theme: "light" | "dark"): void {
  if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
}

describe("floor-plan contact shadows (#7845)", () => {
  beforeEach(() => {
    toSpy.mockClear();
    reducedMotion = false;
    setTheme("light");
  });
  afterEach(() => setTheme("light"));

  it("blurs the table's shadow node, not a hard offset copy", () => {
    render(<TableShape table={table} {...props} />);
    expect(Number(shadowNode().getAttribute("data-shadow-blur"))).toBeGreaterThan(0);
    expect(shadowNode().getAttribute("data-listening")).toBe("false");
  });

  it.each(["light", "dark"] as const)("tints the table shadow for the %s theme", (theme) => {
    setTheme(theme);
    render(<TableShape table={table} {...props} />);
    expect(shadowNode().getAttribute("data-shadow-color")).toBe(SHADOW_TONES[theme]);
  });

  it("gives every chair a soft shadow too", () => {
    render(<TableShape table={table} {...props} />);
    const frames = seatFrames();
    expect(frames).toHaveLength(4);
    for (const frame of frames) {
      expect(Number(frame.getAttribute("data-shadow-blur"))).toBeGreaterThan(0);
      expect(frame.getAttribute("data-shadow-color")).toBe(SHADOW_TONES.light);
    }
  });

  it.each(["light", "dark"] as const)("paints chair frames in the %s tone", (theme) => {
    setTheme(theme);
    render(<TableShape table={table} {...props} />);
    for (const frame of seatFrames()) {
      expect(frame.getAttribute("data-fill")).toBe(SEAT_TONES[theme].frame);
    }
  });

  it("re-resolves shadow and chair tones when the theme flips, without a remount", async () => {
    render(<TableShape table={table} {...props} />);
    expect(shadowNode().getAttribute("data-shadow-color")).toBe(SHADOW_TONES.light);

    setTheme("dark");

    await waitFor(() => {
      expect(shadowNode().getAttribute("data-shadow-color")).toBe(SHADOW_TONES.dark);
    });
    expect(seatFrames()[0]?.getAttribute("data-fill")).toBe(SEAT_TONES.dark.frame);
  });
});

describe("drag shadow motion (#7845)", () => {
  beforeEach(() => {
    toSpy.mockClear();
    reducedMotion = false;
  });

  it("animates the drag shadow over the motion preset's duration", () => {
    render(<TableShape table={table} {...props} isDragging />);
    expect(toSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ shadowBlur: 10, duration: 0.15 })
    );
  });

  it("lands the drag shadow instantly under reduced motion", () => {
    reducedMotion = true;
    render(<TableShape table={table} {...props} isDragging />);
    expect(toSpy).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0 }));
  });
});

describe("static furniture is cached per table (#7845)", () => {
  beforeEach(() => {
    cacheSpy.mockClear();
    setTheme("light");
  });
  afterEach(() => {
    setTheme("light");
    vi.unstubAllGlobals();
  });

  it("caches the table group once drawn, so a drag frame blits a bitmap", () => {
    render(<TableShape table={table} {...props} />);
    expect(cacheSpy).toHaveBeenCalledTimes(1);
  });

  it("renders the bitmap at device pixels times the stage scale so it stays sharp", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    render(<TableShape table={table} {...props} stageScale={1.5} />);
    expect(cacheSpy).toHaveBeenLastCalledWith(expect.objectContaining({ pixelRatio: 3 }));
  });

  it("re-caches when the theme flips, since the baked shadow and chair tones change", async () => {
    const baked: Array<string | null> = [];
    cacheSpy.mockImplementation(() => baked.push(shadowNode().getAttribute("data-shadow-color")));
    render(<TableShape table={table} {...props} />);
    setTheme("dark");
    // The last bake must see the dark tone already painted, or the bitmap keeps the old theme.
    await waitFor(() => expect(baked.at(-1)).toBe(SHADOW_TONES.dark));
    cacheSpy.mockReset();
  });

  it("re-caches when the table's look changes, so the bitmap is never stale", () => {
    const { rerender } = render(<TableShape table={table} {...props} />);
    cacheSpy.mockClear();
    rerender(<TableShape table={table} {...props} isSelected />);
    expect(cacheSpy).toHaveBeenCalledTimes(1);
  });
});
