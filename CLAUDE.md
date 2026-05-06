# Knowledge Graph Explorer — AI 助手规范

AI-powered knowledge graph extraction and exploration tool. Submit text, get an interactive D3 force-directed graph of entities and their relationships, with streaming AI analysis on each node.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, D3.js 7, Tailwind CSS 4 |
| Backend | Express 4, OpenAI SDK, Vite dev middleware |
| AI | OpenAI API (chat completions with `json_object` response format, SSE streaming for expand) |
| Animation | Motion (Framer Motion) |
| Icons | Lucide React |

## Build Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (Express + Vite HMR) on `http://localhost:3000` |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |
| `npm run clean` | Remove `dist/` |

## Code Organization

| Path | Purpose |
|------|---------|
| `src/App.tsx` | Root component — split-pane layout, graph state management, API orchestration, text selection handler |
| `src/main.tsx` | React entry point, renders `<App />` into `#root` |
| `src/index.css` | Tailwind CSS v4 import (`@import "tailwindcss"`) |
| `src/components/TextInput.tsx` | Text submission form with loading state |
| `src/components/KnowledgeGraph.tsx` | D3 force simulation — renders nodes/links, zoom/drag/hover, semantic label scaling |
| `src/components/AnalysisPanel.tsx` | Markdown analysis display, suggested explorations, text selection floating button |
| `src/lib/graphUtils.ts` | `mergeGraphData()` — de-duplicates nodes by id and edges by source-target-relation key |
| `src/types/index.ts` | `Entity`, `Relation`, `GraphState`, `PanelState` type definitions |
| `server.ts` | Express app — `/api/analyze` and `/api/expand` (SSE) endpoints, Vite middleware in dev, static serving in production |

## Architecture

### Data Flow

```
TextInput → /api/analyze → entities + relations + summary
    ↓
D3 KnowledgeGraph ← nodes + edges (GraphState)
    ↓ click node
/api/expand (SSE stream) → chunk → streaming analysis
                         → done  → newEntities + newRelations → mergeGraphData
```

### Key State (all in App.tsx)

- **`graphDataState`** (`GraphState`) — nodes and edges, the source of truth for the graph. Mirrored via `graphDataRef` for synchronous access in callbacks.
- **`panelState`** (`PanelState`) — selected entity ID, analysis markdown, suggested explorations, loading flag.
- **`originalText`** — preserved across expansions, sent as context to `/api/expand`.

### Critical Patterns

**graphDataRef sync:** `setGraphData` wraps `setGraphDataState` and also updates `graphDataRef.current` synchronously. This prevents stale closures when rapid successive node clicks read the latest nodes for the existing-entities list.

**SSE streaming:** `/api/expand` returns an SSE stream. The client reads via `ReadableStream` reader, splits on `\n\n`, parses `data: {...}` lines. `extractPartialAnalysis` on the server extracts the partial `"analysis"` field from incomplete JSON, unescaping it for real-time display.

**D3 lifecycle:** All D3 rendering is in a single `useEffect` keyed on `[data, onNodeClick, selectedEntityId]`. Node positions are preserved across re-renders via `positionsRef`. The effect returns a cleanup that stops the simulation.

**Abort handling:** `abortControllerRef` is aborted before each new API call (analyze or expand), preventing stale requests from updating state.

## Programming Conventions

### Think Before Coding

- State your assumptions explicitly. If multiple interpretations exist, present them — don't pick silently.
- If something is unclear, stop and ask.

### Simplicity First

- No abstractions for single-use code. Three similar lines is better than a premature helper.
- No features beyond what was asked. No "flexibility" that wasn't requested.
- No error handling for scenarios that can't happen.

### Surgical Changes

- Touch only what you must. Don't refactor adjacent code or "improve" formatting.
- Match existing style, even if you'd do it differently.
- Remove imports/variables your changes made unused. Don't remove pre-existing dead code.

### Goal-Driven Execution

- Define verifiable success criteria. "Add validation" → "Write tests for invalid inputs, then make them pass."
- For multi-step tasks, state a brief plan with verification checkpoints.

### Project-Specific

- **D3 rendering belongs in useEffect**, not in event handlers. Return a cleanup that stops the simulation.
- **Preserve node positions** across re-renders using a ref (`positionsRef`), seeding new nodes near their parent.
- **Use `graphDataRef`** for synchronous access to the latest graph state in callbacks — `graphDataState` from useState is stale inside closures.
- **Abort before fetch**: Always abort the previous `AbortController` before starting a new API call, and check for `AbortError` in catch blocks.
- **SSE parsing**: Buffer incoming chunks, split on `\n\n`, handle partial events. The server sends `chunk` (streaming analysis text) and `done` (final result with entities/relations).
- **API responses use `response_format: { type: "json_object" }`** — the LLM prompt must include the exact JSON schema in the system message.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Compatible API endpoint |
| `OPENAI_MODEL` | No | `gpt-3.5-turbo` | Model for entity extraction |
| `APP_URL` | No | — | Deployment URL (injected by AI Studio at runtime) |
