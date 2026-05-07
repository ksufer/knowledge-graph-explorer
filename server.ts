import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";
import { loadPrompt, render } from "./prompts/loader";

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set. Exiting.");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});
const MODEL_NAME = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

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

    const stream = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: analyzePrompt.system },
        { role: "user", content: render(analyzePrompt.user, { text }) }
      ],
      stream: true,
    }, { timeout: 30000 });

    let buffer = '';
    let lastSentLength = 0;
    summaryStartOffset = -1;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      const content = delta?.content;
      if (content) {
        buffer += content;
        const summary = extractPartialSummary(buffer);
        if (summary.length > lastSentLength) {
          lastSentLength = summary.length;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: summary })}\n\n`);
        }
      }
    }

    // Parse complete response
    const data = JSON.parse(buffer);

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

// Extract partial "analysis" text from streaming JSON buffer.
// Caches the start offset so we don't re-scan on every chunk.
let analysisStartOffset = -1;

function extractPartialAnalysis(buffer: string): string {
  if (analysisStartOffset === -1) {
    const startMatch = buffer.match(/"analysis"\s*:\s*"/);
    if (!startMatch) return '';
    analysisStartOffset = startMatch.index! + startMatch[0].length;
  }

  let text = buffer.slice(analysisStartOffset);

  // Stop at the next JSON key boundary
  const endIdx = text.indexOf('","newEntities"');
  if (endIdx !== -1) {
    text = text.slice(0, endIdx);
  }

  // Unescape JSON string (order matters: quotes first, backslashes last)
  return text
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}

// Extract partial "summary" text from streaming JSON buffer.
// Summary is the first field in the analyze response, so content arrives early.
let summaryStartOffset = -1;

function extractPartialSummary(buffer: string): string {
  if (summaryStartOffset === -1) {
    const startMatch = buffer.match(/"summary"\s*:\s*"/);
    if (!startMatch) return '';
    summaryStartOffset = startMatch.index! + startMatch[0].length;
  }

  let text = buffer.slice(summaryStartOffset);

  // Stop at the next JSON key boundary
  const endIdx = text.indexOf('","entities"');
  if (endIdx !== -1) {
    text = text.slice(0, endIdx);
  }

  return text
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
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

    const stream = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: expandPrompt.system },
        { role: "user", content: render(expandPrompt.user, {
          entityName: entity.name,
          entityId: entity.id,
          originalText: originalText || "",
          existingEntities: JSON.stringify(existingEntities),
        }) }
      ],
      response_format: { type: "json_object" },
      stream: true,
    }, { timeout: 30000 });

    let buffer = '';
    let lastSentLength = 0;
    analysisStartOffset = -1;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      // Skip reasoning-only chunks (DeepSeek sends reasoning_content before content)
      const content = delta?.content;
      if (content) {
        buffer += content;
        const analysis = extractPartialAnalysis(buffer);
        if (analysis.length > lastSentLength) {
          lastSentLength = analysis.length;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: analysis })}\n\n`);
        }
      }
    }

    // Parse complete response
    const data = JSON.parse(buffer);

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
