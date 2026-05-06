# Knowledge Graph Explorer

Visualize and explore relationships between entities hidden in text using AI-powered graph extraction.

![image-20260507001621271](./README.assets/image-20260507001621271.png)

## Features

- **AI Entity Extraction** — Submit any text and let the LLM identify entities (people, locations, organizations, events, concepts) and their relationships
- **Interactive D3 Graph** — Drag, zoom, and hover to explore the knowledge graph; labels scale semantically with zoom level
- **Deep Dive Expansion** — Click any node to expand it, receiving streaming analysis and discovering new related entities
- **SSE Streaming** — Real-time streamed responses for entity analysis via Server-Sent Events
- **Split-Pane Layout** — Resizable left (input + graph) and right (analysis) panels
- **Text-to-Entity** — Select any text in the analysis panel and add it directly to the graph

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, D3.js 7, Tailwind CSS 4 |
| Backend | Express 4, Vite (dev server + middleware) |
| AI | OpenAI API (or compatible endpoint), SSE streaming |
| Motion | Motion (formerly Framer Motion) for animations |
| Icons | Lucide React |

## Quick Start

**Prerequisites:** Node.js 18+

```bash
# 1. Clone the repository
git clone https://github.com/ksufer/knowledge-graph-explorer.git
cd knowledge-graph-explorer

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env and set your OPENAI_API_KEY (and optionally OPENAI_BASE_URL / OPENAI_MODEL)

# 4. Start the dev server
npm run dev
```

The app runs at `http://localhost:3000`.

## Project Structure

```
knowledge-graph-explorer/
├── src/
│   ├── App.tsx                      # Root component — layout, state, API orchestration
│   ├── main.tsx                     # React entry point
│   ├── index.css                    # Tailwind CSS import
│   ├── components/
│   │   ├── TextInput.tsx            # Text submission form
│   │   ├── KnowledgeGraph.tsx       # D3.js force-directed graph
│   │   └── AnalysisPanel.tsx        # Entity analysis + markdown rendering
│   ├── lib/
│   │   └── graphUtils.ts            # mergeGraphData — deduplication logic
│   └── types/
│       └── index.ts                 # TypeScript type definitions
├── server.ts                        # Express server + API routes + Vite middleware
├── vite.config.ts                   # Vite configuration
├── tsconfig.json                    # TypeScript configuration
└── package.json
```

## API Endpoints

### `POST /api/analyze`

Analyzes text and returns extracted entities, relations, and a summary.

**Request:** `{ "text": "..." }`
**Response:** `{ "entities": [...], "relations": [...], "summary": "..." }`

### `POST /api/expand`

Expands a single entity with streaming SSE response. Returns detailed analysis, new entities, new relations, and suggested explorations.

**Request:** `{ "entity": {...}, "existingEntities": [...], "originalText": "..." }`
**Response:** SSE stream with `chunk` (partial analysis) and `done` (final result) events.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | Your OpenAI API key |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Compatible API endpoint |
| `OPENAI_MODEL` | No | `gpt-3.5-turbo` | Model to use for extraction |
