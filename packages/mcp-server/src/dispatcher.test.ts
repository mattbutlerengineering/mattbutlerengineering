import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTool, callTool, listTools } from "./dispatcher.js";

describe("defineTool registry", () => {
  const echoSchema = z.object({ message: z.string() });
  const noArgSchema = z.object({});

  const tools = [
    defineTool({
      name: "echo",
      description: "Echo the message back",
      inputSchema: echoSchema,
      handler: async (args) => `echoed: ${args.message}`,
    }),
    defineTool({
      name: "no_args",
      description: "A tool with no args",
      inputSchema: noArgSchema,
      handler: async () => "no-args result",
    }),
    defineTool({
      name: "throws",
      description: "A tool that throws",
      inputSchema: noArgSchema,
      handler: async () => {
        throw new Error("handler exploded");
      },
    }),
  ];

  describe("listTools", () => {
    it("returns MCP tool descriptor for each registered tool", () => {
      const list = listTools(tools);
      expect(list).toHaveLength(3);
      expect(list[0]).toMatchObject({ name: "echo", description: "Echo the message back" });
      expect(list[0].inputSchema).toBeDefined();
    });
  });

  describe("callTool", () => {
    it("dispatches a known tool and returns text envelope", async () => {
      const result = await callTool(tools, "echo", { message: "hello" });
      expect(result).toEqual({ content: [{ type: "text", text: "echoed: hello" }] });
    });

    it("dispatches no-arg tool", async () => {
      const result = await callTool(tools, "no_args", {});
      expect(result).toEqual({ content: [{ type: "text", text: "no-args result" }] });
    });

    it("returns error envelope for unknown tool name", async () => {
      const result = await callTool(tools, "unknown_tool", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("unknown_tool");
    });

    it("catches throwing handler and returns error envelope", async () => {
      const result = await callTool(tools, "throws", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("handler exploded");
    });

    it("returns error envelope when args fail schema validation", async () => {
      const result = await callTool(tools, "echo", { message: 42 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/validation|invalid/i);
    });

    it("returns error envelope when required arg is missing", async () => {
      const result = await callTool(tools, "echo", {});
      expect(result.isError).toBe(true);
    });
  });
});
