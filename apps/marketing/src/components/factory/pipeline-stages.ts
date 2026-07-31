import { REPO_STATS, type RepoStats } from "../../data/repo-stats.js";

/** A measured figure attached to a stage — never a rounded or aspirational one. */
export interface StageMetric {
  readonly value: number;
  readonly label: string;
}

/** One gate on the shipping line, as it appears in the DOM beneath the scene. */
export interface PipelineStage {
  readonly id: string;
  /** Zero-padded position, so the order survives a single-column layout. */
  readonly step: string;
  readonly name: string;
  readonly detail: string;
  /** Present only where the repo actually counts something for this stage. */
  readonly metric?: StageMetric;
}

/**
 * The six stages an issue passes through, in order.
 *
 * Every figure here is one the build-time collector measured out of the repo —
 * stages the repo does not count (issue intake) carry no number rather than an
 * invented one.
 */
export function buildPipelineStages(stats: RepoStats): readonly PipelineStage[] {
  return [
    {
      id: "issues",
      step: "01",
      name: "Issues",
      detail: "Audits, sensors and error triage file the work.",
    },
    {
      id: "agents",
      step: "02",
      name: "Agents",
      detail: "Claimed one at a time, each in its own worktree.",
      metric: { value: stats.agentPrsMerged, label: "agent PRs merged" },
    },
    {
      id: "tdd",
      step: "03",
      name: "TDD",
      detail: "A failing test first, then the smallest code that passes.",
      metric: { value: stats.testFiles, label: "test files" },
    },
    {
      id: "review",
      step: "04",
      name: "Review gates",
      detail: "Lint, typecheck, tests, architecture audit.",
      metric: { value: 4, label: "blocking gates" },
    },
    {
      id: "merge",
      step: "05",
      name: "Auto-merge",
      detail: "Green pull requests merge themselves. Red ones wait.",
      metric: { value: stats.totalPrsMerged, label: "pull requests merged" },
    },
    {
      id: "deploy",
      step: "06",
      name: "Deploy",
      detail: "Cloudflare for the sites, DigitalOcean for the APIs.",
      metric: { value: stats.rialtoComponents, label: "components shipped" },
    },
  ];
}

/** Stages rendered on the landing page, measured at last deploy. */
export const PIPELINE_STAGES = buildPipelineStages(REPO_STATS);

/** Real-number inputs the WebGL factory floor is driven by. */
export interface FactorySceneInputs {
  /** Fraction of merged work that agents authored, 0–1. */
  readonly agentShare: number;
  /** Particles on the line — more merged work, busier floor. */
  readonly particleCount: number;
}

/** Smallest population that still reads as a flowing line. */
const MIN_PARTICLES = 320;
/** Ceiling that keeps the single draw call cheap on integrated graphics. */
const MAX_PARTICLES = 1200;
/** Merged pull requests per particle above the floor. */
const PRS_PER_PARTICLE = 2;

/**
 * Translate the repo snapshot into scene parameters.
 *
 * Clamped rather than trusted: the snapshot crosses a file boundary and a
 * degenerate one must still produce a scene, not a divide-by-zero or a
 * million-particle draw call.
 */
export function factorySceneInputs(stats: RepoStats): FactorySceneInputs {
  const agentShare =
    stats.totalPrsMerged > 0 ? Math.min(1, stats.agentPrsMerged / stats.totalPrsMerged) : 0;

  return {
    agentShare,
    particleCount: Math.min(
      MAX_PARTICLES,
      MIN_PARTICLES + Math.round(stats.totalPrsMerged / PRS_PER_PARTICLE)
    ),
  };
}
