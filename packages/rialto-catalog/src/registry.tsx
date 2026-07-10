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
 * Note on prop types: `defineRegistry` receives each component function as a
 * `ComponentFn<C, K>` where props are typed as the Zod output type for that
 * component. Because the catalog's generics are complex, we accept `any` typed
 * context parameters — runtime safety is provided by the Zod schemas in the
 * catalog (validated at generation time), not by TypeScript here.
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

// Toast is intentionally omitted from this registry.
// Toast uses the useToast() hook pattern (a provider, not a rendered element)
// and cannot be instantiated as a declarative component from a JSON spec.
// AI-generated specs should use the navigate/validateForm actions instead
// of trying to render Toast directly.

export const { registry, handlers, executeAction } = defineRegistry(catalog, {
  components: {
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
    Button: ({ props, children, emit }: any) => (
      <Button
        variant={props.variant}
        size={props.size}
        disabled={props.disabled}
        onClick={() => emit("press")}
      >
        {children ?? props.label}
      </Button>
    ),

    // IconButton is a labelled, icon-only Button. Its props are validated by
    // the generated Zod schema before this renderer runs (see file header),
    // so the shape is guaranteed; the cast narrows the untyped props bag
    // (mirrors the Odometer renderer, avoiding an `any` here).
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
        options={props.options ?? []}
        placeholder={props.placeholder}
        value={props.value}
        onChange={() => emit("change")}
      />
    ),

    // Combobox mirrors Select but adds multi-select. Props are validated by the
    // generated Zod schema before this renderer runs (see file header); the cast
    // narrows the untyped props bag (mirrors IconButton, avoiding an `any`).
    Combobox: ({ props, emit }: { props: unknown; emit: (event: string) => void }) => {
      const p = props as {
        label?: string;
        options?: { value: string; label: string; disabled?: boolean }[];
        placeholder?: string;
        value?: string;
        multiple?: boolean;
      };
      return (
        <Combobox
          label={p.label}
          options={p.options ?? []}
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
    // Rialto Tabs uses `tabs` (Tab[]) and `defaultTab` props.
    // The catalog schema may use `items` / `defaultValue` for AI-friendly naming;
    // we accept both to be resilient to AI output variation.
    Tabs: ({ props }: any) => (
      <Tabs
        tabs={props.tabs ?? props.items ?? []}
        defaultTab={props.defaultTab ?? props.defaultValue}
      />
    ),

    Breadcrumb: ({ props }: any) => (
      <Breadcrumb items={props.items ?? []} maxItems={props.maxItems} />
    ),

    NavigationMenu: ({ props }: any) => <NavigationMenu items={props.items ?? []} />,

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
        columns={props.columns ?? []}
        data={props.data ?? []}
        rowKey={props.rowKey}
        density={props.density}
        striped={props.striped}
      />
    ),

    // DataTable mirrors Table but adds sorting + selection. Props are validated by
    // the generated Zod schema before this renderer runs (see file header); the
    // cast narrows the untyped props bag (mirrors IconButton, avoiding an `any`).
    DataTable: ({ props }: { props: unknown }) => {
      const p = props as {
        columns?: {
          key: string;
          header: string;
          sortable?: boolean;
          align?: "left" | "center" | "right";
          width?: string;
          rowHeader?: boolean;
        }[];
        data?: Record<string, unknown>[];
        rowKey?: (row: Record<string, unknown>) => string | number;
        density?: "compact" | "default" | "spacious";
        striped?: boolean;
        emptyMessage?: string;
        label?: string;
        selectionMode?: "single" | "multiple";
      };
      return (
        <DataTable
          columns={p.columns ?? []}
          data={p.data ?? []}
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
      <DataList items={props.items ?? []} orientation={props.orientation} striped={props.striped} />
    ),

    Odometer: ({ props }: { props: unknown }) => {
      // The catalog's generated Zod schema validates Odometer props before this
      // renderer runs (see file header), so the shape is guaranteed here.
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

    // EmptyState uses `heading` prop; catalog description mentions `title` as alias.
    EmptyState: ({ props, children }: any) => (
      <EmptyState heading={props.heading ?? props.title} description={props.description}>
        {children}
      </EmptyState>
    ),

    Accordion: ({ props }: any) => (
      <Accordion items={props.items ?? []} multiple={props.multiple} />
    ),

    // DepartureBoard cycles a string[] of phrases. `phrases` is an array, which
    // the schema generator omits from the Zod schema, so it is read defensively
    // from the untyped props bag alongside the typed timing/appearance fields.
    DepartureBoard: ({ props }: { props: unknown }) => {
      const p = (props ?? {}) as Partial<DepartureBoardProps>;
      const phrases = Array.isArray(p.phrases)
        ? p.phrases.filter((x): x is string => typeof x === "string")
        : [];
      return (
        <DepartureBoard
          phrases={phrases}
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
    Sidebar: ({ props }: any) => <Sidebar items={props.items ?? []} collapsed={props.collapsed} />,

    // AppBar uses named slots `logo` and `actions` instead of children.
    AppBar: ({ props }: any) => (
      <AppBar glass={props.glass} height={props.height} logo={props.logo} actions={props.actions} />
    ),

    Footer: ({ props, children }: any) => <Footer variant={props.variant}>{children}</Footer>,
  },

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
