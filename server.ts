import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";

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

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        {
          role: "system",
          content: `你是一个知识图谱构建专家。请分析文本，抽取所有实体和它们之间的关系。
抽取至少 5 个有意义的实体（包括隐含的，太少会导致知识图谱空洞），关系要具体（不要泛泛的”相关”），每个实体至少参与一条关系。

严格按照以下 JSON 格式返回：
{
  "entities": [
    {
      "id": "唯一标识符(英文snake_case)",
      "name": "实体名称(原文中的称呼)",
      "type": "person|location|organization|event|concept|time|other",
      "description": "一句话描述"
    }
  ],
  "relations": [
    {
      "source": "实体id",
      "target": "实体id",
      "relation": "关系描述(简短动词短语)"
    }
  ],
  "summary": "对这段文本的整体解析(2-3段，涵盖背景、核心含义、延伸思考)"
}`
        },
        {
          role: "user",
          content: `分析以下文本：\n\n文本：${text}`
        }
      ],
      response_format: { type: "json_object" },
    }, { timeout: 30000 });

    const content = response.choices[0]?.message?.content || "{}";
    const data = JSON.parse(content);
    
    // Validate output structure
    if (!Array.isArray(data.entities) || !Array.isArray(data.relations)) {
      return res.status(500).json({ error: "Invalid LLM response format" });
    }
    
    // Further filter to valid ones
    data.entities = data.entities.filter((e: any) => e && e.id && e.name);
    data.relations = data.relations.filter((r: any) => r && r.source && r.target && r.relation);

    res.json(data);
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: "Failed to analyze text" });
  }
});

// Extract partial "analysis" text from streaming JSON buffer
function extractPartialAnalysis(buffer: string): string {
  const startMatch = buffer.match(/"analysis"\s*:\s*"/);
  if (!startMatch) return '';

  let text = buffer.slice(startMatch.index! + startMatch[0].length);

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

    const stream = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        {
          role: "system",
          content: `你是一个知识图谱构建专家。你的核心原则是**向上抽象、向源收敛**：新实体应优先追溯到原始文本的核心主题和上层概念，而非发散到无关的细节方向。

要求：
1. 对实体进行详细解析（以 Markdown 格式，3-5段），解析中要体现该实体与原始文本主题的关联。
2. 新实体数量 3~6 个，遵循 80/20 原则：约80%应为向源端收敛的上层抽象概念（如原始文本的核心议题、背景脉络、底层原理），约20%可为有意义的横向关联实体。
3. 与已有实体建立关系时，必须使用提供的已有实体 id（不要自己编造），已有实体以 {id, name} 格式提供。
4. 新实体的 id 使用英文 snake_case，不要与已有实体 id 重复。
5. 新实体不要与已有实体重复（注意同义词判断），避免引入与原始文本主题无关的实体。
5. suggestedExplorations 是用户可能感兴趣的下一步探索方向关键词，优先围绕原始文本的核心主题。

严格按照以下 JSON 格式返回：
{
  "analysis": "对该实体的详细 Markdown 解析文本",
  "newEntities": [
    {
      "id": "唯一标识符",
      "name": "实体名称",
      "type": "person|location|organization|event|concept|time|other",
      "description": "一句话描述"
    }
  ],
  "newRelations": [
    {
      "source": "实体id",
      "target": "实体id",
      "relation": "关系描述"
    }
  ],
  "suggestedExplorations": ["建议进一步探索的实体关键词数组(3-5个)"]
}`
        },
        {
          role: "user",
          content: `用户正在探索实体「${entity.name}」(id: ${entity.id})。\n\n原始上下文：${originalText}\n\n当前图谱中已有的实体（格式为 {id, name}）：${JSON.stringify(existingEntities)}\n\n请对该实体进行详细解析，并在必要时扩展该实体的知识图谱发现新的关联实体和关系。建立关系时，务必使用上面提供的已有实体 id。`
        }
      ],
      response_format: { type: "json_object" },
      stream: true,
    }, { timeout: 30000 });

    let buffer = '';
    let lastSentLength = 0;

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

    data.newEntities = data.newEntities.filter((e: any) => e && e.id && e.name);
    data.newRelations = data.newRelations.filter((r: any) => r && r.source && r.target && r.relation);

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
