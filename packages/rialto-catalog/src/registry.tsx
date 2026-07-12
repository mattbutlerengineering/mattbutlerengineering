/**
 * Rialto Catalog Registry
 *
 * Client-side registry mapping component type names to Rialto React components.
 * This is the bridge between AI-generated JSON specs and rendered Rialto components.
 *
 * IMPORTANT: This file must remain client-safe.
 * - Only imports from @json-render/react (NOT @json-render/core)
 * - Does NOT import Zod
 * - Ships to the browser alongside React
 *
 * Prop validation runs at the registry seam: `withSchemaValidation` (below)
 * runs each element's alias-normalized props through the matching generated Zod
 * schema (`generatedSchemas`) via `safeParse` before the adapter is invoked. On
 * failure it renders a subtle, accessible inline fallback instead of calling the
 * adapter, so one malformed or incomplete element degrades on its own rather
 * than dereferencing a missing prop and throwing (which would blank the whole
 * preview). Adapters therefore accept `any`/narrowly-cast props and can trust
 * the shape once they run — the runtime guarantee comes from the seam, not from
 * TypeScript.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { defineRegistry } from "@json-render/react";
import {
  Accordion,
  Alert,
  AppBar,
  AspectRatio,
  Avatar,
  Badge,
  Banner,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Combobox,
  DataList,
  DataTable,
  DepartureBoard,
  Dialog,
  Divider,
  EmptyState,
  Footer,
  IconButton,
  Input,
  NavigationMenu,
  Odometer,
  Select,
  Sidebar,
  Stack,
  Table,
  Tabs,
  Text,
  Toggle,
} from "@mattbutlerengineering/rialto";
import type { DepartureBoardProps } from "@mattbutlerengineering/rialto";
import { catalog } from "./catalog.js";
import { catalogMeta } from "./generated-catalog.js";
import { generatedSchemas } from "./generated-schemas.js";
import type { ReactNode } from "react";

// Toast is intentionally omitted from this registry.
// Toast uses the useToast() hook pattern (a provider, not a rendered element)
// and cannot be instantiated as a declarative component from a JSON spec.
// AI-generated specs should use the navigate/validateForm actions instead
// of trying to render Toast directly.

/* ── Alias seam ──────────────────────────────────────────────────
 * ADR-013 moves prop aliases out of the adapters and into declarative
 * `aliases` maps on each `*.catalog.ts`, which flow into `catalogMeta`. The
 * helpers below are the single runtime that consumes them, so the declarative
 * maps stay load-bearing instead of drifting into dead data. */

/** Registry adapter shape: json-render invokes it with the resolved context. */
type AdapterFn = (context: AdapterContext) => ReactNode;

interface AdapterContext {
  readonly props: unknown;
  readonly children?: ReactNode;
  readonly emit: (event: string) => void;
  readonly on: (event: string) => unknown;
}

/**
 * Apply a component's declared AI prop aliases to a props bag: for each
 * `{ alias: canonical }` entry, copy the alias value onto the canonical prop
 * when the canonical is absent. Adapters therefore read only canonical prop
 * names — changing a declared alias changes real behaviour. Array-of-object
 * props are validated at the seam by `withSchemaValidation` against the generated
 * Zod schema, so a malformed element renders a fallback instead of reaching an
 * adapter — which is why the adapters no longer need `?? []` fallbacks.
 */
function applyAliases(name: string, props: unknown): unknown {
  const aliases = catalogMeta[name]?.aliases;
  if (!aliases || props === null || typeof props !== "object") return props;
  const source = props as Record<string, unknown>;
  let next: Record<string, unknown> | undefined;
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (source[canonical] === undefined && source[alias] !== undefined) {
      next ??= { ...source };
      next[canonical] = source[alias];
    }
  }
  return next ?? props;
}

/**
 * Wrap every adapter so declared aliases are normalized at the seam, before the
 * adapter runs. Rebuilds the map structurally, preserving keys and adapters.
 */
function withAliasNormalization<T extends Record<string, AdapterFn>>(adapters: T): T {
  const wrapped: Record<string, AdapterFn> = {};
  for (const [name, adapter] of Object.entries<AdapterFn>(adapters)) {
    wrapped[name] = (context) =>
      adapter({ ...context, props: applyAliases(name, context.props) });
  }
  // The structural rebuild erases the literal's per-key types; re-assert the
  // caller's shape so defineRegistry keeps checking each adapter against its
  // catalog key.
  return wrapped as unknown as T;
}

/**
 * Subtle, accessible placeholder rendered at the seam when an element's
 * normalized props fail schema validation. Keeping the failure here isolates it
 * to the single element instead of letting an adapter dereference a missing
 * array prop and throw — which would otherwise blank the whole preview.
 */
function SeamFallback({ name }: { name: string }): ReactNode {
  return (
    <span
      role="note"
      data-rialto-seam-fallback={name}
      style={{
        color: "var(--rialto-text-tertiary)",
        fontSize: "var(--rialto-text-xs)",
      }}
    >
      Component could not be displayed
    </span>
  );
}

/**
 * Wrap every adapter so its alias-normalized props are validated against the
 * matching generated Zod schema before the adapter runs. On success the adapter
 * is invoked unchanged; on failure a per-element {@link SeamFallback} is rendered
 * instead, so a malformed or incomplete element degrades on its own rather than
 * throwing. Components without a generated schema pass through unchanged.
 *
 * Compose as `withAliasNormalization(withSchemaValidation(...))` so props are
 * alias-normalized first, then validated, then handed to the adapter.
 */
function withSchemaValidation<T extends Record<string, AdapterFn>>(adapters: T): T {
  const wrapped: Record<string, AdapterFn> = {};
  for (const [name, adapter] of Object.entries<AdapterFn>(adapters)) {
    const schema = generatedSchemas[name as keyof typeof generatedSchemas];
    if (!schema) {
      wrapped[name] = adapter;
      continue;
    }
    wrapped[name] = (context) =>
      schema.safeParse(context.props).success ? adapter(context) : <SeamFallback name={name} />;
  }
  // The structural rebuild erases the literal's per-key types; re-assert the
  // caller's shape so defineRegistry keeps checking each adapter against its
  // catalog key.
  return wrapped as unknown as T;
}

export const { registry, handlers, executeAction } = defineRegistry(catalog, {
  components: withAliasNormalization(withSchemaValidation({
    // ── Layout ────────────────────────────────────────────────────
    Stack: ({ props, children }: any) => (
      <Stack
        direction={props.direction}
        gap={props.gap}
        align={props.align}
        justify={props.justify}
      >
        {children}
      </Stack>
    ),

    Card: ({ props, children }: any) => (
      <Card variant={props.variant} tilt={props.tilt} title={props.title} subtitle={props.subtitle}>
        {children}
      </Card>
    ),

    Divider: ({ props }: any) => <Divider orientation={props.orientation} label={props.label} />,

    AspectRatio: ({ props, children }: any) => (
      <AspectRatio ratio={props.ratio}>{children}</AspectRatio>
    ),

    // ── Typography ────────────────────────────────────────────────
    Text: ({ props, children }: any) => (
      <Text variant={props.variant} color={props.color} align={props.align} as={props.as}>
        {children}
      </Text>
    ),

    Badge: ({ props, children }: any) => (
      <Badge variant={props.variant} size={props.size} dot={props.dot}>
        {children}
      </Badge>
    ),

    Avatar: ({ props }: any) => (
      <Avatar
        src={props.src}
        alt={props.alt}
        name={props.name}
        size={props.size}
        status={props.status}
      />
    ),

    // ── Forms ─────────────────────────────────────────────────────
    // The `label` alias is declared in Button.catalog.ts as an alias for the
    // `children` slot; the seam normalizes it onto `props.children`, so the
    // adapter falls back to `props.children` when no slot children are given.
    Button: ({ props, children, emit }: any) => (
      <Button
        variant={props.variant}
        size={props.size}
        disabled={props.disabled}
        onClick={() => emit("press")}
      >
        {children ?? props.children}
      </Button>
    ),

    // IconButton is a labelled, icon-only Button. The registry seam
    // (`withSchemaValidation`) validates its props against the generated Zod
    // schema before this adapter runs, so the shape is guaranteed here; the cast
    // narrows the untyped props bag (mirrors the Odometer renderer, avoiding an
    // `any` here).
    IconButton: ({ props, emit }: { props: unknown; emit: (event: string) => void }) => {
      const p = props as {
        icon?: string;
        "aria-label": string;
        variant?: "primary" | "secondary" | "ghost";
        size?: "sm" | "md" | "lg";
      };
      return (
        <IconButton
          icon={p.icon ?? "×"}
          aria-label={p["aria-label"]}
          variant={p.variant}
          size={p.size}
          onClick={() => emit("press")}
        />
      );
    },

    Input: ({ props }: any) => (
      <Input
        label={props.label}
        hint={props.hint}
        error={props.error}
        type={props.type}
        placeholder={props.placeholder}
      />
    ),

    Select: ({ props, emit }: any) => (
      <Select
        label={props.label}
        options={props.options}
        placeholder={props.placeholder}
        value={props.value}
        onChange={() => emit("change")}
      />
    ),

    // Combobox mirrors Select but adds multi-select. The registry seam
    // (`withSchemaValidation`) validates its props before this adapter runs; the
    // cast narrows the untyped props bag (mirrors IconButton, avoiding an `any`).
    Combobox: ({ props, emit }: { props: unknown; emit: (event: string) => void }) => {
      const p = props as {
        label?: string;
        options: { value: string; label: string; disabled?: boolean }[];
        placeholder?: string;
        value?: string;
        multiple?: boolean;
      };
      return (
        <Combobox
          label={p.label}
          options={p.options}
          placeholder={p.placeholder}
          value={p.value}
          multiple={p.multiple}
          onChange={() => emit("change")}
          onValuesChange={() => emit("change")}
        />
      );
    },

    Toggle: ({ props, emit }: any) => (
      <Toggle
        label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={() => emit("change")}
      />
    ),

    Checkbox: ({ props, emit }: any) => (
      <Checkbox
        label={props.label}
        description={props.description}
        checked={props.checked}
        indeterminate={props.indeterminate}
        disabled={props.disabled}
        onCheckedChange={() => emit("change")}
      />
    ),

    // ── Navigation ────────────────────────────────────────────────
    // Rialto Tabs uses `tabs` (Tab[]) and `defaultTab` props. The AI-facing
    // `items` / `defaultValue` aliases are declared in Tabs.catalog.ts and
    // normalized at the seam (see withAliasNormalization), so this adapter
    // reads only the canonical props.
    Tabs: ({ props }: any) => (
      <Tabs
        tabs={props.tabs}
        defaultTab={props.defaultTab}
      />
    ),

    Breadcrumb: ({ props }: any) => (
      <Breadcrumb items={props.items} maxItems={props.maxItems} />
    ),

    NavigationMenu: ({ props }: any) => <NavigationMenu items={props.items} />,

    // ── Feedback ──────────────────────────────────────────────────
    Alert: ({ props, children, emit }: any) => (
      <Alert
        variant={props.variant}
        title={props.title}
        dismissible={props.dismissible}
        onDismiss={props.dismissible ? () => emit("dismiss") : undefined}
      >
        {children}
      </Alert>
    ),

    Banner: ({ props, children, emit }: any) => (
      <Banner
        variant={props.variant}
        dismissible={props.dismissible}
        onDismiss={props.dismissible ? () => emit("dismiss") : undefined}
      >
        {children}
      </Banner>
    ),

    Dialog: ({ props, children, emit }: any) => (
      <Dialog
        open={props.open ?? false}
        onClose={() => emit("close")}
        title={props.title}
        description={props.description}
      >
        {children}
      </Dialog>
    ),

    // Toast is excluded — see comment at top of file.

    // ── Data Display ──────────────────────────────────────────────
    Table: ({ props }: any) => (
      <Table
        columns={props.columns}
        data={props.data}
        rowKey={props.rowKey}
        density={props.density}
        striped={props.striped}
      />
    ),

    // DataTable mirrors Table but adds sorting + selection. The registry seam
    // (`withSchemaValidation`) validates its props before this adapter runs; the
    // cast narrows the untyped props bag (mirrors IconButton, avoiding an `any`).
    DataTable: ({ props }: { props: unknown }) => {
      const p = props as {
        columns: {
          key: string;
          header: string;
          sortable?: boolean;
          align?: "left" | "center" | "right";
          width?: string;
          rowHeader?: boolean;
        }[];
        data: Record<string, unknown>[];
        rowKey?: (row: Record<string, unknown>) => string | number;
        density?: "compact" | "default" | "spacious";
        striped?: boolean;
        emptyMessage?: string;
        label?: string;
        selectionMode?: "single" | "multiple";
      };
      return (
        <DataTable
          columns={p.columns}
          data={p.data}
          rowKey={p.rowKey ?? ((row) => String(row.id ?? ""))}
          density={p.density}
          striped={p.striped}
          emptyMessage={p.emptyMessage}
          label={p.label}
          selectionMode={p.selectionMode}
        />
      );
    },

    DataList: ({ props }: any) => (
      <DataList items={props.items} orientation={props.orientation} striped={props.striped} />
    ),

    Odometer: ({ props }: { props: unknown }) => {
      // The registry seam (`withSchemaValidation`) validates Odometer props
      // against the generated Zod schema before this adapter runs, so the shape
      // is guaranteed here.
      const p = props as {
        value: number;
        size?: "sm" | "md" | "lg";
        flipInterval?: number;
        cascadeDelay?: number;
      };
      return (
        <Odometer
          value={p.value}
          size={p.size}
          flipInterval={p.flipInterval}
          cascadeDelay={p.cascadeDelay}
        />
      );
    },

    // EmptyState uses `heading`; the `title` alias is declared in
    // EmptyState.catalog.ts and normalized at the seam (see withAliasNormalization).
    EmptyState: ({ props, children }: any) => (
      <EmptyState heading={props.heading} description={props.description}>
        {children}
      </EmptyState>
    ),

    Accordion: ({ props }: any) => (
      <Accordion items={props.items} multiple={props.multiple} />
    ),

    // DepartureBoard cycles a string[] of phrases. The `phrases` array shape is
    // declared in DepartureBoard.catalog.ts propSchemas; the registry seam
    // (`withSchemaValidation`) validates it against the generated Zod schema
    // before this adapter runs; the cast narrows the untyped props bag (mirrors
    // the Odometer renderer).
    DepartureBoard: ({ props }: { props: unknown }) => {
      const p = props as {
        phrases: string[];
        holdMs?: number;
        flipInterval?: number;
        cascadeDelay?: number;
        charset?: DepartureBoardProps["charset"];
        size?: DepartureBoardProps["size"];
        length?: number;
      };
      return (
        <DepartureBoard
          phrases={p.phrases}
          holdMs={p.holdMs}
          flipInterval={p.flipInterval}
          cascadeDelay={p.cascadeDelay}
          charset={p.charset}
          size={p.size}
          length={p.length}
        />
      );
    },

    // ── App Shell ─────────────────────────────────────────────────
    Sidebar: ({ props }: any) => <Sidebar items={props.items} collapsed={props.collapsed} />,

    // AppBar uses named slots `logo` and `actions` instead of children.
    AppBar: ({ props }: any) => (
      <AppBar glass={props.glass} height={props.height} logo={props.logo} actions={props.actions} />
    ),

    Footer: ({ props, children }: any) => <Footer variant={props.variant}>{children}</Footer>,
  })),

  actions: {
    validateForm: async (_params: any, _setState: any) => {
      // Validation is handled client-side by the ValidationProvider context.
      // This action stub allows AI-generated specs to declare validateForm bindings.
    },
    navigate: async (params: any, _setState: any) => {
      const path = params?.path;
      if (path && typeof path === "string") {
        window.location.href = path;
      }
    },
  },
});
