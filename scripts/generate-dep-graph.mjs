#!/usr/bin/env node

/**
 * Generates a JSON dependency graph of workspace packages.
 *
 * Delegates workspace discovery to dep-graph-discovery.mjs (canonical module)
 * and writes JSON to infrastructure/worker/dep-graph.json.
 *
 * Usage: node scripts/generate-dep-graph.mjs
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildGraph, root } from "./dep-graph-discovery.mjs";

const graph = buildGraph();
const outputPath = join(root, "infrastructure", "worker", "dep-graph.json");

writeFileSync(outputPath, JSON.stringify(graph, null, 2) + "\n");

console.log(
  `Generated dependency graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges → ${outputPath}`
);
