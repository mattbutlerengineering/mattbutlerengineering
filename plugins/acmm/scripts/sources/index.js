import { acmmSource } from './acmm.js'
import { fullsendSource } from './fullsend.js'
import { agenticEngineeringFrameworkSource } from './agentic-engineering-framework.js'
import { claudeReflectSource } from './claude-reflect.js'

export const SOURCES= [
  acmmSource,
  fullsendSource,
  agenticEngineeringFrameworkSource,
  claudeReflectSource,
]

export const SOURCES_BY_ID= Object.fromEntries(
  SOURCES.map((s) => [s.id, s]),
)

export const ALL_CRITERIA= SOURCES.flatMap((s) => s.criteria)

export const ACMM_LEVELS = acmmSource.levels ?? []


