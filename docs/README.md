# Documentation

Project documentation for the mattbutlerengineering monorepo. For AI-specific context, see `CLAUDE.md` and `AGENTS.md` at the repo root.

## Directory Map

| Directory                                | Contents                                                     |
| ---------------------------------------- | ------------------------------------------------------------ |
| [`adr/`](adr/)                           | Architecture Decision Records (ADR-001 through ADR-006)      |
| [`acmm/`](acmm/)                         | AI Codebase Maturity Model assessments and gap analyses      |
| [`agent-tasks/`](agent-tasks/)           | Agent task traceability and lifecycle docs                   |
| [`architecture/`](architecture/)         | Dependency graph and structural documentation                |
| [`design/`](design/)                     | Product design documents and PRDs                            |
| [`evaluations/`](evaluations/)           | Technology evaluation reports (21 completed)                 |
| [`incidents/`](incidents/)               | Incident post-mortems (empty -- no incidents yet)            |
| [`logs/`](logs/)                         | Agent performance logs and audit state (`agent-perf.jsonl`)  |
| [`metrics/`](metrics/)                   | PR acceptance and quality metrics (`pr-acceptance.json`)     |
| [`one-man-dev-team/`](one-man-dev-team/) | Solo developer playbook and architecture guide               |
| [`plans/`](plans/)                       | Historical platform design and roadmap documents             |
| [`reflections/`](reflections/)           | Lessons learned from AI sessions (ACMM L5)                   |
| [`research/`](research/)                 | Weekly research intake notes                                 |
| [`runbooks/`](runbooks/)                 | Operational runbooks for CI, deploys, services, static sites |
| [`security/`](security/)                 | Security-specific docs (prompt injection guide)              |

## Top-Level Documents

| File                                                   | Purpose                                        |
| ------------------------------------------------------ | ---------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                   | System architecture overview                   |
| [`CROSS-SERVICE-FLOWS.md`](CROSS-SERVICE-FLOWS.md)     | Cross-service request flow documentation       |
| [`API-VERSIONING.md`](API-VERSIONING.md)               | API versioning strategy                        |
| [`TURBO.md`](TURBO.md)                                 | Turborepo configuration and pipeline reference |
| [`WORKTREE-LIFECYCLE.md`](WORKTREE-LIFECYCLE.md)       | Agent worktree lifecycle management            |
| [`CHEATSHEET.md`](CHEATSHEET.md)                       | Quick reference for common operations          |
| [`SECRETS.md`](SECRETS.md)                             | Secret management guide                        |
| [`SECURITY-AI.md`](SECURITY-AI.md)                     | AI security policies                           |
| [`AGENT-WORKFLOW.md`](AGENT-WORKFLOW.md)               | Agent workflow documentation                   |
| [`NEXT_STEPS.md`](NEXT_STEPS.md)                       | Planned next steps                             |
| [`acmm.md`](acmm.md)                                   | ACMM overview and scoring                      |
| [`change-classification.md`](change-classification.md) | PR risk tier classification                    |
| [`change-tiers.md`](change-tiers.md)                   | Change tier definitions                        |
| [`governance.md`](governance.md)                       | Branch protection and review policies          |
| [`ideal-stack.md`](ideal-stack.md)                     | Ideal technology stack summary                 |
| [`review-criteria.md`](review-criteria.md)             | Code review criteria                           |
| [`rollback.md`](rollback.md)                           | Rollback procedures                            |
| [`ship-loop-learnings.md`](ship-loop-learnings.md)     | Learnings from the ship loop                   |
| [`ai-ops-runbook.md`](ai-ops-runbook.md)               | AI operations runbook                          |
| [`autonomous-work-log.md`](autonomous-work-log.md)     | Log of autonomous agent work                   |

## Entry Points

- **New to the project?** Start with [`ARCHITECTURE.md`](ARCHITECTURE.md) and the repo root `AGENTS.md`
- **Choosing technology?** See [`evaluations/`](evaluations/) for 21 completed evaluations
- **Understanding a decision?** Check [`adr/`](adr/) for architecture decision records
- **Debugging production?** See [`runbooks/`](runbooks/) for operational procedures
- **Working with agents?** See [`agent-tasks/`](agent-tasks/) and [`AGENT-WORKFLOW.md`](AGENT-WORKFLOW.md)
