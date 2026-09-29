const CRITERIA = [
  {
    id: "aef:structural-gates",
    source: "agentic-engineering-framework",
    level: 2,
    category: "governance",
    name: "Structural gates",
    description:
      "Config-enforced gates that block agents from touching protected areas without review.",
    rationale:
      "The framework treats structural gates as the primary mechanism for scoping agent authority — code can lie, config cannot.",
    details:
      "Structural gates are config files (like CODEOWNERS or boundary definitions) that prevent AI agents from modifying protected areas — such as auth modules, database migrations, or deployment configs — without explicit human review. They scope what the AI is allowed to touch. An AI mission will create a CODEOWNERS file or agent boundary config based on your project's sensitive directories.",
    detection: {
      type: "any-of",
      pattern: [
        "CODEOWNERS",
        ".github/CODEOWNERS",
        ".agent/boundaries.yml",
        "docs/agent-boundaries.md",
      ],
    },
  },
  {
    id: "aef:component-fabric",
    source: "agentic-engineering-framework",
    level: 4,
    category: "governance",
    name: "Component dependency fabric",
    description:
      "Structural mapping of file-level dependencies with automated blast-radius and impact analysis.",
    rationale:
      "The framework: understanding what a change will break before making it is foundational to safe agent operations — behavioral tests catch failures after the fact, structural analysis prevents them.",
    details:
      "A component dependency fabric is a registry of YAML component cards that map file-level dependencies, reverse-dependencies, subsystems, and interfaces. Commands like blast-radius and impact analysis reveal the transitive downstream chain before any change is made. This goes beyond static risk tiers (which files are dangerous) to dynamic dependency tracking (which files are connected). An AI mission will create a component registry and dependency analysis tooling for your project.",
    detection: {
      type: "any-of",
      pattern: [
        ".fabric/subsystems.yaml",
        ".fabric/components/",
        ".fabric/watch-patterns.yaml",
        "agents/fabric/",
      ],
    },
  },
];

export const agenticEngineeringFrameworkSource = {
  id: "agentic-engineering-framework",
  name: "Agentic Engineering Framework",
  url: "https://github.com/DimitriGeelen/agentic-engineering-framework",
  citation:
    "Agentic Engineering Framework: Governance patterns for AI coding agents. github.com/DimitriGeelen/agentic-engineering-framework",
  definesLevels: false,
  criteria: CRITERIA,
};
