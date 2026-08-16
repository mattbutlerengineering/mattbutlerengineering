# Vibes

Vibes shift Rialto's design language to match user intent. They work by overriding CSS custom properties on a container `<div>` — child components adapt automatically via the CSS cascade with zero runtime cost. The override map (`VibeOverrides`, a `Record<string, string>` of `--rialto-*` properties) is a real seam: **three adapters** feed it — a static `vibe` preset chosen by the caller, and two device-driven adapters derived at runtime from `device.saveData` (**reduced-data**) and `device.reducedMotion` (**reduced-motion**). All three produce the same kind of override map, so they compose through one path.

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

## The Reduced-Data Adapter

The `vibe` preset is one adapter feeding the override map; the **reduced-data adapter** is the second. It is derived at runtime from `device.saveData` — the browser's `prefers-reduced-data: reduce` signal, detected by `useDeviceContext`. When a user turns Save-Data on, Rialto tightens the spacing scale by roughly one step, trading whitespace for density so more content fits with less scrolling and paint. Only spacing tokens shift; radii, type, and colors are left alone.

| Token                | Default | Reduced-data |
| -------------------- | ------- | ------------ |
| `--rialto-space-sm`  | 12px    | 8px          |
| `--rialto-space-md`  | 16px    | 12px         |
| `--rialto-space-lg`  | 24px    | 16px         |
| `--rialto-space-xl`  | 32px    | 24px         |
| `--rialto-space-2xl` | 48px    | 32px         |
| `--rialto-space-3xl` | 64px    | 48px         |

This adapter is **automatic and additive**: it applies whenever `device.saveData` is `true` and is a no-op otherwise, so callers who do not use it are completely unaffected. It is exposed for direct use (e.g. tests or bespoke wiring) from the providers subpath:

```tsx
import { deriveReducedDataOverrides, reducedDataOverrides } from "rialto/providers";

// reducedDataOverrides — the compact spacing map (a VibeOverrides value)
// deriveReducedDataOverrides(device) — returns it when device.saveData is true, else {}
```

### Composition & precedence

`RialtoProvider` merges all three adapters plus the caller's explicit overrides into one inline `style`, in **low → high precedence** (later wins):

1. **`vibe` preset** — the static design-language adapter.
2. **reduced-data overrides** — device-driven (`device.saveData`).
3. **reduced-motion overrides** — device-driven (`device.reducedMotion`). Ranks above the preset deliberately: a vibe must never be able to re-impose motion on a user who asked for less of it.
4. **explicit `vibeOverrides`** — the caller's fine-tuning, always the final say.

So Save-Data tightens even a loose preset like `presenting` (step 2 wins over step 1), and reduced motion zeroes a preset's durations (step 3 wins over step 1), but a caller can still pin any single token through `vibeOverrides` (step 4 wins over everything). When every source is empty — `default` vibe, Save-Data off, reduced motion off, no overrides — no inline `style` is applied at all.

### The Reduced-Motion Adapter

The third adapter derives from `device.reducedMotion` — the browser's `prefers-reduced-motion: reduce` signal. When it is on, the duration scale collapses to `0s` and **nothing else changes**.

That restraint is the design. Motion is one channel of feedback, not the whole language: at zero duration a transition lands in a single frame instead of travelling, while the tokens that carry state through contrast, weight, and border are untouched — so an action still visibly answers. Easing tokens are left alone too; inert at zero duration, and clobbering them would lose information for no benefit.

```ts
// reducedMotionOverrides — --rialto-duration-fast | -standard | -slow, all "0s"
// deriveReducedMotionOverrides(device) — returns it when device.reducedMotion is true, else {}
```

**CSS is only half of it.** Custom properties cannot reach motion driven from JavaScript — a `framer-motion` config is a plain object. For that channel, components call `useMotionPreset()`, which resolves `precision` / `spring` / `springGentle` from the same signal and collapses them to `{ duration: 0 }` under reduced motion (springs are dropped, not shortened — a fast spring still overshoots). See ADR-025.

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

- Three adapters feed the override map behind one `VibeOverrides` interface: the `vibe` **preset** maps are build-time constants (static objects, not computed), while the **reduced-data** and **reduced-motion** adapters derive their overrides at runtime from `device.saveData` and `device.reducedMotion`
- The `<div>` wrapper applies overrides as inline `style` — no extra CSS files generated
- `useUIEnvironment()` provides the active vibe name for conditional logic (rarely needed — the cascade handles most cases)
- Vibes compose with dark mode: `data-theme` handles colors, vibes handle spacing/radii/weight
- Multiple `RialtoProvider` instances can nest — inner vibes override outer ones via the cascade
