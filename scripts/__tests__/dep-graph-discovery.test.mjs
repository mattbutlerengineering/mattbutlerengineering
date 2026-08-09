import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildGraph,
  classifyType,
  scanScriptsImports,
  resolveGlob,
  root,
  ENTRYPOINT_PACKAGES,
} from "../dep-graph-discovery.mjs";

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

describe("resolveGlob", () => {
  it("sorts wildcard-branch output canonically, independent of readdir order", () => {
    // Real dirents for a real wildcard dir, so existsSync() checks inside
    // resolveGlob still resolve — only the *order* readdir hands back is
    // shuffled, simulating filesystem-dependent readdirSync iteration
    // order (APFS vs. ext4) referenced in #4001.
    const realEntries = readdirSync(join(root, "packages"), { withFileTypes: true });
    const reversed = [...realEntries].reverse();
    // A second, differently-shuffled order (not just the reverse) so a
    // coincidental match between two orderings can't mask a missing sort.
    const scrambled = [...realEntries].sort(() => 0.5 - Math.random());

    const fromReversed = resolveGlob("packages/*", root, { readdir: () => reversed }).map(
      (r) => r.wsDir
    );
    const fromScrambled = resolveGlob("packages/*", root, { readdir: () => scrambled }).map(
      (r) => r.wsDir
    );

    const canonical = [...fromReversed].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    expect(fromReversed).toEqual(canonical);
    expect(fromScrambled).toEqual(canonical);
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

  it("discovers @mbe/gh-client as consumed by @mbe/scripts via source import scan", () => {
    const graph = buildGraph();
    const edge = graph.edges.find((e) => e.from === "@mbe/scripts" && e.to === "@mbe/gh-client");
    expect(edge).toBeDefined();
  });

  it("tags known standalone entrypoint packages", () => {
    const graph = buildGraph();
    for (const name of ENTRYPOINT_PACKAGES) {
      const node = graph.nodes.find((n) => n.name === name);
      expect(node, `missing node for entrypoint package ${name}`).toBeDefined();
      expect(node.entrypoint, `${name} should be tagged entrypoint`).toBe(true);
    }
  });

  it("does not tag regular packages as entrypoint", () => {
    const graph = buildGraph();
    const node = graph.nodes.find((n) => n.name === "@mbe/config");
    expect(node.entrypoint).toBeUndefined();
  });

  it("does not duplicate an edge already declared in package.json", () => {
    const graph = buildGraph();
    const matches = graph.edges.filter(
      (e) => e.from === "@mbe/scripts" && e.to === "@mbe/gh-client"
    );
    expect(matches.length).toBe(1);
  });
});

describe("scanScriptsImports", () => {
  it("finds an edge for every @mbe/* import statement in scripts/ source files", () => {
    const nameSet = new Set(["@mbe/gh-client", "@mbe/agent-core", "@mbe/scripts"]);
    const edges = scanScriptsImports(nameSet);
    const targets = edges.map((e) => e.to);
    expect(targets).toContain("@mbe/gh-client");
    expect(targets).toContain("@mbe/agent-core");
  });

  it("only produces edges from @mbe/scripts", () => {
    const nameSet = new Set(["@mbe/gh-client", "@mbe/agent-core"]);
    const edges = scanScriptsImports(nameSet);
    expect(edges.every((e) => e.from === "@mbe/scripts")).toBe(true);
    expect(edges.every((e) => e.type === "dependency")).toBe(true);
  });

  it("ignores import specifiers not present in the known name set", () => {
    const nameSet = new Set(["@mbe/nonexistent-package"]);
    const edges = scanScriptsImports(nameSet);
    expect(edges.length).toBe(0);
  });

  it("deduplicates repeated imports of the same package across files", () => {
    const nameSet = new Set(["@mbe/gh-client"]);
    const edges = scanScriptsImports(nameSet);
    const ghClientEdges = edges.filter((e) => e.to === "@mbe/gh-client");
    expect(ghClientEdges.length).toBe(1);
  });
});
