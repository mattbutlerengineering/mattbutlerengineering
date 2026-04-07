# Root Signals Evaluation for Agent Self-Improvement — April 2026

## Current State

| Dimension | Value |
|-----------|-------|
| **Agent evaluation** | `success-evaluator.ts` — LLM-as-a-judge (Claude Haiku), pass/fail + confidence + reasoning |
| **Failure learning** | `failure-memory.ts` — local JSON store, word-overlap similarity search, 100-record rolling window |
| **Tracing / observability** | Langfuse (added in #351) — traces, prompt management, datasets, LLM-as-a-judge scoring |
| **Evaluation granularity** | Binary pass/fail with a confidence score. No multi-dimensional rubrics. |
| **Agent pipeline** | `session-runner.ts` → `success-evaluator.ts` → `failure-memory.ts` → `pr-creator.ts` |
| **Monthly AI eval cost** | ~$0.05 max per session (Haiku, capped in `EvaluationConfig`) |

### What the Existing Evaluator Does Well

- Zero external dependencies — evaluation runs inside the agent pipeline via Claude Haiku
- Structured JSON output from the Anthropic SDK (`outputFormat: json_schema`) — reliable parsing
- Smart skip heuristics (`shouldEvaluate`) avoid spending tokens on trivial diffs, dep bumps, test-only changes
- Acceptance criteria extraction from GitHub issue bodies feeds directly into the prompt

### What It Lacks

- **Rubric scoring** — single pass/fail verdict; no per-dimension scores (clarity, security, correctness, etc.)
- **Calibration across sessions** — no trend data; a 70% confidence pass looks identical to 99%
- **Production monitoring** — evaluates only during the agent pipeline, not on live outputs in production
- **Hallucination detection** — no specialized check for fabricated file paths, invented APIs, or false claims
- **Automated regression testing** — no dataset-level evaluation to catch prompt regressions before deploying

---

## What Root Signals Offers

Root Signals (now rebranding as Scorable) is a Helsinki-based LLM evaluation platform founded in 2023. It raised $2.8M seed in September 2024 and has trained a proprietary judge LLM (Root Judge, based on Llama-3.3-70B) specifically for evaluation tasks.

### Core Platform

| Feature | Details |
|---------|---------|
| **Built-in evaluators** | 30+ off-the-shelf evaluators: relevance, faithfulness, conciseness, toxicity, PII detection, instruction following, hallucination detection |
| **Custom evaluators** | Define criteria in natural language; calibrate against your own labeled examples |
| **Judges (composite)** | Combine multiple evaluators into a single judge — an LLM-as-a-judge that returns a bundle of scores in one call |
| **RAG evaluation** | Dedicated faithfulness-to-context and retrieval relevance evaluators for RAG pipelines |
| **Coding policy adherence** | Evaluator that reads policy documents (CLAUDE.md, coding-style.md, etc.) and scores adherence |
| **Production monitoring** | Continuous evaluation of live interactions; alerts on quality degradation |
| **Root Judge LLM** | Fine-tuned Llama-3.3-70B trained on millions of evaluation examples. Claims SOTA on hallucination detection benchmarks, outperforming GPT-4o and Claude Sonnet 3.5 on HaluBench at fraction of cost |

### MCP Server (`root-signals/root-signals-mcp`)

The MCP server exposes the Root Signals API as tools callable by any MCP-compatible AI client (Claude Code, Cursor, etc.). It is published at `ghcr.io/root-signals/root-signals-mcp` and can run via Docker, `uvx`, or npm.

**Exposed tools:**

| Tool | What It Does |
|------|-------------|
| `list_evaluators` | Enumerate all evaluators in the account |
| `run_evaluation` | Score a (request, response) pair against a specific evaluator by ID |
| `run_evaluation_by_name` | Same, but look up evaluator by name |
| `list_judges` | Enumerate composite judges |
| `run_judge` | Run a composite judge (multi-evaluator bundle) on a pair |
| `run_coding_policy_adherence` | Evaluate a code diff against policy docs (rules files) |

The MCP use case is "AI agent self-evaluation": an agent can invoke `run_evaluation` mid-session to score its own output, detect quality issues, and revise before submitting. For Claude Code agents, this would slot in after generating a diff but before committing.

### Langfuse Integration

Root Signals has a first-class Langfuse integration (`docs.scorable.ai/integrations/langfuse`): Root Signals judges can evaluate Langfuse traces directly, and scores are written back as Langfuse score objects. This means the two tools are complementary, not competing — Langfuse handles tracing and storage; Root Signals handles specialized evaluation judgment.

### Pricing

| Plan | Price | Evaluations | Notes |
|------|-------|-------------|-------|
| **Free** | $0/mo | 100/day | 1 seat, custom + built-in evaluators, 6-month data retention, Intercom support |
| **Team** | $19/seat/mo | 5,000/mo + $20 per additional 5K | Up to 5 seats, custom models, unlimited retention |
| **Enterprise** | Custom | 100,000+/mo | Unlimited seats, on-premise, SLA, Slack support, SAML/Okta, RBAC |

100 evaluations/day free is approximately 3,000/month — sufficient for a solo developer agent pipeline if evaluations run per PR rather than per agent turn.

---

## Evaluation Against Our Needs

| Need | Current Stack | Root Signals |
|------|--------------|-------------|
| **Pass/fail evaluation** | `success-evaluator.ts` — solid, zero-cost | Redundant — would add cost without benefit for basic pass/fail |
| **Multi-dimensional rubric scoring** | Not available | Strong — 30+ built-in, custom rubrics configurable |
| **Coding policy adherence** | Not available | `run_coding_policy_adherence` reads our rules files directly |
| **Hallucination detection** | Not available | Root Judge claims SOTA on HaluBench vs GPT-4o/Sonnet 3.5 |
| **Production monitoring** | Not available | Built-in continuous evaluation with alerting |
| **Agent self-improvement loop** | `failure-memory.ts` (local JSON, word-overlap) | MCP self-evaluation tools, calibration, trend dashboards |
| **Tracing + evaluation storage** | Langfuse (tracing) | Integrates with Langfuse — writes scores back as Langfuse objects |
| **Cost** | ~$0.05/session (Haiku) | Free tier covers ~3K evals/mo; paid at $19/mo |
| **Integration complexity** | Internal — no external API | Requires `ROOT_SIGNALS_API_KEY`; Docker or npx for MCP server |
| **Self-hosted option** | N/A | Not available — SaaS only |
| **Vendor risk** | None | Seed-stage startup ($2.8M, 2024); no self-hosted fallback |

### Differentiated Value Analysis

**Where Root Signals adds genuine value over what we have:**

1. **`run_coding_policy_adherence`** — Our `coding-style.md`, `security.md`, and rules files could be passed directly to this evaluator, giving us automated policy-gate scoring that Langfuse's LLM-as-a-judge doesn't provide out of the box without manual prompt engineering.

2. **Root Judge hallucination detection** — The current `success-evaluator.ts` uses Claude Haiku for pass/fail and has no special hallucination awareness. Root Judge is purpose-trained for this and claims better accuracy at lower cost than Haiku for this specific task.

3. **Multi-dimensional scores** — Our evaluator returns one confidence number. Root Signals judges return per-criterion scores (faithfulness: 0.9, conciseness: 0.6, policy adherence: 1.0), which Langfuse can store as separate score objects and trend over time.

4. **MCP self-evaluation for coding agents** — The `run_coding_policy_adherence` MCP tool is directly usable in Claude Code agent sessions without any integration work beyond adding the server to `.mcp.json`.

**Where Root Signals does NOT add value:**

- Basic pass/fail evaluation — already solved by `success-evaluator.ts` at near-zero cost
- Tracing and observability — Langfuse covers this; Root Signals doesn't replace it
- Failure memory and cross-session learning — `failure-memory.ts` is simple but functional; Root Signals monitoring is production-output-focused, not agent-session-failure-focused
- Agent orchestration or session management — Root Signals is evaluation-only

---

## Recommendation

**Adopt partially: use the MCP server for coding policy adherence evaluation in agent sessions. Do not replace `success-evaluator.ts`.**

### What to Adopt

**Phase 1 (immediate, zero infrastructure cost): MCP server in `.mcp.json`**

Add the Root Signals MCP server to the project's `.mcp.json`. This gives Claude Code agents in-session access to `run_coding_policy_adherence` and `run_evaluation`. No pipeline changes required — the agent can choose to invoke evaluators mid-session.

Cost: Free tier (100 evals/day). The MCP server runs locally via Docker or `uvx`; no persistent service needed.

**Phase 2 (if agent output quality becomes a measurable concern): Integration into `success-evaluator.ts`**

After Langfuse tracing is in place and we have a baseline of pass/fail scores, consider augmenting `evaluateSuccess` with a Root Signals coding policy check as a parallel signal. If policy adherence < 0.8, that's an additional factor that can flip a borderline "passed" to "failed". This requires a `ROOT_SIGNALS_API_KEY` environment variable and ~2–3 API calls per evaluation.

### What NOT to Adopt

- Do not migrate the core pass/fail evaluator to Root Signals — the current Haiku-based approach is cheaper, simpler, and already works
- Do not adopt production monitoring now — we have no production AI output traffic that warrants continuous evaluation; Langfuse tracing covers the diagnostic need
- Do not adopt the Team plan ($19/mo) until the free tier is exceeded

### Vendor Risk Assessment

Root Signals is a seed-stage startup (2024, $2.8M raised). There is meaningful risk of pivot, acquisition, or shutdown. Mitigations:

- The MCP server is open-source (`root-signals/root-signals-mcp` on GitHub) — the interface is inspectable and replaceable
- The integration is thin (one MCP tool call); switching cost is low if the vendor disappears
- Phase 2 integration should be abstracted behind the existing `EvaluationConfig` interface so the provider can be swapped
- No self-hosted option means SaaS dependency is unavoidable if adopted

### Alternatives

If Root Signals stops working or pricing becomes unfavorable:

| Alternative | Notes |
|------------|-------|
| **Langfuse LLM-as-a-judge** | Already integrated; supports custom evaluation prompts; less specialized for coding policy |
| **Deepeval** | Open-source, self-hosted, 20+ metrics including G-Eval and DAG evaluators |
| **PromptFoo** | Open-source evaluation framework; config-driven; strong for regression testing datasets |
| **In-house rubric expansion** | Extend `success-evaluator.ts` with structured criteria; stays zero-dependency |

---

## Proof of Concept: MCP Server Configuration

The Root Signals MCP server is added to `.mcp.json` alongside the existing Langfuse MCP server.

**Installation:**
```bash
# Via Docker (persistent daemon)
docker run -e ROOT_SIGNALS_API_KEY=<your_key> -p 0.0.0.0:9090:9090 --name=rs-mcp -d ghcr.io/root-signals/root-signals-mcp:latest

# Via uvx (on-demand, no persistent service)
ROOT_SIGNALS_API_KEY=<your_key> uvx --from git+https://github.com/root-signals/root-signals-mcp root-signals-mcp
```

**Example agent self-evaluation (within a Claude Code session):**

An agent generating a diff can invoke:
```
run_coding_policy_adherence(
  request="Implement the auth token refresh hook",
  response=<diff>,
  policy_documents=["CLAUDE.md", ".claude/rules/common/coding-style.md"]
)
→ { score: 0.85, justification: "Diff uses immutable patterns (spread) and handles errors. One function exceeds 50 lines." }
```

This gives per-session policy scoring that currently requires manual code review.

---

## Decision

| Decision | Rationale |
|----------|-----------|
| Add Root Signals MCP to `.mcp.json` | Zero cost, zero infrastructure; immediately useful in Claude Code sessions |
| Keep `success-evaluator.ts` unchanged | Already works; replacement would add cost and complexity for no gain |
| Defer Phase 2 pipeline integration | Wait until Langfuse baseline reveals specific quality gaps worth targeting |
| Revisit at 6-month mark | Reassess vendor stability and whether free tier limits are hit |
