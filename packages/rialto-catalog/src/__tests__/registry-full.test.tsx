/**
 * Comprehensive registry render coverage tests.
 *
 * Exercises every component registered in registry.tsx to push statement
 * coverage above the 65% threshold.  Each test renders a minimal JSON spec
 * through the same Renderer + JSONUIProvider pipeline used in production.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
        txt1: { type: "Text", props: { variant: "body" } },
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
      elements: { t1: { type: "Text", props: { variant: "body" } } },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders display variant with color and align", () => {
    const { container } = renderSpec({
      root: "t1",
      elements: {
        t1: {
          type: "Text",
          props: { variant: "display", color: "accent", align: "center", as: "h1" },
        },
      },
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders caption variant", () => {
    const { container } = renderSpec({
      root: "t1",
      elements: { t1: { type: "Text", props: { variant: "caption" } } },
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
          props: { variant: "label" },
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
