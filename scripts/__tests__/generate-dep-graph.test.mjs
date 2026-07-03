import { describe, it, expect } from "vitest";
import { toMermaidId, generateMermaid } from "../generate-dep-graph.js";

describe("toMermaidId", () => {
  it("strips the @mbe/ scope and replaces dashes with underscores", () => {
    expect(toMermaidId("@mbe/agent-core")).toBe("agent_core");
  });

  it("strips the @mattbutlerengineering/ scope to produce a valid mermaid id", () => {
    expect(toMermaidId("@mattbutlerengineering/rialto")).toBe("rialto");
  });
});

describe("generateMermaid", () => {
  const graph = {
    nodes: [
      { name: "@mattbutlerengineering/rialto", type: "package", path: "packages/rialto" },
      { name: "@mbe/mcp-server", type: "package", path: "packages/mcp-server", entrypoint: true },
      { name: "@mbe/config", type: "package", path: "packages/config" },
      { name: "@mbe/scripts", type: "package", path: "scripts" },
      { name: "@mbe/gh-client", type: "package", path: "packages/gh-client" },
    ],
    edges: [
      { from: "@mattbutlerengineering/rialto", to: "@mbe/config", type: "devDependency" },
      { from: "@mbe/scripts", to: "@mbe/gh-client", type: "dependency" },
    ],
  };

  it("never emits a raw @ scoped id in the mermaid output", () => {
    const mermaid = generateMermaid(graph);
    expect(mermaid).not.toContain("@mattbutlerengineering/rialto");
    expect(mermaid).not.toContain("@mbe/");
  });

  it("renders the scripts package and its edge into the visible graph", () => {
    const mermaid = generateMermaid(graph);
    expect(mermaid).toContain("scripts --> gh_client");
  });

  it("assigns the entrypoint classDef to tagged entrypoint packages", () => {
    const mermaid = generateMermaid(graph);
    expect(mermaid).toContain("classDef entrypoint");
    expect(mermaid).toContain("class mcp_server entrypoint");
  });

  it("does not assign the entrypoint class to regular packages", () => {
    const mermaid = generateMermaid(graph);
    expect(mermaid).toContain("class config shared");
  });

  it("never reuses a node id as a subgraph id (mermaid requires unique ids)", () => {
    const mermaid = generateMermaid(graph);
    const subgraphIds = [...mermaid.matchAll(/subgraph (\S+)\[/g)].map((m) => m[1]);
    const nodeIds = [...mermaid.matchAll(/^\s{4}(\S+)\[/gm)].map((m) => m[1]);
    for (const id of subgraphIds) {
      expect(nodeIds, `subgraph id "${id}" collides with a node id`).not.toContain(id);
    }
  });
});
