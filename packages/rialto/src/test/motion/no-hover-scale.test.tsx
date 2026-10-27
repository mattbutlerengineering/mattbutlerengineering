/**
 * Motion policy: hover on high-frequency controls is colour/opacity only (CSS).
 * No `whileHover` scale ("boop") on Button, Toggle, Checkbox, Pagination,
 * SegmentedControl or Tag. Full-motion is stubbed so a boop would be a real
 * 1.03 scale, not the reduced-motion rest value.
 */
import { createElement, type ElementType } from "react";
import { render } from "@testing-library/react";
import type * as FramerMotion from "framer-motion";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { Pagination } from "../../components/Pagination";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Tag } from "../../components/Tag";
import { Toggle } from "../../components/Toggle";
import { stubMatchMedia } from "../match-media";

stubMatchMedia([]);

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  const cache = new Map<PropertyKey, unknown>();
  const motion = new Proxy(actual.motion, {
    get(target, key) {
      if (!cache.has(key)) {
        const Inner = Reflect.get(target, key) as ElementType;
        const Recorded = (props: { whileHover?: unknown }) =>
          createElement(Inner, {
            ...props,
            "data-while-hover": JSON.stringify(props.whileHover ?? null),
          });
        cache.set(key, Recorded);
      }
      return cache.get(key);
    },
  });
  return { ...actual, motion };
});

function hoverScales(root: ParentNode): number[] {
  return Array.from(root.querySelectorAll("[data-while-hover]"))
    .map((el) => JSON.parse(el.getAttribute("data-while-hover") ?? "null") as unknown)
    .filter((v): v is { scale: number } => typeof v === "object" && v !== null && "scale" in v)
    .map((v) => v.scale);
}

const noop = () => undefined;

const cases: Record<string, () => React.ReactElement> = {
  Button: () => <Button>Save</Button>,
  Toggle: () => <Toggle label="Notify" />,
  Checkbox: () => <Checkbox label="Agree" />,
  Pagination: () => <Pagination page={2} totalPages={5} onChange={noop} />,
  SegmentedControl: () => (
    <SegmentedControl
      segments={[
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ]}
      value="a"
      onChange={noop}
    />
  ),
  Tag: () => <Tag onClick={noop}>Vegan</Tag>,
  "Tag (dismissible)": () => (
    <Tag onClick={noop} dismissible onDismiss={noop}>
      Vegan
    </Tag>
  ),
};

describe("productive-tier hover: no scale", () => {
  it.each(Object.keys(cases))("%s declares no whileHover scale", (name) => {
    const { container } = render(cases[name]!());
    expect(hoverScales(container)).toEqual([]);
  });
});
