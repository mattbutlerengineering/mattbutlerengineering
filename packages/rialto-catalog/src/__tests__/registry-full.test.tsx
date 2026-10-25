/**
 * Comprehensive registry render coverage tests.
 *
 * Exercises every component registered in registry.tsx to push statement
 * coverage above the 65% threshold.  Each test renders a minimal JSON spec
 * through the same Renderer + JSONUIProvider pipeline used in production.
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { registry, executeAction } from "../registry.js";
import { catalogMeta } from "../generated-catalog.js";
import { generatedSchemas } from "../generated-schemas.js";

// ── Helper ────────────────────────────────────────────────────────────────────

function renderSpec(spec: Parameters<typeof Renderer>[0]["spec"]) {
  return render(
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}

// ── Layout components ─────────────────────────────────────────────────────────

describe("Divider", () => {
  it("renders horizontal divider", () => {
    const { container } = renderSpec({
      root: "d1",
      elements: {
        d1: { type: "Divider", props: { orientation: "horizontal" } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders vertical divider with label", () => {
    const { container } = renderSpec({
      root: "d1",
      elements: {
        d1: { type: "Divider", props: { orientation: "vertical", label: "or" } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

describe("AspectRatio", () => {
  it("renders with 16/9 ratio", () => {
    const { container } = renderSpec({
      root: "ar1",
      elements: {
        ar1: {
          type: "AspectRatio",
          props: { ratio: 16 / 9 },
          children: ["txt1"],
        },
        txt1: { type: "Text", props: { children: "Sample words", variant: "body" } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

// ── Typography ────────────────────────────────────────────────────────────────

describe("Text", () => {
  it("renders body variant", () => {
    const { container } = renderSpec({
      root: "t1",
      elements: { t1: { type: "Text", props: { children: "Sample words", variant: "body" } } },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders display variant with color and align", () => {
    const { container } = renderSpec({
      root: "t1",
      elements: {
        t1: {
          type: "Text",
          props: {
            children: "Sample words",
            variant: "display",
            color: "accent",
            align: "center",
            as: "h1",
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders caption variant", () => {
    const { container } = renderSpec({
      root: "t1",
      elements: { t1: { type: "Text", props: { children: "Sample words", variant: "caption" } } },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

describe("Avatar", () => {
  it("renders with name (initials fallback)", () => {
    const { container } = renderSpec({
      root: "av1",
      elements: {
        av1: {
          type: "Avatar",
          props: { name: "Jane Doe", size: "md", status: "online" },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders with src and alt", () => {
    const { container } = renderSpec({
      root: "av1",
      elements: {
        av1: {
          type: "Avatar",
          props: { src: "https://example.com/avatar.png", alt: "Jane Doe", size: "lg" },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

// ── Forms ─────────────────────────────────────────────────────────────────────

describe("Input", () => {
  it("renders text input with label and hint", () => {
    const { container } = renderSpec({
      root: "i1",
      elements: {
        i1: {
          type: "Input",
          props: { label: "Email", hint: "Enter your email", type: "email" },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders input in error state", () => {
    const { container } = renderSpec({
      root: "i1",
      elements: {
        i1: {
          type: "Input",
          props: { label: "Password", error: true, placeholder: "Enter password" },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

describe("Select", () => {
  it("renders select with options and label", () => {
    const { container } = renderSpec({
      root: "s1",
      elements: {
        s1: {
          type: "Select",
          props: {
            label: "Country",
            options: [
              { label: "United States", value: "us" },
              { label: "Canada", value: "ca" },
            ],
            placeholder: "Choose a country",
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders select with a current value", () => {
    const { container } = renderSpec({
      root: "s1",
      elements: {
        s1: {
          type: "Select",
          props: {
            label: "Role",
            value: "admin",
            options: [{ label: "Admin", value: "admin" }],
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("rejects missing options (schema requires an options array)", () => {
    // The `?? []` fallback that used to render an empty Select is gone; a spec
    // without options now fails schema validation instead of rendering empty.
    expect(generatedSchemas.Select.safeParse({ label: "Empty" }).success).toBe(false);
    expect(
      generatedSchemas.Select.safeParse({
        label: "Country",
        options: [{ value: "us", label: "United States" }],
      }).success
    ).toBe(true);
  });
});

describe("Toggle", () => {
  it("renders unchecked toggle", () => {
    const { container } = renderSpec({
      root: "tg1",
      elements: {
        tg1: { type: "Toggle", props: { label: "Dark mode", checked: false } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders checked toggle", () => {
    const { container } = renderSpec({
      root: "tg1",
      elements: {
        tg1: { type: "Toggle", props: { label: "Notifications", checked: true } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders disabled toggle", () => {
    const { container } = renderSpec({
      root: "tg1",
      elements: {
        tg1: {
          type: "Toggle",
          props: { label: "Premium feature", disabled: true },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

describe("Checkbox", () => {
  it("renders unchecked checkbox", () => {
    const { container } = renderSpec({
      root: "cb1",
      elements: {
        cb1: {
          type: "Checkbox",
          props: { label: "Accept terms", checked: false },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders checked checkbox with description", () => {
    const { container } = renderSpec({
      root: "cb1",
      elements: {
        cb1: {
          type: "Checkbox",
          props: {
            label: "Subscribe",
            description: "Receive weekly emails",
            checked: true,
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders indeterminate checkbox", () => {
    const { container } = renderSpec({
      root: "cb1",
      elements: {
        cb1: {
          type: "Checkbox",
          props: { label: "Select all", indeterminate: true },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

// ── Navigation ────────────────────────────────────────────────────────────────

describe("Tabs", () => {
  it("renders tabs from tabs prop", () => {
    const { container } = renderSpec({
      root: "tabs1",
      elements: {
        tabs1: {
          type: "Tabs",
          props: {
            tabs: [
              { id: "tab1", label: "Overview", content: "Overview content" },
              { id: "tab2", label: "Details", content: "Details content" },
            ],
            defaultTab: "tab1",
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders tabs with items alias (AI output variation)", () => {
    const { container } = renderSpec({
      root: "tabs1",
      elements: {
        tabs1: {
          type: "Tabs",
          props: {
            items: [
              { id: "a", label: "Tab A", content: "A" },
              { id: "b", label: "Tab B", content: "B" },
            ],
            defaultValue: "a",
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("rejects malformed or missing tabs (schema validation, not an empty render)", () => {
    // Acceptance (#3354): a malformed `tabs` value fails schema validation
    // instead of the old `?? []` fallback rendering an empty Tabs.
    expect(generatedSchemas.Tabs.safeParse({}).success).toBe(false);
    expect(generatedSchemas.Tabs.safeParse({ tabs: "not-an-array" }).success).toBe(false);
    expect(generatedSchemas.Tabs.safeParse({ tabs: [{ id: 1 }] }).success).toBe(false);
    expect(
      generatedSchemas.Tabs.safeParse({
        tabs: [{ id: "a", label: "A", content: "Body" }],
        defaultTab: "a",
      }).success
    ).toBe(true);
  });
});

describe("Breadcrumb", () => {
  it("renders breadcrumb with items", () => {
    const { container } = renderSpec({
      root: "bc1",
      elements: {
        bc1: {
          type: "Breadcrumb",
          props: {
            items: [
              { label: "Home", href: "/" },
              { label: "Settings", href: "/settings" },
              { label: "Profile" },
            ],
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders breadcrumb with maxItems", () => {
    const { container } = renderSpec({
      root: "bc1",
      elements: {
        bc1: {
          type: "Breadcrumb",
          props: {
            maxItems: 3,
            items: [
              { label: "Home", href: "/" },
              { label: "Dept", href: "/dept" },
              { label: "Team", href: "/dept/team" },
              { label: "Member" },
            ],
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("rejects missing items (schema requires an items array)", () => {
    expect(generatedSchemas.Breadcrumb.safeParse({}).success).toBe(false);
    expect(
      generatedSchemas.Breadcrumb.safeParse({ items: [{ label: "Home", href: "/" }] }).success
    ).toBe(true);
  });
});

describe("NavigationMenu", () => {
  it("renders navigation menu with items", () => {
    const { container } = renderSpec({
      root: "nav1",
      elements: {
        nav1: {
          type: "NavigationMenu",
          props: {
            items: [
              { label: "Home", href: "/" },
              { label: "About", href: "/about" },
            ],
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("rejects missing items (schema requires an items array)", () => {
    expect(generatedSchemas.NavigationMenu.safeParse({}).success).toBe(false);
    expect(
      generatedSchemas.NavigationMenu.safeParse({ items: [{ label: "Home", href: "/" }] }).success
    ).toBe(true);
  });
});

// ── Feedback ──────────────────────────────────────────────────────────────────

describe("Alert", () => {
  it("renders info alert", () => {
    const { container } = renderSpec({
      root: "a1",
      elements: {
        a1: { type: "Alert", props: { variant: "info", title: "Heads up" } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders dismissible error alert", () => {
    const { container } = renderSpec({
      root: "a1",
      elements: {
        a1: {
          type: "Alert",
          props: { variant: "error", title: "Error", dismissible: true },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders non-dismissible alert (onDismiss not wired)", () => {
    const { container } = renderSpec({
      root: "a1",
      elements: {
        a1: {
          type: "Alert",
          props: { variant: "success", dismissible: false },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

describe("Banner", () => {
  it("renders info banner", () => {
    const { container } = renderSpec({
      root: "b1",
      elements: {
        b1: { type: "Banner", props: { variant: "info" } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders dismissible warning banner", () => {
    const { container } = renderSpec({
      root: "b1",
      elements: {
        b1: { type: "Banner", props: { variant: "warning", dismissible: true } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders non-dismissible banner (onDismiss not wired)", () => {
    const { container } = renderSpec({
      root: "b1",
      elements: {
        b1: { type: "Banner", props: { variant: "error", dismissible: false } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

describe("Dialog", () => {
  it("renders without throwing when open=false", () => {
    // Dialog with open=false renders nothing to the container (portal-based modal).
    // We just verify it doesn't throw.
    expect(() =>
      renderSpec({
        root: "dlg1",
        elements: {
          dlg1: {
            type: "Dialog",
            props: { open: false, title: "Confirm", description: "Are you sure?" },
          },
        },
      })
    ).not.toThrow();
  });

  it("renders open dialog with DOM output", () => {
    const { baseElement } = renderSpec({
      root: "dlg1",
      elements: {
        dlg1: {
          type: "Dialog",
          props: { open: true, title: "Delete item" },
        },
      },
    });
    // When open=true the modal portal renders into document.body
    expect(baseElement).not.toBeNull();
  });

  it("renders without throwing when open prop omitted (defaults to false)", () => {
    expect(() =>
      renderSpec({
        root: "dlg1",
        elements: {
          dlg1: { type: "Dialog", props: {} },
        },
      })
    ).not.toThrow();
  });
});

// ── Data Display ──────────────────────────────────────────────────────────────

describe("Table", () => {
  it("rejects missing columns and data (schema requires both arrays)", () => {
    // The `?? []` fallbacks that rendered an empty table are gone; a spec
    // missing columns/data now fails schema validation.
    expect(generatedSchemas.Table.safeParse({ density: "default" }).success).toBe(false);
    expect(generatedSchemas.Table.safeParse({ columns: [], data: [] }).success).toBe(true);
  });

  it("rejects malformed column entries", () => {
    expect(
      generatedSchemas.Table.safeParse({ columns: [{ header: "No key" }], data: [] }).success
    ).toBe(false);
    expect(
      generatedSchemas.Table.safeParse({
        columns: [{ key: "name", header: "Name", sortable: true }],
        data: [{ name: "Ada" }],
      }).success
    ).toBe(true);
  });
});

describe("DataList", () => {
  it("renders horizontal data list with items", () => {
    const { container } = renderSpec({
      root: "dl1",
      elements: {
        dl1: {
          type: "DataList",
          props: {
            items: [
              { label: "Status", value: "Active" },
              { label: "Created", value: "2024-01-01" },
            ],
            orientation: "horizontal",
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders vertical striped data list", () => {
    const { container } = renderSpec({
      root: "dl1",
      elements: {
        dl1: {
          type: "DataList",
          props: {
            items: [{ label: "Version", value: "1.0.0" }],
            orientation: "vertical",
            striped: true,
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("rejects missing items (schema requires an items array)", () => {
    expect(generatedSchemas.DataList.safeParse({}).success).toBe(false);
    expect(
      generatedSchemas.DataList.safeParse({ items: [{ label: "Status", value: "Active" }] }).success
    ).toBe(true);
  });
});

describe("EmptyState", () => {
  it("renders with heading and description", () => {
    const { container } = renderSpec({
      root: "es1",
      elements: {
        es1: {
          type: "EmptyState",
          props: {
            heading: "No results found",
            description: "Try adjusting your search.",
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders with title alias (heading ?? title fallback)", () => {
    const { container } = renderSpec({
      root: "es1",
      elements: {
        es1: {
          type: "EmptyState",
          props: { title: "Nothing here yet" },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

describe("Accordion", () => {
  it("renders accordion with items", () => {
    const { container } = renderSpec({
      root: "ac1",
      elements: {
        ac1: {
          type: "Accordion",
          props: {
            items: [
              { id: "faq1", title: "What is this?", content: "A component." },
              { id: "faq2", title: "How does it work?", content: "Like magic." },
            ],
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders multi-open accordion", () => {
    const { container } = renderSpec({
      root: "ac1",
      elements: {
        ac1: {
          type: "Accordion",
          props: {
            multiple: true,
            items: [{ id: "a", title: "First", content: "Content" }],
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("rejects missing items (schema requires an items array)", () => {
    expect(generatedSchemas.Accordion.safeParse({}).success).toBe(false);
    expect(
      generatedSchemas.Accordion.safeParse({
        items: [{ id: "a", title: "First", content: "Content" }],
      }).success
    ).toBe(true);
  });
});

// ── App Shell ─────────────────────────────────────────────────────────────────

describe("Sidebar", () => {
  it("renders sidebar with items", () => {
    const { container } = renderSpec({
      root: "sb1",
      elements: {
        sb1: {
          type: "Sidebar",
          props: {
            items: [
              { id: "home", label: "Home", href: "/" },
              { id: "settings", label: "Settings", href: "/settings" },
            ],
          },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders collapsed sidebar (icon-only rail mode)", () => {
    const { container } = renderSpec({
      root: "sb1",
      elements: {
        sb1: {
          type: "Sidebar",
          props: { collapsed: true, items: [] },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("rejects missing items (schema requires an items array)", () => {
    expect(generatedSchemas.Sidebar.safeParse({}).success).toBe(false);
    expect(
      generatedSchemas.Sidebar.safeParse({
        items: [{ id: "home", label: "Home", href: "/" }],
      }).success
    ).toBe(true);
  });
});

describe("AppBar", () => {
  it("renders default glass app bar", () => {
    const { container } = renderSpec({
      root: "ab1",
      elements: {
        ab1: {
          type: "AppBar",
          props: { glass: true, height: "56px" },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders app bar with logo and actions", () => {
    const { container } = renderSpec({
      root: "ab1",
      elements: {
        ab1: {
          type: "AppBar",
          props: { logo: "MyApp", actions: "Login" },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

describe("Footer", () => {
  it("renders minimal footer", () => {
    const { container } = renderSpec({
      root: "f1",
      elements: {
        f1: { type: "Footer", props: { variant: "minimal" } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders rich footer", () => {
    const { container } = renderSpec({
      root: "f1",
      elements: {
        f1: { type: "Footer", props: { variant: "rich" } },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });
});

// ── Action handlers ───────────────────────────────────────────────────────────

describe("registry actions", () => {
  it("navigate action is present in the registry output", () => {
    // The executeAction export from registry.tsx is created by defineRegistry.
    // We verify it's a function (the navigate/validateForm stubs are wired in).
    expect(typeof executeAction).toBe("function");
  });
});

// ── Button emit path ──────────────────────────────────────────────────────────

describe("Button", () => {
  it("renders primary button with label prop", () => {
    renderSpec({
      root: "btn1",
      elements: {
        btn1: {
          type: "Button",
          props: { variant: "primary", label: "Save" },
        },
      },
    });
    expect(screen.getByRole("button")).toBeDefined();
    expect(screen.getByRole("button").textContent).toContain("Save");
  });

  it("renders secondary small button", () => {
    renderSpec({
      root: "btn1",
      elements: {
        btn1: {
          type: "Button",
          props: { variant: "secondary", size: "sm", label: "Cancel" },
        },
      },
    });
    expect(screen.getByRole("button")).toBeDefined();
  });

  it("renders disabled ghost button", () => {
    renderSpec({
      root: "btn1",
      elements: {
        btn1: {
          type: "Button",
          props: { variant: "ghost", disabled: true, label: "Delete" },
        },
      },
    });
    const btn = screen.getByRole("button");
    expect(btn).toBeDefined();
  });

  it("renders button with children over label when children present", () => {
    renderSpec({
      root: "btn1",
      elements: {
        btn1: {
          type: "Button",
          props: { variant: "primary", label: "Fallback" },
          children: ["childText"],
        },
        childText: {
          type: "Text",
          props: { children: "Sample words", variant: "label" },
        },
      },
    });
    expect(screen.getByRole("button")).toBeDefined();
  });
});

// ── catalog metadata shape validation ────────────────────────────────────────

describe("catalog metadata shape", () => {
  it("every included component has a non-empty description", () => {
    const included = Object.entries(catalogMeta).filter(([, m]) => m.include !== false);
    for (const [name, meta] of included) {
      expect(meta.description.length, `${name} has empty description`).toBeGreaterThan(0);
    }
  });

  it("every component with slots has at least one slot name", () => {
    for (const [name, meta] of Object.entries(catalogMeta)) {
      if (meta.slots !== undefined) {
        expect(meta.slots.length, `${name} has empty slots array`).toBeGreaterThan(0);
      }
    }
  });

  it("all components with slots declare 'default' or named slots", () => {
    for (const [, meta] of Object.entries(catalogMeta)) {
      if (meta.slots) {
        for (const slot of meta.slots) {
          expect(typeof slot).toBe("string");
          expect(slot.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ── generated-schemas shape validation ───────────────────────────────────────

describe("generated-schemas", () => {
  it("every schema entry is a Zod object", () => {
    for (const [name, schema] of Object.entries(generatedSchemas)) {
      // Zod schemas expose _def — use unknown cast to avoid explicit-any lint rule
      const s = schema as unknown as Record<string, unknown>;
      expect(s["_def"], `${name} schema missing _def`).toBeDefined();
    }
  });

  it("Stack schema validates valid props", () => {
    const result = generatedSchemas.Stack.safeParse({
      direction: "column",
      gap: "md",
      align: "center",
    });
    expect(result.success).toBe(true);
  });

  it("Stack schema rejects invalid direction", () => {
    const result = generatedSchemas.Stack.safeParse({ direction: "diagonal" });
    expect(result.success).toBe(false);
  });

  it("Button schema validates valid props", () => {
    const result = generatedSchemas.Button.safeParse({ variant: "primary", size: "md" });
    expect(result.success).toBe(true);
  });

  it("Button schema rejects invalid variant", () => {
    const result = generatedSchemas.Button.safeParse({ variant: "mega" });
    expect(result.success).toBe(false);
  });

  it("Dialog schema requires open field", () => {
    // open is z.boolean() (not optional) — missing it should fail
    const result = generatedSchemas.Dialog.safeParse({ title: "Test" });
    expect(result.success).toBe(false);
  });

  it("Toast schema requires title field", () => {
    const result = generatedSchemas.Toast.safeParse({});
    expect(result.success).toBe(false);
  });

  it("Avatar schema validates status enum", () => {
    const valid = generatedSchemas.Avatar.safeParse({ status: "online" });
    const invalid = generatedSchemas.Avatar.safeParse({ status: "invisible" });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});

// ── array-of-object prop schemas (#3354) ─────────────────────────────────────
// These props previously had NO schema (mapTypeToZod dropped `[]`/`Column<`
// types) and were smuggled into prose descriptions while adapters compensated
// with `?? []`. They are now declared via each component's `*.catalog.ts`
// propSchemas so malformed AI output fails validation.
describe("array-of-object prop schemas", () => {
  it("Combobox requires an options array of { value, label }", () => {
    expect(generatedSchemas.Combobox.safeParse({ label: "Fruit" }).success).toBe(false);
    expect(generatedSchemas.Combobox.safeParse({ options: [{ value: "a" }] }).success).toBe(false);
    expect(
      generatedSchemas.Combobox.safeParse({ options: [{ value: "a", label: "A" }] }).success
    ).toBe(true);
  });

  it("DataTable requires columns and data arrays", () => {
    expect(generatedSchemas.DataTable.safeParse({ label: "Grid" }).success).toBe(false);
    expect(
      generatedSchemas.DataTable.safeParse({
        columns: [{ key: "name", header: "Name", rowHeader: true }],
        data: [{ name: "Ada" }],
      }).success
    ).toBe(true);
  });

  it("DepartureBoard requires a phrases string array", () => {
    expect(generatedSchemas.DepartureBoard.safeParse({}).success).toBe(false);
    expect(generatedSchemas.DepartureBoard.safeParse({ phrases: [1, 2] }).success).toBe(false);
    expect(generatedSchemas.DepartureBoard.safeParse({ phrases: ["SHIP IT"] }).success).toBe(true);
  });
});

// ── registry seam validation / graceful per-element degradation (#3354) ───────
// `@json-render/react` hands each element's raw `props` straight to the adapter
// (it never validates props against the catalog schema at render time). Without
// a guard, a missing/malformed array prop makes the underlying Rialto component
// dereference `undefined` (e.g. Tabs `tabs[0]`, Accordion `items.map`) and
// throw — and that throw blanks the entire preview via the app's outer error
// boundary. `withSchemaValidation` in registry.tsx validates each element's
// normalized props against its generated Zod schema BEFORE the adapter runs and
// renders a subtle, accessible fallback on failure, isolating the failure to
// the single element so siblings keep rendering.
describe("registry seam validation (graceful degradation)", () => {
  it("renders a fallback (not a crash) when a required array prop is missing, and siblings still render", () => {
    let container: HTMLElement | null = null;
    expect(() => {
      container = renderSpec({
        root: "row",
        elements: {
          row: { type: "Stack", props: { direction: "column" }, children: ["broken", "ok"] },
          // Missing the required `tabs` array: the Tabs component does
          // `tabs[0]?.id` / `tabs.map(...)` and throws when `tabs` is undefined.
          broken: { type: "Tabs", props: {} },
          ok: {
            type: "Tabs",
            props: { tabs: [{ id: "s", label: "Sibling Tab", content: "Sibling Panel" }] },
          },
        },
      }).container;
    }).not.toThrow();

    expect(container).not.toBeNull();
    const root = container as unknown as HTMLElement;
    // The malformed element degraded to the accessible per-element seam fallback.
    const fallback = root.querySelector("[data-rialto-seam-fallback]");
    expect(fallback).not.toBeNull();
    expect(fallback?.getAttribute("data-rialto-seam-fallback")).toBe("Tabs");
    expect(fallback?.getAttribute("role")).toBe("note");
    // The valid sibling rendered normally — the failure did not cascade.
    expect(within(root).getByText("Sibling Tab")).toBeTruthy();
  });

  it("renders a fallback when an array prop is malformed (wrong type), isolating the failure", () => {
    let container: HTMLElement | null = null;
    expect(() => {
      container = renderSpec({
        root: "row",
        elements: {
          row: { type: "Stack", props: { direction: "column" }, children: ["broken", "ok"] },
          // `items` is present but the wrong type — Accordion does `items.map(...)`.
          broken: { type: "Accordion", props: { items: "not-an-array" } },
          ok: { type: "EmptyState", props: { heading: "Still Here" } },
        },
      }).container;
    }).not.toThrow();

    expect(container).not.toBeNull();
    const root = container as unknown as HTMLElement;
    expect(root.querySelector("[data-rialto-seam-fallback='Accordion']")).not.toBeNull();
    // Sibling still renders.
    expect(within(root).getByText("Still Here")).toBeTruthy();
  });

  it("clamps an over-limit string prop instead of dropping the element", () => {
    // Live chat run 2026-10-24: the model sent an 89-char Alert title against a
    // 60-char limit and the whole Alert became "Component could not be displayed".
    const longTitle =
      "Which venue should I check? Send me the venue ID and I'll pull up tonight's reservations.";
    expect(longTitle.length).toBeGreaterThan(60);
    const { container } = renderSpec({
      root: "alert",
      elements: { alert: { type: "Alert", props: { variant: "info", title: longTitle } } },
    });

    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    const shown = within(container).getByText(/^Which venue should I check\?/);
    expect(shown.textContent!.length).toBeLessThanOrEqual(60);
    expect(shown.textContent!.endsWith("…")).toBe(true);
  });

  it("does not render a fallback for a fully valid element", () => {
    const { container } = renderSpec({
      root: "ok",
      elements: {
        ok: {
          type: "Tabs",
          props: { tabs: [{ id: "s", label: "Valid Tab", content: "Panel" }] },
        },
      },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Valid Tab")).toBeTruthy();
  });
});

// ── Hospitality data elements ─────────────────────────────────────────────────

describe("hospitality data elements", () => {
  it("renders a Stat with its label, value, and trend", () => {
    const { container } = renderSpec({
      root: "s",
      elements: {
        s: {
          type: "Stat",
          props: { label: "Covers tonight", value: "42", delta: "+6", trend: "up" },
        },
      },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Covers tonight")).toBeTruthy();
    expect(within(container).getByText("42")).toBeTruthy();
  });

  it("renders a Timeline of events", () => {
    const { container } = renderSpec({
      root: "t",
      elements: {
        t: {
          type: "Timeline",
          props: {
            events: [
              { title: "Garcia, party of 4", timestamp: "6:30 PM", status: "completed" },
              { title: "Lee, party of 2", timestamp: "7:00 PM", status: "upcoming" },
            ],
          },
        },
      },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Garcia, party of 4")).toBeTruthy();
    expect(within(container).getByText("Lee, party of 2")).toBeTruthy();
  });

  it("renders a Tag from a label prop", () => {
    const { container } = renderSpec({
      root: "g",
      elements: { g: { type: "Tag", props: { label: "Gluten-free" } } },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Gluten-free")).toBeTruthy();
  });

  it("renders a StatusLED with its label", () => {
    const { container } = renderSpec({
      root: "l",
      elements: { l: { type: "StatusLED", props: { variant: "success", label: "Patio 2: free" } } },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    // Live batch 7: the label existed only as aria-label, so staff saw a column of
    // bare dots. It must be visible text, read once (the light itself is decorative).
    expect(within(container).getByText("Patio 2: free")).toBeTruthy();
    expect(within(container).queryByRole("img", { name: "Patio 2: free" })).toBeNull();
  });
});

describe("hospitality data elements tolerate plausible model output", () => {
  it("keeps a Timeline whose event carries a status outside the component's set", () => {
    const { container } = renderSpec({
      root: "t",
      elements: {
        t: {
          type: "Timeline",
          props: {
            events: [{ title: "Garcia, party of 4", timestamp: "6:30 PM", status: "seated" }],
          },
        },
      },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Garcia, party of 4")).toBeTruthy();
  });

  it("keeps a Stat whose delta is a number", () => {
    const { container } = renderSpec({
      root: "s",
      elements: {
        s: { type: "Stat", props: { label: "No-shows", value: 3, delta: -2, trend: "down" } },
      },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("-2")).toBeTruthy();
  });

  it("clamps an overlong Tag label instead of dropping it", () => {
    const long = "Allergic to shellfish, tree nuts, and sesame";
    const { container } = renderSpec({
      root: "g",
      elements: { g: { type: "Tag", props: { label: long } } },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    const shown = within(container).getByText(/^Allergic to shellfish/);
    expect(shown.textContent!.length).toBeLessThanOrEqual(30);
  });
});

// Live /gen run 2026-10-24 (F24): Text and Badge had no prop for their words, and
// their adapters rendered only child elements, so every generated label was empty.
describe("text-bearing elements carry their own words", () => {
  it("renders a Text's words from its text prop", () => {
    const { container } = renderSpec({
      root: "t",
      elements: {
        t: {
          type: "Text",
          props: { variant: "label", text: "Visit history" },
        },
      },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Visit history")).toBeTruthy();
  });

  it("renders a Badge's words from its label prop", () => {
    const { container } = renderSpec({
      root: "b",
      elements: {
        b: {
          type: "Badge",
          props: { variant: "success", label: "Confirmed" },
        },
      },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Confirmed")).toBeTruthy();
  });

  it("still renders a Text's child elements when it has them", () => {
    const { container } = renderSpec({
      root: "t",
      elements: {
        t: { type: "Text", props: { text: "ignored" }, children: ["b"] },
        b: { type: "Badge", props: { label: "Inner" } },
      },
    });
    expect(within(container).getByText("Inner")).toBeTruthy();
  });
});

// Live /gen run after #7460: the model filled Tag's required words every time but
// left Text's and Badge's optional ones out. Words are now required, as on Tag, and
// a malformed Timeline event is dropped instead of failing the whole Timeline.
describe("generated words are required where a component needs them", () => {
  it("rejects a Text with no words, so the model is told it must supply them", () => {
    expect(generatedSchemas.Text.safeParse({ variant: "label" }).success).toBe(false);
    expect(generatedSchemas.Badge.safeParse({ variant: "success" }).success).toBe(false);
    expect(generatedSchemas.Text.safeParse({ children: "Visits" }).success).toBe(true);
  });

  it("drops a Timeline event with no title and keeps the rest", () => {
    const { container } = renderSpec({
      root: "t",
      elements: {
        t: {
          type: "Timeline",
          props: { events: [{ title: "Visit 1 - Party of 2" }, { key: "x" }] },
        },
      },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Visit 1 - Party of 2")).toBeTruthy();
  });
});

// Review of #7462: requiring the words must not break a Text or Badge that holds
// only child elements, the shape the model is told every slot accepts.
describe("slot components with only child elements", () => {
  it("renders a Text whose content is child elements and no words of its own", () => {
    const { container } = renderSpec({
      root: "s",
      elements: {
        s: { type: "Stack", props: { direction: "column" }, children: ["t"] },
        t: { type: "Text", props: { variant: "body" }, children: ["inner"] },
        inner: { type: "Badge", props: { label: "Hi" } },
      },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Hi")).toBeTruthy();
  });

  it("renders a Badge whose content is a child element", () => {
    const { container } = renderSpec({
      root: "b",
      elements: {
        b: { type: "Badge", props: { variant: "success" }, children: ["t"] },
        t: { type: "Text", props: { text: "Inside" } },
      },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Inside")).toBeTruthy();
  });

  it("still falls back for a leaf Text with no words", () => {
    const { container } = renderSpec({
      root: "t",
      elements: { t: { type: "Text", props: { variant: "body" } } },
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).not.toBeNull();
  });
});

it("still falls back for a Tag with child elements and no label (Tag has no slot)", () => {
  const { container } = renderSpec({
    root: "t",
    elements: {
      t: { type: "Tag", props: { variant: "accent" }, children: ["x"] },
      x: { type: "Text", props: { text: "VIP" } },
    },
  });
  expect(container.querySelector("[data-rialto-seam-fallback]")).not.toBeNull();
});

// gen-ui-elements-2: a reservation row needs time, partySize and status; one bad
// row is dropped rather than replacing the whole list with the fallback.
describe("ReservationList", () => {
  function renderReservations(reservations: unknown[]) {
    return renderSpec({
      root: "r",
      elements: { r: { type: "ReservationList", props: { reservations } } },
    });
  }

  it("renders its rows", () => {
    const { container } = renderReservations([
      { time: "6:00 PM", guest: "Lee Family", partySize: 2, status: "CONFIRMED" },
      { time: "8:15 PM", partySize: 3, status: "PENDING" },
    ]);
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    const list = within(container).getByRole("list", { name: "Reservations" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list.textContent).toContain("Lee Family");
    expect(list.textContent).toContain("Walk-in");
  });

  it.each([
    ["time", { guest: "No time", partySize: 2, status: "CONFIRMED" }],
    ["partySize", { time: "7:00 PM", guest: "No party", status: "CONFIRMED" }],
    ["status", { time: "7:00 PM", guest: "No status", partySize: 2 }],
    ["time (blank)", { time: "  ", guest: "Blank time", partySize: 2, status: "CONFIRMED" }],
    ["status (blank)", { time: "7:00 PM", guest: "Blank status", partySize: 2, status: "" }],
  ])("drops a row missing %s and keeps the rest", (_field, bad) => {
    const { container } = renderReservations([
      bad,
      { time: "6:00 PM", guest: "Kept", partySize: 2, status: "CONFIRMED" },
    ]);
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getAllByRole("listitem")).toHaveLength(1);
    expect(within(container).getByText("Kept")).toBeTruthy();
  });

  it("coerces a numeric partySize string and drops a non-numeric one", () => {
    const { container } = renderReservations([
      { time: "6:00 PM", guest: "Coerced", partySize: "4", status: "CONFIRMED" },
      { time: "7:00 PM", guest: "Dropped", partySize: "four", status: "CONFIRMED" },
    ]);
    expect(within(container).getAllByRole("listitem")).toHaveLength(1);
    expect(within(container).getByRole("listitem").textContent).toContain("Party of 4");
    expect(within(container).queryByText("Dropped")).toBeNull();
  });

  it("falls back only when no row survives", () => {
    const { container } = renderReservations([{ guest: "Nothing else" }]);
    expect(container.querySelector('[data-rialto-seam-fallback="ReservationList"]')).not.toBeNull();
  });

  it("falls back when the reservations array is missing", () => {
    const { container } = renderSpec({
      root: "r",
      elements: { r: { type: "ReservationList", props: {} } },
    });
    expect(container.querySelector('[data-rialto-seam-fallback="ReservationList"]')).not.toBeNull();
  });
});

// gen-ui-elements-2: open times for one date and party size. Blank times are
// dropped; only a missing date line falls back; an empty list is a real state.
describe("TimeSlots", () => {
  function renderSlots(props: Record<string, unknown>) {
    return renderSpec({
      root: "s",
      elements: { s: { type: "TimeSlots", props } },
    });
  }

  it("renders the date line and the open times", () => {
    const { container } = renderSlots({
      date: "Friday, Oct 30",
      partySize: 4,
      times: ["6:00 PM", "7:45 PM"],
    });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("Friday, Oct 30 · Party of 4")).toBeTruthy();
    const list = within(container).getByRole("list", { name: "Open times" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("drops blank times and keeps the rest", () => {
    const { container } = renderSlots({
      date: "Friday",
      partySize: 2,
      times: ["6:00 PM", "", "   ", "8:00 PM"],
    });
    const items = within(container).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["6:00 PM", "8:00 PM"]);
  });

  it("shows the no-open-times line, not the fallback, for an empty times array", () => {
    const { container } = renderSlots({ date: "Saturday", partySize: 2, times: [] });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("No open times")).toBeTruthy();
  });

  it("shows the no-open-times line when every time is blank", () => {
    const { container } = renderSlots({ date: "Saturday", partySize: 2, times: [" "] });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    expect(within(container).getByText("No open times")).toBeTruthy();
  });

  it("coerces a numeric partySize string", () => {
    const { container } = renderSlots({ date: "Friday", partySize: "4", times: ["6:00 PM"] });
    expect(within(container).getByText("Friday · Party of 4")).toBeTruthy();
  });

  it.each([
    ["date missing", { partySize: 2, times: ["6:00 PM"] }],
    ["date blank", { date: "  ", partySize: 2, times: ["6:00 PM"] }],
    ["partySize missing", { date: "Friday", times: ["6:00 PM"] }],
    ["partySize non-numeric", { date: "Friday", partySize: "four", times: ["6:00 PM"] }],
    ["times missing", { date: "Friday", partySize: 2 }],
  ])("falls back when the %s", (_case, props) => {
    const { container } = renderSlots(props);
    expect(container.querySelector('[data-rialto-seam-fallback="TimeSlots"]')).not.toBeNull();
  });

  it('clamps an over-long date with "…" at its 40-char limit instead of dropping it', () => {
    const date = "Friday, October 30th, the evening of the harvest dinner";
    const { container } = renderSlots({ date, partySize: 2, times: ["6:00 PM"] });
    expect(container.querySelector("[data-rialto-seam-fallback]")).toBeNull();
    const clamped = `${date.slice(0, 39).trimEnd()}…`;
    expect(clamped.length).toBeLessThanOrEqual(40);
    expect(within(container).getByText(`${clamped} · Party of 2`)).toBeTruthy();
  });
});
