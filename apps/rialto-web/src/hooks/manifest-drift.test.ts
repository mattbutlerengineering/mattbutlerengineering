/**
 * Drift guard: verifies that the forms, feedback, navigation, layout, and overlays
 * category components documented in the showcase have corresponding entries in the
 * compiled rialto manifest.
 *
 * When a component is added to a category but the manifest is not
 * regenerated, this test fails — preventing silent documentation drift.
 */
import { describe, it, expect } from "vitest";
import manifest from "@mattbutlerengineering/rialto/manifest";

/**
 * The component names documented in the forms showcase category.
 * Update this list only when adding or removing a forms page.
 */
const FORMS_COMPONENTS = [
  "Button",
  "Input",
  "TextArea",
  "NumberInput",
  "Checkbox",
  "RadioGroup",
  "Toggle",
  "Slider",
  "Select",
  "PinInput",
  "SegmentedControl",
  "Autocomplete",
  "InputGroup",
  "MasterOverride",
] as const;

/**
 * The component names documented in the feedback showcase category.
 * Update this list only when adding or removing a feedback page.
 */
const FEEDBACK_COMPONENTS = [
  "Alert",
  "Banner",
  "EmptyState",
  "Progress",
  "Spinner",
  "Skeleton",
  "SkeletonGroup",
] as const;

describe("manifest drift guard — forms category", () => {
  const manifestNames = new Set(manifest.components.map((c) => c.name));

  it.each(FORMS_COMPONENTS)("manifest contains props for forms component: %s", (componentName) => {
    expect(
      manifestNames.has(componentName),
      `Component "${componentName}" is documented in the forms showcase but missing from the rialto manifest. ` +
        `Run "pnpm build --filter @mattbutlerengineering/rialto" to regenerate the manifest.`
    ).toBe(true);
  });
});

describe("manifest drift guard — feedback category", () => {
  const manifestNames = new Set(manifest.components.map((c) => c.name));

  it.each(FEEDBACK_COMPONENTS)(
    "manifest contains props for feedback component: %s",
    (componentName) => {
      expect(
        manifestNames.has(componentName),
        `Component "${componentName}" is documented in the feedback showcase but missing from the rialto manifest. ` +
          `Run "pnpm build --filter @mattbutlerengineering/rialto" to regenerate the manifest.`
      ).toBe(true);
    }
  );
});

/**
 * The component names documented in the navigation showcase category.
 * Includes sub-types (NavItem) rendered alongside their parent component.
 * Update this list only when adding or removing a navigation page.
 */
const NAVIGATION_COMPONENTS = [
  "Breadcrumb",
  "Navbar",
  "NavigationMenu",
  "NavItem",
  "Pagination",
  "Sidebar",
  "Steps",
  "Tabs",
] as const;

/**
 * The component names documented in the layout showcase category.
 * Includes sub-types (AccordionItem) rendered alongside their parent component.
 * Update this list only when adding or removing a layout page.
 */
const LAYOUT_COMPONENTS = [
  "Accordion",
  "AccordionItem",
  "AspectRatio",
  "Collapsible",
  "Divider",
  "Footer",
  "Hero",
  "PageHeader",
  "ScrollArea",
  "SplitScreenExit",
  "Stack",
  "Text",
] as const;

/**
 * The component names documented in the overlays showcase category.
 * Includes sub-types (CommandItem) rendered alongside their parent component.
 * Note: DropdownMenu's "MenuItem Type" section has no manifest entry — that shape
 * is an internal union type, not a top-level component (documented exception).
 * Update this list only when adding or removing an overlays page.
 */
const OVERLAYS_COMPONENTS = [
  "CommandPalette",
  "CommandItem",
  "ConfirmDialog",
  "ContextMenu",
  "Dialog",
  "DisabledTooltip",
  "Drawer",
  "DropdownMenu",
  "HoverCard",
  "Popover",
  "Tooltip",
] as const;

describe("manifest drift guard — navigation category", () => {
  const manifestNames = new Set(manifest.components.map((c) => c.name));

  it.each(NAVIGATION_COMPONENTS)(
    "manifest contains props for navigation component: %s",
    (componentName) => {
      expect(
        manifestNames.has(componentName),
        `Component "${componentName}" is documented in the navigation showcase but missing from the rialto manifest. ` +
          `Run "pnpm build --filter @mattbutlerengineering/rialto" to regenerate the manifest.`
      ).toBe(true);
    }
  );
});

describe("manifest drift guard — layout category", () => {
  const manifestNames = new Set(manifest.components.map((c) => c.name));

  it.each(LAYOUT_COMPONENTS)(
    "manifest contains props for layout component: %s",
    (componentName) => {
      expect(
        manifestNames.has(componentName),
        `Component "${componentName}" is documented in the layout showcase but missing from the rialto manifest. ` +
          `Run "pnpm build --filter @mattbutlerengineering/rialto" to regenerate the manifest.`
      ).toBe(true);
    }
  );
});

describe("manifest drift guard — overlays category", () => {
  const manifestNames = new Set(manifest.components.map((c) => c.name));

  it.each(OVERLAYS_COMPONENTS)(
    "manifest contains props for overlays component: %s",
    (componentName) => {
      expect(
        manifestNames.has(componentName),
        `Component "${componentName}" is documented in the overlays showcase but missing from the rialto manifest. ` +
          `Run "pnpm build --filter @mattbutlerengineering/rialto" to regenerate the manifest.`
      ).toBe(true);
    }
  );
});
