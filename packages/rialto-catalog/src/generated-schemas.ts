// AUTO-GENERATED -- do not edit. Run: pnpm --filter @mbe/rialto-catalog generate
import { z } from "zod";

export const generatedSchemas = {
  Accordion: z.object({
    multiple: z.boolean().optional(),
    headingLevel: z.enum(["h2", "h3", "h4", "h5", "h6"]).optional(),
  }),
  Alert: z.object({
    variant: z.enum(["info", "success", "warning", "error"]).optional(),
    title: z.string().max(60).optional(),
    dismissible: z.boolean().optional(),
    actions: z.string().optional(),
  }),
  AppBar: z.object({
    logo: z.string().optional(),
    actions: z.string().optional(),
    glass: z.boolean().optional(),
    height: z.string().max(20).optional(),
  }),
  AspectRatio: z.object({
    ratio: z.number().optional(),
  }),
  Avatar: z.object({
    src: z.string().optional(),
    alt: z.string().optional(),
    name: z.string().max(30).optional(),
    size: z.enum(["sm", "md", "lg", "xl"]).optional(),
    status: z.enum(["online", "offline", "busy", "away"]).optional(),
    transition: z.enum(["fade", "splitflap"]).optional(),
  }),
  Badge: z.object({
    variant: z.enum(["success", "warning", "error", "neutral", "accent"]).optional(),
    size: z.enum(["sm", "md"]).optional(),
    dot: z.boolean().optional(),
  }),
  Banner: z.object({
    variant: z.enum(["info", "warning", "error", "accent"]).optional(),
    dismissible: z.boolean().optional(),
    action: z.string().optional(),
  }),
  Breadcrumb: z.object({
    maxItems: z.number().optional(),
    separator: z.string().optional(),
  }),
  Button: z.object({
    variant: z.enum(["primary", "secondary", "ghost"]).optional(),
    size: z.enum(["sm", "md", "lg"]).optional(),
    isLoading: z.boolean().optional(),
    loadingText: z.string().optional(),
  }),
  Card: z.object({
    variant: z.enum(["elevated", "glass", "flat"]).optional(),
    tilt: z.boolean().optional(),
    title: z.string().max(60).optional(),
    subtitle: z.string().max(80).optional(),
  }),
  Checkbox: z.object({
    label: z.string().max(30).optional(),
    checked: z.boolean().optional(),
    required: z.boolean().optional(),
    indeterminate: z.boolean().optional(),
    disabled: z.boolean().optional(),
    disabledReason: z.string().optional(),
    description: z.string().max(80).optional(),
  }),
  DataList: z.object({
    orientation: z.enum(["horizontal", "vertical"]).optional(),
    striped: z.boolean().optional(),
  }),
  Dialog: z.object({
    open: z.boolean(),
    title: z.string().max(60).optional(),
    description: z.string().max(120).optional(),
    footer: z.string().optional(),
  }),
  Divider: z.object({
    orientation: z.enum(["horizontal", "vertical"]).optional(),
    label: z.string().max(20).optional(),
    accent: z.boolean().optional(),
    spacing: z.enum(["compact", "default", "spacious"]).optional(),
  }),
  EmptyState: z.object({
    icon: z.string().optional(),
    heading: z.string().max(50).optional(),
    description: z.string().max(300).optional(),
    action: z.string().optional(),
    variant: z.enum(["elevated", "flat"]).optional(),
    size: z.enum(["sm", "md"]).optional(),
  }),
  Footer: z.object({
    variant: z.enum(["minimal", "rich"]).optional(),
    logo: z.string().optional(),
    copyright: z.string().max(80).optional(),
  }),
  Input: z.object({
    label: z.string().max(40).optional(),
    hint: z.string().max(80).optional(),
    error: z.boolean().optional(),
    disabledReason: z.string().optional(),
    startIcon: z.string().optional(),
    endIcon: z.string().optional(),
    showOptional: z.boolean().optional(),
  }),
  NavigationMenu: z.object({}),
  Select: z.object({
    value: z.string().optional(),
    placeholder: z.string().optional(),
    label: z.string().max(40).optional(),
    hint: z.string().optional(),
    error: z.boolean().optional(),
    required: z.boolean().optional(),
    showOptional: z.boolean().optional(),
    disabled: z.boolean().optional(),
    disabledReason: z.string().optional(),
  }),
  Sidebar: z.object({
    collapsed: z.boolean().optional(),
  }),
  Stack: z.object({
    direction: z.enum(["column", "row"]).optional(),
    gap: z.enum(["sm", "md", "lg", "xl", "2xs", "xs", "2xl", "3xl"]).optional(),
    align: z.enum(["start", "center", "end", "stretch", "baseline"]).optional(),
    justify: z.enum(["start", "center", "end", "between"]).optional(),
    wrap: z.boolean().optional(),
  }),
  Table: z.object({
    density: z.enum(["compact", "default", "spacious"]).optional(),
    striped: z.boolean().optional(),
    emptyMessage: z.string().max(60).optional(),
  }),
  Tabs: z.object({
    defaultTab: z.string().optional(),
  }),
  Text: z.object({
    variant: z.enum(["body", "caption", "label", "detail", "display"]).optional(),
    color: z.enum(["success", "warning", "error", "accent", "primary", "secondary", "tertiary", "on-accent"]).optional(),
    align: z.enum(["center", "left", "right"]).optional(),
    mono: z.boolean().optional(),
    truncate: z.boolean().optional(),
  }),
  Toast: z.object({
    title: z.string().max(50),
    description: z.string().max(120).optional(),
    variant: z.enum(["default", "success", "error", "accent"]).optional(),
    duration: z.number().optional(),
  }),
  Toggle: z.object({
    label: z.string().max(30).optional(),
    checked: z.boolean().optional(),
    disabledReason: z.string().optional(),
  }),
} as const;
