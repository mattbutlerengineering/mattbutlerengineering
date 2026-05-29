---
name: new-component
description: Scaffold a new rialto design system component with all required files (component, CSS module, test, story, barrel export) following established conventions
disable-model-invocation: true
---

# /new-component — scaffold a rialto component

Creates a new component directory under `packages/rialto/src/components/<Name>/` with 5 files that follow the exact patterns used by existing rialto components (AppBar, Card, Button, etc.).

## Arguments

The user must provide:

- **Component name** (PascalCase, e.g., `InfoPanel`) — becomes the directory and file prefix

## Steps

1. **Validate the name.** Must be PascalCase (starts with uppercase letter, no hyphens/underscores). If not, ask the user to correct it.

2. **Check for conflicts.** Verify `packages/rialto/src/components/<Name>/` does not already exist. If it does, stop and tell the user.

3. **Create the 5 files** listed below in `packages/rialto/src/components/<Name>/`.

4. **Add the barrel export** to `packages/rialto/src/components/index.ts` — insert `export * from "./<Name>";` in alphabetical order among the existing exports.

5. **Remind the user** to run `pnpm --dir packages/rialto build` to auto-register the component via filesystem discovery in `lib-entrypoints.ts`. No other manual registration is needed.

## File templates

All templates use `<Name>` as a placeholder for the component name provided by the user.

### 1. `<Name>.tsx`

```tsx
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import styles from "./<Name>.module.css";

/**
 * <Name> component.
 *
 * @example
 * <<Name>>Content</<Name>>
 */
export interface <Name>Props
  extends Pick<
    HTMLAttributes<HTMLDivElement>,
    "id" | "aria-label" | "className" | "style"
  > {
  /** Primary content slot. */
  children?: ReactNode;
}

export const <Name> = forwardRef<HTMLDivElement, <Name>Props>(
  ({ children, className, ...props }, ref) => {
    const classes = [styles.root, className].filter(Boolean).join(" ");

    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  }
);

<Name>.displayName = "<Name>";
```

### 2. `<Name>.module.css`

```css
.root {
  font-family: var(--rialto-font-sans);
  color: var(--rialto-text-primary);
  background: var(--rialto-surface-elevated);
  border: 1px solid var(--rialto-border);
  border-radius: var(--rialto-radius-soft);
  padding: var(--rialto-space-md);
}
```

### 3. `<Name>.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { <Name> } from "./<Name>";

describe("<Name>", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(<<Name>>Hello</<Name>>);
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    it("renders without children", () => {
      const { container } = render(<<Name> />);
      expect(container.firstElementChild).toBeInTheDocument();
    });
  });

  describe("className and ref", () => {
    it("forwards additional className", () => {
      const { container } = render(<<Name> className="custom">Content</<Name>>);
      expect(container.firstElementChild?.className).toMatch(/custom/);
    });

    it("forwards ref to the root element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<<Name> ref={ref}>Ref</<Name>>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("accepts aria-label", () => {
      render(<<Name> aria-label="Info panel">Content</<Name>>);
      expect(screen.getByLabelText("Info panel")).toBeInTheDocument();
    });

    it("accepts id", () => {
      const { container } = render(<<Name> id="test-id">Content</<Name>>);
      expect(container.firstElementChild).toHaveAttribute("id", "test-id");
    });
  });
});
```

### 4. `<Name>.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { <Name> } from "./<Name>";

const meta: Meta<typeof <Name>> = {
  title: "Components/<Name>",
  component: <Name>,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof <Name>>;

export const Default: Story = {
  args: {
    children: "Default <Name> content",
  },
};

export const WithAriaLabel: Story = {
  args: {
    children: "<Name> with accessibility label",
    "aria-label": "Accessible <Name>",
  },
};
```

### 5. `index.ts`

```ts
export { <Name>, type <Name>Props } from "./<Name>";
```

## Rules

- **PascalCase only.** The component name must start with an uppercase letter and contain no hyphens, underscores, or spaces.
- **Do not add motion/animation.** The scaffold is intentionally minimal. The developer adds framer-motion if the component needs it.
- **Use rialto tokens exclusively.** No hardcoded colors, spacing, radii, or shadows. Every visual value comes from `var(--rialto-*)` tokens.
- **CSS logical properties.** Use `margin-inline-start`, `padding-inline-end`, etc. — never `margin-left` or `padding-right`.
- **forwardRef is mandatory.** Every rialto component uses `React.forwardRef`.
- **Export the Props interface.** Consumers need `<Name>Props` for generic wrappers.
- **Barrel export pattern.** Use named re-exports (`export { <Name>, type <Name>Props }`) not `export *` in the component's `index.ts`. The root `components/index.ts` uses `export *` to aggregate all components.

## After scaffolding

```bash
# Build to register the new component in the exports map
pnpm --dir packages/rialto build

# Verify the test passes
pnpm --dir packages/rialto test <Name>

# Typecheck
pnpm --dir packages/rialto typecheck
```

The build step regenerates `lib-entrypoints.ts` which auto-discovers component directories — no manual registration in `package.json` exports is needed.

## When to use

Use `/new-component` when:

- Adding a brand-new UI primitive to the rialto design system
- The component does not exist yet in `packages/rialto/src/components/`

Do NOT use for:

- Modifying an existing component (just edit it directly)
- Adding a page or feature to an app (those are not rialto components)
- Creating a one-off component inside an app — rialto is the shared design system
