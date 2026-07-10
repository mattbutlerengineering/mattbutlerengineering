/**
 * Accessibility test matrix — discovery-driven.
 *
 * The test matrix is derived from the fixture map in `component-fixtures.tsx`.
 * Adding a component to the components barrel without adding a fixture will
 * cause the guard test below to fail loudly, preventing silent coverage loss.
 *
 * Fixtures supply the minimum required props for each component so the axe
 * run has valid markup to analyze.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

import { COMPONENT_FIXTURES, SKIPPED_COMPONENTS } from "./component-fixtures";
import type { BarrelExportName } from "./component-fixtures";

// ── Guard: every barrel export must have a fixture or a skip entry ────────

/**
 * These are the barrel-exported component names.
 * Kept as a static list here so that:
 *   1. Adding a component to the barrel requires updating this list.
 *   2. A missing fixture triggers a test failure, not silent omission.
 *
 * To update: add the component name when you add it to components/index.ts.
 */
const BARREL_COMPONENT_NAMES: readonly BarrelExportName[] = [
  "Accordion",
  "Alert",
  "AppBar",
  "AspectRatio",
  "AuthMascot",
  "Autocomplete",
  "Avatar",
  "Badge",
  "Banner",
  "Breadcrumb",
  "Button",
  "Card",
  "Chalkboard",
  "ChatPanel",
  "Checkbox",
  "Collapsible",
  "Combobox",
  "CommandPalette",
  "ConfirmDialog",
  "ContextMenu",
  "DataList",
  "DataTable",
  "DepartureBoard",
  "Dialog",
  "DisabledTooltip",
  "Divider",
  "Drawer",
  "DropdownMenu",
  "EmptyState",
  "ErrorBoundary",
  "Ferrofluid",
  "FlipDot",
  "Footer",
  "Form",
  "FormField",
  "GlobalNav",
  "Heading",
  "Hero",
  "HoverCard",
  "IconButton",
  "ImageUpload",
  "Input",
  "InputGroup",
  "Kbd",
  "MasterOverride",
  "Meter",
  "Navbar",
  "NavigationMenu",
  "NumberInput",
  "Odometer",
  "PageHeader",
  "Pagination",
  "PinInput",
  "Popover",
  "Progress",
  "RadialGauge",
  "ScrollArea",
  "SegmentedControl",
  "Select",
  "Sidebar",
  "Skeleton",
  "Slider",
  "Spinner",
  "SplitFlap",
  "SplitScreenExit",
  "Stack",
  "Stat",
  "StatusLED",
  "Steps",
  "Table",
  "Tabs",
  "Tag",
  "TapeChart",
  "Text",
  "TextArea",
  "ThemeToggle",
  "Timeline",
  "Toast",
  "Toggle",
  "Tooltip",
  "Tree",
  "WatchLoader",
] as const;

describe("A11y matrix — fixture coverage guard", () => {
  it("every barrel component has either a fixture or an explicit skip entry", () => {
    const fixtureNames = new Set(Object.keys(COMPONENT_FIXTURES));
    const skippedNames = new Set(Object.keys(SKIPPED_COMPONENTS));

    const missing = BARREL_COMPONENT_NAMES.filter(
      (name) => !fixtureNames.has(name) && !skippedNames.has(name)
    );

    expect(missing, `Missing fixtures for: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("fixture map has no entries for unknown component names", () => {
    const knownNames = new Set<string>(BARREL_COMPONENT_NAMES);
    const unknownFixtures = Object.keys(COMPONENT_FIXTURES).filter((n) => !knownNames.has(n));
    const unknownSkipped = Object.keys(SKIPPED_COMPONENTS).filter((n) => !knownNames.has(n));

    expect(
      unknownFixtures,
      `Fixture map has unknown component names: ${unknownFixtures.join(", ")}`
    ).toHaveLength(0);
    expect(
      unknownSkipped,
      `Skip map has unknown component names: ${unknownSkipped.join(", ")}`
    ).toHaveLength(0);
  });
});

// ── Axe matrix: run vitest-axe on every fixture ──────────────────────────

describe("Accessibility — component matrix", () => {
  for (const [name, fixture] of Object.entries(COMPONENT_FIXTURES)) {
    it(name, async () => {
      const { container } = render(fixture.element);
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  }
});
