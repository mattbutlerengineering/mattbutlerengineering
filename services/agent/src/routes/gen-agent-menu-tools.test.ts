import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools } from "./gen-agent-tools.js";

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: "info",
  } as unknown as FastifyBaseLogger;
}

function createMockApiClient() {
  return {
    menus: {
      list: vi.fn(),
      getById: vi.fn(),
      updateItem: vi.fn(),
      create: vi.fn(),
      reorderSections: vi.fn(),
      reorderItems: vi.fn(),
    },
  };
}

/** What `ApiClientError` looks like to the tools: a status-bearing ProblemDetails. */
function problem(status: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail: "Refused.", ...extra },
  });
}

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

const MENUS = [
  { id: "m1", venueId: "v1", name: "Dinner", slug: "dinner", description: null, status: "ACTIVE" },
  {
    id: "m2",
    venueId: "v1",
    name: "Brunch",
    slug: "brunch",
    description: "Weekends",
    status: "DRAFT",
  },
];

function item(fields: Record<string, unknown>) {
  return {
    id: "i1",
    venueId: "v1",
    sectionId: "s1",
    name: "Burrata",
    description: "With figs",
    priceCents: 1450,
    status: "AVAILABLE",
    displayOrder: 0,
    ...fields,
  };
}

const DINNER = {
  ...MENUS[0],
  sections: [
    {
      id: "s1",
      venueId: "v1",
      menuId: "m1",
      name: "Starters",
      displayOrder: 0,
      items: [item({}), item({ id: "i2", name: "Soup", priceCents: 900, status: "SOLD_OUT" })],
    },
    {
      id: "s2",
      venueId: "v1",
      menuId: "m1",
      name: "Desserts",
      displayOrder: 1,
      items: [item({ id: "i3", sectionId: "s2", name: "Soup", priceCents: 800 })],
    },
  ],
};

describe("menu chat tools", () => {
  let log: FastifyBaseLogger;
  let api: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    log = createMockLogger();
    api = createMockApiClient();
    api.menus.list.mockResolvedValue(MENUS);
    api.menus.getById.mockResolvedValue(DINNER);
    api.menus.updateItem.mockResolvedValue(item({}));
    api.menus.create.mockResolvedValue(MENUS[0]);
    api.menus.reorderSections.mockResolvedValue([]);
    api.menus.reorderItems.mockResolvedValue([]);
  });

  function read(toolName: string, input: Record<string, unknown>) {
    const tools = createAgentTools(log, api as never, { venueId: "v1" });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  function run(toolName: string, input: Record<string, unknown>) {
    const tools = createAgentTools(log, api as never, {
      venueId: "v1",
      confirmedAction: { actionId: "call-1", toolName, toolInput: input },
    });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  describe("a write the server never answered (#8035)", () => {
    const input = { menu: "Dinner", item: "Burrata", price: "16.50" };

    it.each([
      ["a 502", () => problem(502)],
      ["a timeout", () => new DOMException("The operation timed out.", "TimeoutError")],
      ["a lost response", () => new TypeError("fetch failed")],
    ])("after %s, may have saved: says to check get_menu first", async (_name, failure) => {
      api.menus.updateItem.mockRejectedValue(failure());

      const result = await run("update_menu_item", input);

      expect(result).toMatchObject({
        error: expect.stringMatching(/Couldn't confirm.*get_menu before trying again/),
      });
      expect(JSON.stringify(result)).not.toMatch(/Nothing was changed/);
    });

    it("set_menu_item_availability may have saved too", async () => {
      api.menus.updateItem.mockRejectedValue(problem(502));

      const result = await run("set_menu_item_availability", {
        menu: "Dinner",
        item: "Burrata",
        availability: "sold_out",
      });

      expect(result).toEqual({
        error: "Couldn't confirm the change was saved. Check get_menu before trying again.",
      });
    });

    it("still says nothing changed on a definite refusal", async () => {
      api.menus.updateItem.mockRejectedValue(problem(409));

      const result = await run("update_menu_item", input);

      expect(result).toEqual({ refused: true, error: "Refused. Nothing was changed." });
    });

    it("still says nothing changed when the read before the write fails", async () => {
      api.menus.list.mockRejectedValue(problem(502));

      const result = await run("update_menu_item", input);

      expect(result).toMatchObject({ error: expect.stringMatching(/Nothing was changed/) });
      expect(api.menus.updateItem).not.toHaveBeenCalled();
    });
  });

  it("lists the venue's menus", async () => {
    const result = await read("list_menus", {});

    expect(api.menus.list).toHaveBeenCalledWith("v1");
    expect(result).toEqual({
      menus: [
        { name: "Dinner", status: "ACTIVE", description: null },
        { name: "Brunch", status: "DRAFT", description: "Weekends" },
      ],
    });
  });

  it("shows a menu's sections and items with prices as money", async () => {
    const result = await read("get_menu", { menu: "dinner" });

    expect(api.menus.getById).toHaveBeenCalledWith("v1", "m1");
    expect(result).toEqual({
      menu: "Dinner",
      status: "ACTIVE",
      sections: [
        {
          name: "Starters",
          items: [
            { name: "Burrata", price: "14.50", status: "AVAILABLE", description: "With figs" },
            { name: "Soup", price: "9.00", status: "SOLD_OUT", description: "With figs" },
          ],
        },
        {
          name: "Desserts",
          items: [{ name: "Soup", price: "8.00", status: "AVAILABLE", description: "With figs" }],
        },
      ],
    });
  });

  it("finds the menu the page has open by its id", async () => {
    await read("get_menu", { menu: "m2" });

    expect(api.menus.getById).toHaveBeenCalledWith("v1", "m2");
  });

  it("says the user can't see the menus on a 403", async () => {
    api.menus.list.mockRejectedValue(problem(403));

    await expect(read("list_menus", {})).resolves.toEqual({
      refused: true,
      error: "The user doesn't have permission to see the menus.",
    });
  });

  it("passes on a menu read's other refusals in the server's words", async () => {
    api.menus.getById.mockRejectedValue(problem(404, { detail: "Menu not found." }));

    await expect(read("get_menu", { menu: "dinner" })).resolves.toEqual({
      refused: true,
      error: "Menu not found.",
    });
  });

  it("says a menu read couldn't be done rather than that there are none", async () => {
    api.menus.getById.mockRejectedValue(problem(502));

    await expect(read("get_menu", { menu: "dinner" })).resolves.toEqual({
      error: "Couldn't read the menus. Ask the user to try again.",
    });
  });

  it("names the menus there are when one isn't found", async () => {
    const result = await read("get_menu", { menu: "Lunch" });

    expect(result).toMatchObject({ error: expect.stringContaining("Dinner, Brunch") });
  });

  describe("set_menu_item_availability", () => {
    it("marks an item sold out, as the menu editor's toggle does", async () => {
      const result = await run("set_menu_item_availability", {
        menu: "Dinner",
        item: "burrata",
        availability: "sold_out",
      });

      expect(api.menus.updateItem).toHaveBeenCalledWith("v1", "m1", "s1", "i1", {
        status: "SOLD_OUT",
      });
      expect(result).toMatchObject({ updated: true, item: "Burrata", status: "SOLD_OUT" });
    });

    it("leaves an item staff hid alone, since either state would show it to guests", async () => {
      api.menus.getById.mockResolvedValue({
        ...DINNER,
        sections: [{ ...DINNER.sections[0], items: [item({ status: "HIDDEN" })] }],
      });

      const result = await run("set_menu_item_availability", {
        menu: "Dinner",
        item: "Burrata",
        availability: "available",
      });

      expect(result).toMatchObject({ error: expect.stringContaining("hidden") });
      expect(api.menus.updateItem).not.toHaveBeenCalled();
    });

    it("asks which section when two items share the name", async () => {
      const result = await run("set_menu_item_availability", {
        menu: "Dinner",
        item: "Soup",
        availability: "available",
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/Starters.*Desserts/) });
      expect(api.menus.updateItem).not.toHaveBeenCalled();
    });

    it("tells two items apart by section", async () => {
      await run("set_menu_item_availability", {
        menu: "Dinner",
        item: "Soup",
        section: "desserts",
        availability: "sold_out",
      });

      expect(api.menus.updateItem).toHaveBeenCalledWith("v1", "m1", "s2", "i3", {
        status: "SOLD_OUT",
      });
    });
  });

  describe("update_menu_item", () => {
    it("changes the price in cents without floating-point error", async () => {
      await run("update_menu_item", { menu: "Dinner", item: "Burrata", price: "16.10" });

      expect(api.menus.updateItem).toHaveBeenCalledWith("v1", "m1", "s1", "i1", {
        priceCents: 1610,
      });
    });

    it("accepts a whole price and a new name and description", async () => {
      await run("update_menu_item", {
        menu: "Dinner",
        item: "Burrata",
        price: "15",
        name: "Burrata & figs",
        description: "Seasonal",
      });

      expect(api.menus.updateItem).toHaveBeenCalledWith("v1", "m1", "s1", "i1", {
        priceCents: 1500,
        name: "Burrata & figs",
        description: "Seasonal",
      });
    });

    it("rejects a malformed price or no change before anything is confirmed", () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });
      const schema = tools.update_menu_item!.inputSchema as unknown as {
        safeParse: (v: unknown) => { success: boolean };
      };

      expect(schema.safeParse({ menu: "Dinner", item: "Burrata" }).success).toBe(false);
      expect(schema.safeParse({ menu: "Dinner", item: "Burrata", price: "$16" }).success).toBe(
        false
      );
      expect(schema.safeParse({ menu: "Dinner", item: "Burrata", price: "16.105" }).success).toBe(
        false
      );
      expect(schema.safeParse({ menu: "Dinner", item: "Burrata", price: "16.1" }).success).toBe(
        true
      );
    });
  });

  describe("create_menu (#9478)", () => {
    it("creates a draft menu with a slug made from its name", async () => {
      const result = await run("create_menu", {
        name: "Late Night & Bar Bites",
        description: "After 10",
      });

      expect(api.menus.create).toHaveBeenCalledWith("v1", {
        name: "Late Night & Bar Bites",
        slug: "late-night-bar-bites",
        description: "After 10",
        status: "DRAFT",
      });
      expect(result).toMatchObject({
        created: true,
        menu: "Late Night & Bar Bites",
        status: "DRAFT",
      });
    });

    it("won't make a second menu with a name the venue already has", async () => {
      const result = await run("create_menu", { name: "dinner" });

      expect(result).toMatchObject({ error: expect.stringContaining("already") });
      expect(api.menus.create).not.toHaveBeenCalled();
    });

    it("asks for a name with letters or digits in it", async () => {
      const result = await run("create_menu", { name: "!!!" });

      expect(result).toMatchObject({ error: expect.stringMatching(/letters or digits/) });
      expect(api.menus.create).not.toHaveBeenCalled();
    });
  });

  describe("reorder_menu_sections (#9478)", () => {
    it("saves the new order of the sections by id", async () => {
      const result = await run("reorder_menu_sections", {
        menu: "Dinner",
        sections: ["desserts", "Starters"],
      });

      expect(api.menus.reorderSections).toHaveBeenCalledWith("v1", "m1", ["s2", "s1"]);
      expect(result).toMatchObject({
        reordered: true,
        menu: "Dinner",
        order: ["Desserts", "Starters"],
      });
    });

    it("needs every section named once, so none is dropped by accident", async () => {
      const result = await run("reorder_menu_sections", { menu: "Dinner", sections: ["Desserts"] });

      expect(result).toMatchObject({ error: expect.stringMatching(/Starters/) });
      expect(api.menus.reorderSections).not.toHaveBeenCalled();
    });

    it("refuses a section the menu doesn't have", async () => {
      const result = await run("reorder_menu_sections", {
        menu: "Dinner",
        sections: ["Desserts", "Starters", "Mains"],
      });

      expect(result).toMatchObject({ error: expect.stringContaining("Mains") });
      expect(api.menus.reorderSections).not.toHaveBeenCalled();
    });
  });

  describe("reorder_menu_items (#9478)", () => {
    it("saves the new order of a section's items by id", async () => {
      const result = await run("reorder_menu_items", {
        menu: "Dinner",
        section: "Starters",
        items: ["Soup", "Burrata"],
      });

      expect(api.menus.reorderItems).toHaveBeenCalledWith("v1", "m1", "s1", ["i2", "i1"]);
      expect(result).toMatchObject({ reordered: true, section: "Starters" });
    });

    it("needs every item in the section named", async () => {
      const result = await run("reorder_menu_items", {
        menu: "Dinner",
        section: "Starters",
        items: ["Soup"],
      });

      expect(result).toMatchObject({ error: expect.stringMatching(/Burrata/) });
      expect(api.menus.reorderItems).not.toHaveBeenCalled();
    });

    it("names the sections there are when one isn't found", async () => {
      const result = await run("reorder_menu_items", {
        menu: "Dinner",
        section: "Mains",
        items: ["Soup"],
      });

      expect(result).toMatchObject({ error: expect.stringContaining("Starters, Desserts") });
    });
  });

  describe.each([
    ["create_menu", { name: "Late Night" }],
    ["reorder_menu_sections", { menu: "Dinner", sections: ["Desserts", "Starters"] }],
    ["reorder_menu_items", { menu: "Dinner", section: "Starters", items: ["Soup", "Burrata"] }],
  ])("%s holds for confirmation", (toolName, input) => {
    it("writes nothing until the user confirms", async () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });

      const result = await tools[toolName]!.execute!(input as never, toolCtx);

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.menus.create).not.toHaveBeenCalled();
      expect(api.menus.reorderSections).not.toHaveBeenCalled();
      expect(api.menus.reorderItems).not.toHaveBeenCalled();
    });

    it("passes on a 403 in plain words", async () => {
      const denied = problem(403);
      api.menus.create.mockRejectedValue(denied);
      api.menus.reorderSections.mockRejectedValue(denied);
      api.menus.reorderItems.mockRejectedValue(denied);

      const result = await run(toolName, input);

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/permission/i) });
    });

    it("says it may have saved after a lost response", async () => {
      const lost = new TypeError("fetch failed");
      api.menus.create.mockRejectedValue(lost);
      api.menus.reorderSections.mockRejectedValue(lost);
      api.menus.reorderItems.mockRejectedValue(lost);

      const result = await run(toolName, input);

      expect(result).toMatchObject({ error: expect.stringMatching(/Couldn't confirm/) });
    });
  });

  describe.each([
    ["set_menu_item_availability", { menu: "Dinner", item: "Burrata", availability: "sold_out" }],
    ["update_menu_item", { menu: "Dinner", item: "Burrata", price: "16" }],
  ])("%s", (toolName, input) => {
    it("holds the change for the user's confirmation", async () => {
      const tools = createAgentTools(log, api as never, { venueId: "v1" });

      const result = await tools[toolName]!.execute!(input as never, toolCtx);

      expect(result).toMatchObject({ pendingConfirmation: true });
      expect(api.menus.updateItem).not.toHaveBeenCalled();
    });

    it("needs a selected venue", async () => {
      const tools = createAgentTools(log, api as never, {
        confirmedAction: { actionId: "call-1", toolName, toolInput: input },
      });

      const result = await tools[toolName]!.execute!(input as never, toolCtx);

      expect(result).toMatchObject({ error: expect.stringContaining("No venue") });
      expect(api.menus.list).not.toHaveBeenCalled();
    });

    it("passes on a 403 in plain words", async () => {
      api.menus.updateItem.mockRejectedValue(problem(403));

      const result = await run(toolName, input);

      expect(result).toMatchObject({ refused: true, error: expect.stringMatching(/permission/i) });
    });
  });
});
