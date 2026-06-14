# AI Tools for React Development Evaluation — June 2026

> Snapshot of the AI tooling landscape for React work, grounded in a `/last30days` community pull (Reddit + Hacker News + GitHub, 73 items) plus web supplements, then mapped against what this monorepo already uses. Sorted by signal quality, not raw mention count.

## Current State (what this repo uses)

Grounded in `package.json` across `apps/hospitality`, `apps/marketing`, `apps/rialto-web`, `packages/rialto`, and the agent service.

| Dimension                 | Value                                                         |
| ------------------------- | ------------------------------------------------------------- |
| **React**                 | 19.x (Vite + React Router + TanStack Query)                   |
| **Design system**         | rialto (React component lib, Storybook 10)                    |
| **Model abstraction**     | Vercel AI SDK (`ai`) + `@ai-sdk/anthropic`                    |
| **Anthropic SDK**         | `@anthropic-ai/sdk`                                           |
| **Agent runtime**         | `@anthropic-ai/claude-agent-sdk` + in-house `@mbe/agent-core` |
| **LLM observability**     | Langfuse                                                      |
| **Generative UI**         | `@json-render/react` (hospitality + rialto)                   |
| **Front-end chat UI lib** | **None** — AI lives in the agent service, not the React apps  |
| **Dev-time AI tooling**   | Claude Code, claude-mem, graphify, Semgrep MCP                |
| **Editors/agents**        | Cursor / Claude Code standard among contributors              |

## Landscape (last 30 days)

The market splits into three lanes. Experienced devs run ~2.3 tools and pick by job, not by brand.

### 1. AI code editors / agents (where code gets written)

| Tool                       | What it is                    | React signal                                                                                                                             |
| -------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Cursor**                 | AI-native IDE (VS Code fork)  | Composer generates full components with correct TS types + styling; most-adopted editor in 2026. Named as a required skill in job posts. |
| **Claude Code**            | Terminal-native agentic coder | Highest capability ceiling for multi-file/codebase tasks; the "+Claude Code for hard tasks" half of the dominant hybrid.                 |
| **GitHub Copilot**         | Multi-IDE extension           | Best-value inline autocomplete for rapid JSX/CSS.                                                                                        |
| **Windsurf**               | AI IDE                        | Same editor lane; agentic multi-file editing.                                                                                            |
| **Google Antigravity CLI** | Agentic CLI                   | Emerging; discussed as an auxiliary coding tool.                                                                                         |

Evidence: an entry-level Application Developer posting explicitly required Claude Code + Cursor ([r/csMajors](https://www.reddit.com/r/csMajors/comments/1u537ha/onsite_virtual_interview_have_to_use_ai_tools/)); hybrid Cursor/Copilot-daily + Claude-Code-for-complex is the dominant pattern ([SitePoint](https://www.sitepoint.com/claude-code-vs-cursor-vs-copilot-the-2026-developer-comparison/)).

### 2. AI app / UI builders (prompt → working React app)

| Tool             | Best for                                                                               |
| ---------------- | -------------------------------------------------------------------------------------- |
| **v0 by Vercel** | Natural language → React components (shadcn/ui + Tailwind). The React-specialist pick. |
| **Lovable**      | UI-first full-stack apps for non-technical founders (auth + DB + deploy).              |
| **Bolt.new**     | Fastest prototype-to-running-app.                                                      |
| **Replit Agent** | Browser IDE with an AI agent.                                                          |
| **Emergent**     | Autonomous full-stack builds.                                                          |

The community moved off "Bolt.new for everything" to picking by project type ([eesel AI](https://www.eesel.ai/blog/frontend-ai-tools-developers)).

### 3. AI SDKs / libraries embedded IN a React app

| Library                         | Role                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Vercel AI SDK (`ai`)**        | Model-provider abstraction + `useChat`/`useCompletion` hooks. 20M+ monthly downloads; AI SDK 6 current. The default toolkit. |
| **AI Elements**                 | Vercel's composable React components on top of the AI SDK.                                                                   |
| **assistant-ui**                | Production React chat UI (streaming, retries, attachments, markdown, a11y); connects to the AI SDK via `useChatRuntime`.     |
| **CopilotKit**                  | "Copilot sidebar" pattern — AI that reads/modifies the existing React app; runtime + components + MCP tools.                 |
| **Mastra** (`mastra-ai/mastra`) | TS agent framework; a top GitHub voice in the window.                                                                        |

Community framing: AI SDK / assistant-ui / CopilotKit are **layers of an emerging stack**, not competitors ([assistant-ui](https://www.assistant-ui.com/docs/integrations/frameworks/ai-sdk), [GenerativeUI](https://www.generativeui.ru/en/learn/copilotkit-vs-vercel-ai-sdk-vs-thesys)).

## Gaps & Recommendations

1. **No front-end chat-UI library.** We use the Vercel AI SDK but only server-side in the agent service. If we ever surface a chat/copilot in `hospitality` or `rialto-web`, **assistant-ui** (AI-SDK-native, least glue) or **CopilotKit** (sidebar over an existing app) are the natural fits and drop straight onto the existing `ai` + `@ai-sdk/anthropic` wiring. _No action needed until a product surface demands it._
2. **Editor/agent tooling is already aligned** with the market leaders (Cursor, Claude Code). No change.
3. **v0** is worth a look for scaffolding rialto-consistent components, but our design-system-first workflow (rialto + Storybook) limits its value vs. generating against our own catalog.

## Verdict

No adoption required right now — our stack matches the 2026 consensus on the editor and SDK lanes. The one open door is a **front-end AI UI library (assistant-ui / CopilotKit)**, gated on a real in-app AI feature. Revisit if/when a copilot surface is scoped.

---

### Sources

Reddit (r/reactjs "This Week In React #285", r/csMajors, r/webdev, r/PromptEngineering); GitHub (`mastra-ai/mastra`); Hacker News. Web: [eesel.ai](https://www.eesel.ai/blog/frontend-ai-tools-developers), [index.dev](https://www.index.dev/blog/vibe-coding-tools), [sitepoint.com](https://www.sitepoint.com/claude-code-vs-cursor-vs-copilot-the-2026-developer-comparison/), [assistant-ui.com](https://www.assistant-ui.com/), [ai-sdk.dev](https://ai-sdk.dev/docs/introduction), [generativeui.ru](https://www.generativeui.ru/en/learn/copilotkit-vs-vercel-ai-sdk-vs-thesys). Raw engine dump: `~/Documents/Last30Days/ai-tools-used-with-react-raw-v3-2026-06-14.md`.
