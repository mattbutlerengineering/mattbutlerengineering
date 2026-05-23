import { acmmSource } from "./acmm.js";
import { fullsendSource } from "./fullsend.js";
import { agenticEngineeringFrameworkSource } from "./agentic-engineering-framework.js";
import { claudeReflectSource } from "./claude-reflect.js";
import { META_CRITERIA } from "../meta-criteria.js";

const metaSource = {
  id: "meta",
  name: "Meta Self-Improvement",
  description: "Criteria that detect whether the improvement system is improving itself",
  criteria: META_CRITERIA,
};

export const SOURCES = [
  acmmSource,
  fullsendSource,
  agenticEngineeringFrameworkSource,
  claudeReflectSource,
  metaSource,
];

export const SOURCES_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

export const ALL_CRITERIA = SOURCES.flatMap((s) => s.criteria);

export const ACMM_LEVELS = acmmSource.levels ?? [];
