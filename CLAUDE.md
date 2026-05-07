# Knowledge Graph Explorer — AI 助手规范

AI-powered knowledge graph extraction and exploration tool. Submit text, get an interactive D3 force-directed graph of entities and their relationships, with streaming AI analysis on each node.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, D3.js 7, Tailwind CSS 4 |
| Backend | Express 4, OpenAI SDK, Vite dev middleware |
| AI | OpenAI API (SSE streaming for both analyze and expand) |
| Markdown | react-markdown + remark-math + rehype-katex (LaTeX math) |
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
| `src/components/KnowledgeGraph.tsx` | D3 force simulation — renders nodes/links, zoom/drag/hover, semantic label scaling, Morandi colors |
| `src/components/AnalysisPanel.tsx` | Markdown analysis display with LaTeX math, suggested explorations, text selection floating button, thinking content display |
| `src/components/SettingsPanel.tsx` | Slide-over settings panel — API key, base URL, model, all generation params, provider badge, model list dropdown, test connection |
| `src/lib/graphUtils.ts` | `mergeGraphData()` — de-duplicates nodes by id and edges by source-target-relation key; `slugify()`, `getEdgeEndpointId()` |
| `src/types/index.ts` | `Entity`, `Relation`, `GraphState`, `PanelState` type definitions |
| `server.ts` | Express app — all API routes, mutable model config, `buildRequestOptions()` with provider-specific parameter formatting |
| `presets.ts` | Provider presets — per-provider defaults (max_tokens, temperature, thinking, etc.), `matchProvider()`, `hiddenParams` |
| `prompts/loader.ts` | Hot-reloading prompt loader — mtime-based cache, `{{variable}}` template rendering |
| `prompts/analyze/` | Entity extraction prompt (system + user template) |
| `prompts/expand/` | Entity expansion prompt (system + user template) |

## Architecture

### Data Flow

```
TextInput → /api/analyze (SSE) → stream: summary → done: entities + relations
    ↓
D3 KnowledgeGraph ← nodes + edges (GraphState)
    ↓ click node
/api/expand (SSE stream) → chunk → streaming analysis
                         → thinking → reasoning tokens
                         → done  → newEntities + newRelations → mergeGraphData
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | POST | SSE streaming entity extraction from text |
| `/api/expand` | POST | SSE streaming entity expansion |
| `/api/settings` | GET/POST | Read/update mutable model config |
| `/api/settings/test` | POST | Test API connectivity |
| `/api/models` | GET | List available models from API |

### Key State (all in App.tsx)

- **`graphDataState`** (`GraphState`) — nodes and edges, the source of truth for the graph. Mirrored via `graphDataRef` for synchronous access in callbacks.
- **`panelState`** (`PanelState`) — selected entity ID, analysis markdown, thinking content, suggested explorations, loading flag.
- **`originalText`** — preserved across expansions, sent as context to `/api/expand`.
- **`analysisCacheRef`** — caches expanded node results (analysis + suggestions) to avoid redundant API calls on re-click.

### Provider Presets

`presets.ts` defines per-provider defaults and visibility rules. When the user changes the model name, `POST /api/settings` auto-matches against provider `match` arrays and applies the corresponding defaults. `hiddenParams` controls which controls are hidden in the Settings panel.

**DeepSeek thinking mode:** `thinking` must be passed as a top-level parameter (not inside `extra_body`) for the API to respect it:

```ts
opts.thinking = { type: modelConfig.enable_thinking ? "enabled" : "disabled" };
```

When thinking is enabled, `reasoning_effort` is set and `temperature`/`top_p`/`presence_penalty` are omitted. When disabled, those params are included normally.

**Qwen thinking mode:** Use `extra_body.chat_template_kwargs = { enable_thinking: false }` to disable.

### Critical Patterns

**graphDataRef sync:** `setGraphData` wraps `setGraphDataState` and also updates `graphDataRef.current` synchronously. This prevents stale closures when rapid successive node clicks read the latest nodes for the existing-entities list.

**SSE streaming:** Both `/api/analyze` and `/api/expand` use SSE streaming. The client reads via `ReadableStream` reader, splits on `\n\n`, parses `data: {...}` lines. Server-side `extractPartialSummary` and `extractPartialAnalysis` extract the partial JSON field from incomplete buffer for real-time display.

**D3 lifecycle:** All D3 rendering is in a single `useEffect` keyed on `[data, onNodeClick, selectedEntityId]`. Node positions are preserved across re-renders via `positionsRef`. The effect returns a cleanup that stops the simulation.

**Abort handling:** `abortControllerRef` is aborted before each new API call (analyze or expand), preventing stale requests from updating state.

**Prompt hot-reload:** `prompts/loader.ts` caches prompts by mtime. Editing `.md` files takes effect on the next request without server restart.

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
- **SSE parsing**: Buffer incoming chunks, split on `\n\n`, handle partial events. The server sends `chunk` (streaming text), `thinking` (reasoning tokens), and `done` (final result).
- **DeepSeek `thinking` at top level**: Must be on the opts object directly, not inside `extra_body`. Tested and confirmed.
- **Provider-specific params**: `buildRequestOptions()` auto-detects provider via `matchProvider()` and formats thinking/temperature/presence_penalty accordingly.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | No | — | OpenAI API key (can be set via Settings panel at runtime) |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Compatible API endpoint |
| `OPENAI_MODEL` | No | `gpt-3.5-turbo` | Model for entity extraction |
| `APP_URL` | No | — | Deployment URL (injected by AI Studio at runtime) |
