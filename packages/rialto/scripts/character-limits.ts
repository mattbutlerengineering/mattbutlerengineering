/**
 * Rialto Component Character Limits
 *
 * Static map of component → prop → max characters.
 * Used by generate-manifest.ts to include limits in dist/manifest.json,
 * preventing AI-generated content from breaking layouts.
 *
 * Tiers:
 *   Short  (≤30)    — badges, labels, single-line controls
 *   Medium (31–120)  — titles, descriptions, hints
 *   Long   (121–500) — paragraphs, body text
 *   Unrestricted     — ReactNode slots (not listed here)
 */

export interface CharacterLimit {
  component: string;
  prop: string;
  max: number;
  reason: string;
}

export const characterLimits: CharacterLimit[] = [
  // ── Short (≤30) ──────────────────────────────
  {
    component: "Badge",
    prop: "children",
    max: 20,
    reason: "Inline status label; wrapping breaks layout",
  },
  {
    component: "Tag",
    prop: "children",
    max: 30,
    reason: "Chip label; must fit single line",
  },
  {
    component: "Kbd",
    prop: "children",
    max: 10,
    reason: "Keyboard shortcut text; very compact",
  },
  {
    component: "Button",
    prop: "children",
    max: 30,
    reason: "Button label; should be concise action verb",
  },
  {
    component: "Tabs",
    prop: "tabs[].label",
    max: 20,
    reason: "Tab labels share horizontal space",
  },
  {
    component: "Breadcrumb",
    prop: "items[].label",
    max: 25,
    reason: "Breadcrumb items share horizontal space",
  },
  {
    component: "Avatar",
    prop: "name",
    max: 30,
    reason: "Used for initials fallback; full name for alt text",
  },
  {
    component: "Stat",
    prop: "label",
    max: 25,
    reason: "Metric label; sits below the value",
  },
  {
    component: "Stat",
    prop: "value",
    max: 15,
    reason: "Metric value; must be scannable",
  },
  {
    component: "Stat",
    prop: "delta",
    max: 10,
    reason: "Trend delta; short numeric change",
  },
  {
    component: "SegmentedControl",
    prop: "segments[].label",
    max: 15,
    reason: "Segments share fixed horizontal space",
  },
  {
    component: "Steps",
    prop: "steps[].label",
    max: 20,
    reason: "Step labels share horizontal space",
  },
  {
    component: "Pagination",
    prop: "aria-label",
    max: 30,
    reason: "Screen reader label; concise context",
  },
  {
    component: "Meter",
    prop: "label",
    max: 25,
    reason: "Gauge label; sits beside or below bar",
  },
  {
    component: "Toggle",
    prop: "label",
    max: 30,
    reason: "Switch label; single line beside control",
  },
  {
    component: "Checkbox",
    prop: "label",
    max: 30,
    reason: "Checkbox label; single line beside control",
  },
  {
    component: "Radio",
    prop: "label",
    max: 30,
    reason: "Radio option label; single line beside control",
  },

  // ── Medium (31–120) ──────────────────────────
  {
    component: "Input",
    prop: "label",
    max: 40,
    reason: "Form field label; above input",
  },
  {
    component: "Input",
    prop: "hint",
    max: 80,
    reason: "Helper text below input; 1-2 lines",
  },
  {
    component: "Input",
    prop: "error",
    max: 80,
    reason: "Error message below input; must be actionable",
  },
  {
    component: "TextArea",
    prop: "label",
    max: 40,
    reason: "Form field label; above textarea",
  },
  {
    component: "NumberInput",
    prop: "label",
    max: 40,
    reason: "Form field label; above input",
  },
  {
    component: "Select",
    prop: "label",
    max: 40,
    reason: "Form field label; above select trigger",
  },
  {
    component: "PinInput",
    prop: "label",
    max: 40,
    reason: "Form field label; above pin cells",
  },
  {
    component: "Slider",
    prop: "label",
    max: 40,
    reason: "Form field label; above slider track",
  },
  {
    component: "RadioGroup",
    prop: "label",
    max: 40,
    reason: "Group label (fieldset legend)",
  },
  {
    component: "Toast",
    prop: "title",
    max: 50,
    reason: "Toast title; must be scannable in ~4s",
  },
  {
    component: "Toast",
    prop: "description",
    max: 120,
    reason: "Toast body; readable before auto-dismiss",
  },
  {
    component: "Alert",
    prop: "title",
    max: 60,
    reason: "Alert heading; single line preferred",
  },
  {
    component: "Banner",
    prop: "title",
    max: 60,
    reason: "Banner heading; single line, full-width",
  },
  {
    component: "Dialog",
    prop: "title",
    max: 60,
    reason: "Dialog heading; fits modal header",
  },
  {
    component: "Dialog",
    prop: "description",
    max: 120,
    reason: "Dialog subtitle; 1-2 lines below title",
  },
  {
    component: "ConfirmDialog",
    prop: "title",
    max: 60,
    reason: "Confirmation heading; clear and direct",
  },
  {
    component: "ConfirmDialog",
    prop: "description",
    max: 120,
    reason: "Confirmation body; explains consequences",
  },
  {
    component: "ConfirmDialog",
    prop: "confirmLabel",
    max: 20,
    reason: "Confirm button text; concise verb",
  },
  {
    component: "Drawer",
    prop: "title",
    max: 60,
    reason: "Drawer heading; fits panel header",
  },
  {
    component: "Card",
    prop: "title",
    max: 60,
    reason: "Card heading; single line",
  },
  {
    component: "Card",
    prop: "subtitle",
    max: 80,
    reason: "Card subheading; 1-2 lines below title",
  },
  {
    component: "EmptyState",
    prop: "title",
    max: 50,
    reason: "Empty state heading; centered, short",
  },
  {
    component: "Accordion",
    prop: "items[].title",
    max: 60,
    reason: "Accordion trigger label; single line",
  },
  {
    component: "Collapsible",
    prop: "label",
    max: 60,
    reason: "Collapsible trigger text; single line",
  },
  {
    component: "Tooltip",
    prop: "content",
    max: 80,
    reason: "Tooltip text; brief hint, no wrapping preferred",
  },
  {
    component: "Divider",
    prop: "label",
    max: 20,
    reason: 'Centered divider label; very short ("or", "and")',
  },
  {
    component: "Checkbox",
    prop: "description",
    max: 80,
    reason: "Help text below checkbox label",
  },
  {
    component: "Timeline",
    prop: "items[].title",
    max: 60,
    reason: "Event title; single line beside node",
  },

  // ── Long (121–500) ───────────────────────────
  {
    component: "Alert",
    prop: "children",
    max: 500,
    reason: "Alert body; paragraph-length contextual message",
  },
  {
    component: "EmptyState",
    prop: "description",
    max: 300,
    reason: "Empty state body; explains what to do next",
  },
  {
    component: "Timeline",
    prop: "items[].description",
    max: 200,
    reason: "Event description; supporting detail",
  },
  {
    component: "Steps",
    prop: "steps[].description",
    max: 80,
    reason: "Step description; sits below label",
  },
];
