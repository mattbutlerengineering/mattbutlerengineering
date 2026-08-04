import { describe, it, expect } from "vitest";
import { buildPipelineStages, factorySceneInputs, PIPELINE_STAGES } from "./pipeline-stages.js";
import { REPO_STATS } from "../../data/repo-stats.js";

const STATS = {
  agentPrsMerged: 900,
  totalPrsMerged: 1500,
  rialtoComponents: 80,
  testFiles: 800,
  measuredAt: "2026-07-29T00:00:00.000Z",
} as const;

describe("buildPipelineStages", () => {
  it("describes the six stages in shipping order", () => {
    expect(buildPipelineStages(STATS).map((stage) => stage.id)).toEqual([
      "issues",
      "agents",
      "tdd",
      "review",
      "merge",
      "deploy",
    ]);
  });

  it("numbers the stages from 01 so the order is legible without the diagram", () => {
    expect(buildPipelineStages(STATS).map((stage) => stage.step)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
    ]);
  });

  it.each([
    ["agents", STATS.agentPrsMerged],
    ["tdd", STATS.testFiles],
    ["merge", STATS.totalPrsMerged],
    ["deploy", STATS.rialtoComponents],
  ])("attaches the measured repo figure to the %s stage", (id, value) => {
    const stage = buildPipelineStages(STATS).find((candidate) => candidate.id === id);
    expect(stage?.metric?.value).toBe(value);
  });

  it("leaves stages without a measured figure unquantified rather than inventing one", () => {
    const issues = buildPipelineStages(STATS).find((stage) => stage.id === "issues");
    expect(issues?.metric).toBeUndefined();
  });

  it("gives every stage a name and a one-line detail", () => {
    for (const stage of buildPipelineStages(STATS)) {
      expect(stage.name.length).toBeGreaterThan(0);
      expect(stage.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("PIPELINE_STAGES", () => {
  it("is built from the repository's own measurements", () => {
    expect(PIPELINE_STAGES).toEqual(buildPipelineStages(REPO_STATS));
  });
});

describe("factorySceneInputs", () => {
  it("derives the agent share of merged work from the real counts", () => {
    expect(factorySceneInputs(STATS).agentShare).toBeCloseTo(900 / 1500, 5);
  });

  it("clamps the agent share to a ratio even if the snapshot is inconsistent", () => {
    const inconsistent = { ...STATS, agentPrsMerged: 4000, totalPrsMerged: 1000 };
    expect(factorySceneInputs(inconsistent).agentShare).toBe(1);
  });

  it("treats an empty repository as a zero share rather than dividing by zero", () => {
    const empty = { ...STATS, agentPrsMerged: 0, totalPrsMerged: 0 };
    expect(factorySceneInputs(empty).agentShare).toBe(0);
  });

  it("scales the population with merged volume but keeps it inside a fixed budget", () => {
    const quiet = factorySceneInputs({ ...STATS, totalPrsMerged: 1 }).particleCount;
    const busy = factorySceneInputs({ ...STATS, totalPrsMerged: 500_000 }).particleCount;
    expect(quiet).toBeGreaterThan(0);
    expect(busy).toBeGreaterThan(quiet);
    expect(busy).toBeLessThanOrEqual(1200);
  });
});
