import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";
import { loadPrompt, render, escapeText } from "./prompts/loader";
import { matchProvider, PROVIDER_PRESETS, type ProviderPreset } from "./presets";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

const defaultModel = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
const initialProvider = matchProvider(defaultModel);
const initialDefaults: Partial<ProviderPreset["defaults"]> = initialProvider ? PROVIDER_PRESETS[initialProvider].defaults : {};

const modelConfig = {
  api_key: process.env.OPENAI_API_KEY || "",
  base_url: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  model: defaultModel,
  max_tokens: initialDefaults.max_tokens || 32768,
  temperature: initialDefaults.temperature ?? 0.7,
  top_p: initialDefaults.top_p ?? 0.8,
  presence_penalty: initialDefaults.presence_penalty ?? 1.5,
  top_k: 20,
  enable_thinking: initialDefaults.enable_thinking ?? false,
  reasoning_effort: (initialDefaults.reasoning_effort || "high") as "high" | "max",
};

let cachedClient: OpenAI | null = null;
let clientConfigKey = "";

function getClient() {
  const key = `${modelConfig.api_key}|${modelConfig.base_url}`;
  if (!cachedClient || clientConfigKey !== key) {
    if (!modelConfig.api_key) throw new Error("API Key 未设置");
    cachedClient = new OpenAI({
      apiKey: modelConfig.api_key,
      baseURL: modelConfig.base_url || undefined,
    });
    clientConfigKey = key;
  }
  return cachedClient;
}

function buildRequestOptions() {
  const provider = matchProvider(modelConfig.model);
  const isDeepSeek = provider === "deepseek";
  const isQwen = provider === "qwen";

  const extra: Record<string, any> = { top_k: modelConfig.top_k };

  if (isQwen && !modelConfig.enable_thinking) {
    extra.chat_template_kwargs = { enable_thinking: false };
  }

  const opts: any = {
    model: modelConfig.model,
    max_tokens: modelConfig.max_tokens,
    extra_body: extra,
  };

  // DeepSeek thinking must be at top level, not in extra_body (tested 2026-05)
  if (isDeepSeek) {
    opts.thinking = { type: modelConfig.enable_thinking ? "enabled" : "disabled" };
  }

  if (!(isDeepSeek && modelConfig.enable_thinking)) {
    opts.temperature = modelConfig.temperature;
    opts.top_p = modelConfig.top_p;
    opts.presence_penalty = modelConfig.presence_penalty;
  }

  if (isDeepSeek && modelConfig.enable_thinking) {
    opts.reasoning_effort = modelConfig.reasoning_effort;
  }

  return opts;
}

function settingsResponse() {
  const provider = matchProvider(modelConfig.model);
  const hiddenParams = provider ? PROVIDER_PRESETS[provider].hiddenParams : [];
  return { ...modelConfig, api_key: modelConfig.api_key ? "***" : "", provider, hiddenParams };
}

app.get("/api/settings", (_req, res) => {
  res.json(settingsResponse());
});

app.post("/api/settings", (req, res) => {
  const updates = req.body;

  if (updates.model && updates.model !== modelConfig.model) {
    const newProvider = matchProvider(updates.model);
    if (newProvider) {
      const preset = PROVIDER_PRESETS[newProvider].defaults;
      Object.assign(modelConfig, preset, { model: updates.model, top_k: modelConfig.top_k });
    }
  }

  for (const key of Object.keys(modelConfig)) {
    if (key in updates) {
      const val = updates[key];
      if (key === "api_key" && (val === "***" || !val)) continue;
      if (key === "model" && updates.model) continue;
      (modelConfig as any)[key] = val;
    }
  }

  res.json(settingsResponse());
});

app.post("/api/settings/test", async (_req, res) => {
  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
    }, { timeout: 15000 });
    res.json({ ok: true, model: response.model });
  } catch (error: any) {
    res.json({ ok: false, error: error?.message || String(error) });
  }
});

app.get("/api/models", async (_req, res) => {
  try {
    const client = getClient();
    const response = await client.models.list();
    const models = response.data.map(m => m.id).sort();
    res.json({ ok: true, models });
  } catch (error: any) {
    res.json({ ok: false, error: error?.message || String(error) });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }
    if (text.length > 20000) {
      return res.status(400).json({ error: "Text exceeds maximum length of 20000 characters." });
    }

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const analyzePrompt = loadPrompt("analyze");

    const stream = await getClient().chat.completions.create({
      ...buildRequestOptions(),
      messages: [
        { role: "system", content: analyzePrompt.system },
        { role: "user", content: render(analyzePrompt.user, { text: escapeText(text) }) }
      ],
      stream: true,
    } as any, { timeout: 120000 }) as any;

    let buffer = '';
    let lastSentLength = 0;
    let summaryStartOffset = -1;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;

      // Capture reasoning/thinking tokens (DeepSeek R1, etc.)
      const reasoning = (delta as any)?.reasoning_content;
      if (reasoning) {
        res.write(`data: ${JSON.stringify({ type: 'thinking', text: reasoning })}\n\n`);
      }

      const content = delta?.content;
      if (content) {
        buffer += content;
        const { text: summary } = extractPartialField(buffer, summaryStartOffset, 'summary', '","entities"');
        if (summary.length > lastSentLength) {
          lastSentLength = summary.length;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: summary })}\n\n`);
        }
      }
    }

    // Parse complete response
    const data = parseJSON(buffer);

    if (!Array.isArray(data.entities) || !Array.isArray(data.relations)) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Invalid LLM response format' })}\n\n`);
      res.end();
      return;
    }

    data.entities = data.entities.filter(validEntity);
    data.relations = data.relations.filter(validRelation);

    res.write(`data: ${JSON.stringify({
      type: 'done',
      summary: data.summary || '',
      entities: data.entities,
      relations: data.relations
    })}\n\n`);
    res.end();

  } catch (error) {
    console.error("Analysis Error:", error);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to analyze text' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: "Failed to analyze text" });
    }
  }
});

// Extract partial JSON string field from streaming buffer.
// Offset is passed in/out to avoid module-level globals (race condition under concurrent requests).
function extractPartialField(buffer: string, offset: number, fieldName: string, endMarker: string): { text: string; offset: number } {
  if (offset === -1) {
    const startMatch = buffer.match(new RegExp(`"${fieldName}"\\s*:\\s*"`));
    if (!startMatch) return { text: '', offset: -1 };
    offset = startMatch.index! + startMatch[0].length;
  }

  let text = buffer.slice(offset);
  const endIdx = text.indexOf(endMarker);
  if (endIdx !== -1) {
    text = text.slice(0, endIdx);
  }

  // Unescape JSON string (order matters: quotes first, backslashes last)
  return {
    text: text
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\'),
    offset,
  };
}

function parseJSON(text: string): any {
  // Strip markdown code fences that some models wrap around JSON output
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

function validEntity(e: any): boolean {
  return e && e.id && e.name;
}

function validRelation(r: any): boolean {
  return r && r.source && r.target && r.relation;
}

app.post("/api/expand", async (req, res) => {
  try {
    const { entity, existingEntities, originalText } = req.body;
    if (!entity || !entity.name || !entity.id) {
      return res.status(400).json({ error: "No valid entity provided. Make sure entity.name and entity.id are defined." });
    }
    if (originalText && originalText.length > 20000) {
      return res.status(400).json({ error: "Original text exceeds maximum length." });
    }

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const expandPrompt = loadPrompt("expand");

    const stream = await getClient().chat.completions.create({
      ...buildRequestOptions(),
      messages: [
        { role: "system", content: expandPrompt.system },
        { role: "user", content: render(expandPrompt.user, {
          entityName: entity.name,
          entityId: entity.id,
          originalText: escapeText(originalText || ""),
          existingEntities: JSON.stringify(existingEntities),
        }) }
      ],
      stream: true,
    } as any, { timeout: 120000 }) as any;

    let buffer = '';
    let lastSentLength = 0;
    let analysisStartOffset = -1;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;

      const reasoning = (delta as any)?.reasoning_content;
      if (reasoning) {
        res.write(`data: ${JSON.stringify({ type: 'thinking', text: reasoning })}\n\n`);
      }

      const content = delta?.content;
      if (content) {
        buffer += content;
        const { text: analysis } = extractPartialField(buffer, analysisStartOffset, 'analysis', '","newEntities"');
        if (analysis.length > lastSentLength) {
          lastSentLength = analysis.length;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: analysis })}\n\n`);
        }
      }
    }

    // Parse complete response
    const data = parseJSON(buffer);

    if (!Array.isArray(data.newEntities) || !Array.isArray(data.newRelations)) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Invalid LLM response format' })}\n\n`);
      res.end();
      return;
    }

    data.newEntities = data.newEntities.filter(validEntity);
    data.newRelations = data.newRelations.filter(validRelation);

    res.write(`data: ${JSON.stringify({
      type: 'done',
      analysis: data.analysis || '',
      newEntities: data.newEntities,
      newRelations: data.newRelations,
      suggestedExplorations: data.suggestedExplorations || []
    })}\n\n`);
    res.end();

  } catch (error) {
    console.error("Expansion Error:", error);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to expand entity' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: "Failed to expand entity" });
    }
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
