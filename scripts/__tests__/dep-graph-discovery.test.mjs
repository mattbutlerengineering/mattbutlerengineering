import { describe, it, expect } from "vitest";
import { buildGraph, classifyType } from "../dep-graph-discovery.mjs";

describe("classifyType", () => {
  it("classifies apps/ as app", () => {
    expect(classifyType("apps/hospitality")).toBe("app");
  });

  it("classifies services/ as service", () => {
    expect(classifyType("services/users")).toBe("service");
  });

  it("classifies packages/ as package", () => {
    expect(classifyType("packages/config")).toBe("package");
  });

  it("classifies tools/ as tool", () => {
    expect(classifyType("tools/cli")).toBe("tool");
  });

  it("classifies infrastructure/ as tool", () => {
    expect(classifyType("infrastructure/pulumi")).toBe("tool");
  });

  it("defaults unknown paths to package", () => {
    expect(classifyType("unknown/thing")).toBe("package");
  });
});

describe("buildGraph", () => {
  it("returns an object with nodes and edges arrays", () => {
    const graph = buildGraph();
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  });

  it("discovers all known workspace packages", () => {
    const graph = buildGraph();
    const names = new Set(graph.nodes.map((n) => n.name));
    expect(names.has("@mbe/config")).toBe(true);
    expect(names.has("@mbe/types")).toBe(true);
    expect(names.has("@mbe/observability")).toBe(true);
    expect(names.has("@mbe/cli")).toBe(true);
  });

  it("includes infrastructure/pulumi as a node", () => {
    const graph = buildGraph();
    const node = graph.nodes.find((n) => n.path === "infrastructure/pulumi");
    expect(node).toBeDefined();
    expect(node.type).toBe("tool");
  });

  it("each node has required fields: name, type, path", () => {
    const graph = buildGraph();
    for (const node of graph.nodes) {
      expect(typeof node.name).toBe("string");
      expect(typeof node.type).toBe("string");
      expect(typeof node.path).toBe("string");
    }
  });

  it("each edge has from, to, type fields", () => {
    const graph = buildGraph();
    for (const edge of graph.edges) {
      expect(typeof edge.from).toBe("string");
      expect(typeof edge.to).toBe("string");
      expect(typeof edge.type).toBe("string");
    }
  });

  it("only includes edges between known nodes", () => {
    const graph = buildGraph();
    const names = new Set(graph.nodes.map((n) => n.name));
    for (const edge of graph.edges) {
      expect(names.has(edge.from), `edge.from unknown: ${edge.from}`).toBe(true);
      expect(names.has(edge.to), `edge.to unknown: ${edge.to}`).toBe(true);
    }
  });

  it("only includes @mbe/* or @mattbutlerengineering/* internal deps", () => {
    const graph = buildGraph();
    for (const edge of graph.edges) {
      const isInternal =
        edge.from.startsWith("@mbe/") || edge.from.startsWith("@mattbutlerengineering/");
      expect(isInternal, `non-internal edge.from: ${edge.from}`).toBe(true);
    }
  });

  it("edge types are dependency or devDependency", () => {
    const graph = buildGraph();
    const validTypes = new Set(["dependency", "devDependency"]);
    for (const edge of graph.edges) {
      expect(validTypes.has(edge.type), `invalid edge.type: ${edge.type}`).toBe(true);
    }
  });

  it("node names are unique", () => {
    const graph = buildGraph();
    const names = graph.nodes.map((n) => n.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("has at least 20 nodes (known workspace size)", () => {
    const graph = buildGraph();
    expect(graph.nodes.length).toBeGreaterThanOrEqual(20);
  });
});
