# Vibes

Vibes shift Rialto's design language to match user intent. They work by overriding CSS custom properties on a container `<div>` — child components adapt automatically via the CSS cascade with zero runtime cost.

---

## The Three Presets

### `default`

Standard Rialto tokens. No overrides applied.

Use for: general-purpose UIs, content pages, dashboards.

### `transacting`

Tighter spacing, sharper radii, bolder weight. Creates urgency and precision.

| Token                     | Default | Transacting |
| ------------------------- | ------- | ----------- |
| `--rialto-space-sm`       | 12px    | 10px        |
| `--rialto-space-md`       | 16px    | 14px        |
| `--rialto-radius-default` | 6px     | 4px         |
| `--rialto-radius-soft`    | 10px    | 8px         |
| `--rialto-weight-medium`  | 500     | 600         |

Use for: checkout flows, payment forms, authentication, time-sensitive actions.

### `presenting`

More whitespace, larger type, softer radii. Creates breathing room and visual calm.

| Token                     | Default  | Presenting |
| ------------------------- | -------- | ---------- |
| `--rialto-space-md`       | 16px     | 20px       |
| `--rialto-space-lg`       | 24px     | 32px       |
| `--rialto-text-sm`        | 0.875rem | 0.9375rem  |
| `--rialto-radius-default` | 6px      | 8px        |
| `--rialto-radius-soft`    | 10px     | 14px       |

Use for: marketing pages, dashboards on large screens, demo/presentation mode, onboarding.

---

## How It Works

Vibes apply inline CSS custom property overrides on a wrapper `<div>`. Because Rialto components read tokens via `var(--rialto-*)`, the cascade automatically shifts every child component's spacing, radii, and weight — no prop drilling, no context consumption needed.

```
RialtoProvider (vibe="transacting")
  └─ <div style="--rialto-space-sm: 10px; --rialto-radius-default: 4px; ...">
       └─ Button reads var(--rialto-radius-default) → gets 4px instead of 6px
       └─ Card reads var(--rialto-radius-soft) → gets 8px instead of 10px
       └─ Input reads var(--rialto-space-sm) → gets 10px instead of 12px
```

---

## Usage

### Basic — Apply a vibe preset

```tsx
import { RialtoProvider } from "rialto";

<RialtoProvider vibe="transacting">
  <CheckoutPage />
</RialtoProvider>;
```

### Custom overrides — Fine-tune on top of a preset

```tsx
<RialtoProvider
  vibe="presenting"
  vibeOverrides={{
    "--rialto-space-lg": "40px",
    "--rialto-radius-soft": "16px",
  }}
>
  <MarketingPage />
</RialtoProvider>
```

Overrides merge on top of the vibe preset. You can override any `--rialto-*` token.

### With theme — Combine vibes and dark mode

```tsx
<RialtoProvider vibe="transacting" theme="dark">
  <App />
</RialtoProvider>
```

### Reading the environment — `useUIEnvironment`

```tsx
import { useUIEnvironment } from "rialto";

function MyComponent() {
  const { device, vibe, theme } = useUIEnvironment();

  // device: { pointer, viewport, reducedMotion, colorScheme, saveData }
  // vibe: "default" | "transacting" | "presenting"
  // theme: "light" | "dark"
}
```

---

## Choosing a Vibe

| Scenario                 | Vibe          | Why                                       |
| ------------------------ | ------------- | ----------------------------------------- |
| General app UI           | `default`     | Balanced spacing and radii                |
| Checkout / payment       | `transacting` | Tight layout reduces cognitive load       |
| Login / authentication   | `transacting` | Urgency, minimal distractions             |
| Marketing landing page   | `presenting`  | Breathing room, larger text, softer feel  |
| Dashboard on big screen  | `presenting`  | Data needs space to be scannable          |
| Demo / presentation mode | `presenting`  | Content-first, comfortable for projection |
| Admin panel / data entry | `transacting` | Dense, efficient, information-heavy       |
| Onboarding wizard        | `presenting`  | Relaxed pace, less overwhelming           |

---

## Creating Custom Vibes

Vibes are just `Record<string, string>` maps of CSS custom property overrides. You can create your own via `vibeOverrides`:

```tsx
const compactVibe = {
  "--rialto-space-xs": "6px",
  "--rialto-space-sm": "8px",
  "--rialto-space-md": "12px",
  "--rialto-radius-default": "3px",
  "--rialto-radius-soft": "6px",
};

<RialtoProvider vibeOverrides={compactVibe}>
  <DenseDataTable />
</RialtoProvider>;
```

### Tokens you can override

Any `--rialto-*` token works. The most impactful ones for vibes:

| Category | Tokens                                              |
| -------- | --------------------------------------------------- |
| Spacing  | `--rialto-space-xs` through `--rialto-space-3xl`    |
| Radii    | `--rialto-radius-sharp`, `default`, `soft`, `round` |
| Type     | `--rialto-text-xs` through `--rialto-text-2xl`      |
| Weight   | `--rialto-weight-light`, `--rialto-weight-medium`   |

---

## Architecture Notes

- Vibes are **build-time constant** — the preset maps are static objects, not computed
- The `<div>` wrapper applies overrides as inline `style` — no extra CSS files generated
- `useUIEnvironment()` provides the active vibe name for conditional logic (rarely needed — the cascade handles most cases)
- Vibes compose with dark mode: `data-theme` handles colors, vibes handle spacing/radii/weight
- Multiple `RialtoProvider` instances can nest — inner vibes override outer ones via the cascade
