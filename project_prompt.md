# Knowledge Graph Explorer — 项目概述

## 这是什么？

一个 AI 驱动的知识图谱可视化工具。用户输入一段文本，系统自动提取实体（人物、地点、组织、事件、概念等）及它们之间的关系，渲染成可交互的 D3 力导向图。点击任意节点可触发流式 AI 深度解析，并发现新的关联实体。

## 核心功能

1. **实体抽取** — 提交文本 → LLM 分析 → 输出实体 + 关系 + 摘要
2. **图谱可视化** — D3 力导向图，支持拖拽、缩放、悬停高亮、语义缩放标签
3. **节点展开** — 点击节点 → SSE 流式返回分析 + 新实体 + 建议探索方向
4. **划词添加** — 在分析面板选中文字 → 一键添加到图谱
5. **标签探索** — 点击建议探索标签 → 创建临时节点 → 自动展开

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + TypeScript + D3.js 7 + Tailwind CSS 4 |
| 后端 | Express 4（单文件 `server.ts`，同时提供 API 和 Vite 开发中间件） |
| AI | OpenAI API 兼容接口（`response_format: json_object`，expand 使用 SSE streaming） |
| 构建 | Vite 6 + tsx（直接运行 TypeScript） |

## 项目结构

```
knowledge-graph-explorer/
├── server.ts                  # Express 后端（唯一后端文件）
│                              #   POST /api/analyze  — 文本 → 图谱数据
│                              #   POST /api/expand   — SSE 流式节点展开
│                              #   开发时挂载 Vite HMR 中间件
│                              #   生产时托管 dist/ 静态文件
├── src/
│   ├── App.tsx                # 根组件：分栏布局、全局状态、API 调度、SSE 消费
│   ├── main.tsx               # React 入口
│   ├── index.css              # Tailwind v4 @import
│   ├── components/
│   │   ├── TextInput.tsx      # 文本提交表单（textarea + Analyze 按钮 + loading 态）
│   │   ├── KnowledgeGraph.tsx # D3 力导向图（全部渲染在一个 useEffect 中）
│   │   └── AnalysisPanel.tsx  # Markdown 分析展示 + 建议探索 + 划词浮动按钮
│   ├── lib/
│   │   └── graphUtils.ts      # mergeGraphData()、getEdgeEndpointId()、slugify()
│   └── types/
│       └── index.ts           # Entity、Relation、GraphState、PanelState 类型
├── prompts/                   # LLM 提示词（热加载，修改无需重启）
│   ├── loader.ts              # 基于 mtime 的缓存 + 自动重载 + {{变量}} 模板
│   ├── analyze/
│   │   ├── system.md          # 实体抽取系统提示词
│   │   └── user.md            # 用户消息模板（{{text}}）
│   └── expand/
│       ├── system.md          # 节点展开系统提示词
│       └── user.md            # 用户消息模板（{{entityName}} 等）
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 数据流

```
用户输入文本
    │
    ▼
POST /api/analyze ──── OpenAI chat.completions ──── { entities, relations, summary }
    │
    ▼
App.tsx: setGraphData() ──── 写入 graphDataState + graphDataRef（同步更新）
    │
    ▼
KnowledgeGraph.tsx: D3 forceSimulation ──── 渲染节点 + 连线
    │
    │  用户点击节点
    ▼
handleNodeClick(entity)
    ├── 创建 AbortController（取消前一个请求）
    ├── POST /api/expand ──── SSE stream
    │       ├── chunk → 流式更新 panelState.analysisContent（逐字显示）
    │       └── done  → mergeGraphData() + 更新 suggestedExplorations
    │
    ▼
图谱增量更新（新节点、新连线合并到现有图谱）
```

## 关键设计决策

### 1. D3 与 React 的边界

D3 力模拟的全部生命周期在 `KnowledgeGraph.tsx` 的单个 `useEffect` 中管理，依赖 `[data, onNodeClick, selectedEntityId]`。每次 data 变化时重建整个 SVG（`svg.selectAll('*').remove()`），但通过 `positionsRef` 保留节点位置，避免视觉跳变。useEffect 返回 cleanup 函数停止模拟。

### 2. 同步 Ref 模式

`graphDataRef` 与 `graphDataState` 通过 `setGraphData()` wrapper 保持同步。回调函数（如 `handleNodeClick`、`handleTextSelect`）通过 ref 读取最新图谱数据，避免闭包过期问题。`selectedEntityIdRef` 同理——避免 `handleTextSelect` 因依赖 `panelState.selectedEntityId` 而被频繁重建。

### 3. SSE 流式解析

`/api/expand` 使用 SSE 协议。客户端通过 `ReadableStream` reader 读取，按 `\n\n` 分割事件，解析 `data: {...}` JSON。服务端 `extractPartialAnalysis()` 从流式 JSON 缓冲区中截取 `"analysis"` 字段的已就绪部分，实时发送给客户端——即使是未闭合的 JSON 字符串也能正确处理转义。

### 4. 请求取消

所有 API 调用共享一个 `abortControllerRef`。新请求发起前，先 abort 前一个 controller。catch 块中检查 `AbortError` 并静默忽略，避免过期请求的状态更新污染 UI。

### 5. 提示词热加载

所有 LLM 提示词存放在 `prompts/` 目录的 `.md` 文件中。`loader.ts` 基于文件 mtime 进行缓存，每次请求时自动检测文件变化并重新加载，无需重启服务器。模板引擎使用 `{{变量名}}` 语法，简单替换，无额外依赖。

### 6. 图谱数据合并

`mergeGraphData()` 以 id 去重节点，以 `source-target-relation` 组合键去重连线。D3 模拟会将 edge 的 source/target 从字符串变成节点对象引用——`getEdgeEndpointId()` 统一处理两种情况。

## 状态模型

```typescript
// 图谱数据（唯一的真相源）
GraphState {
  nodes: Entity[]   // id, name, type, description, depth, expanded
  edges: Relation[] // source, target, relation
}

// 右侧面板状态
PanelState {
  selectedEntityId: string | null
  analysisContent: string       // Markdown，流式更新
  suggestedExplorations: string[]
  isLoading: boolean
}

// 额外状态
originalText: string            // 初始文本，展开节点时作为上下文发送
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `OPENAI_API_KEY` | 是 | - | OpenAI API 密钥 |
| `OPENAI_BASE_URL` | 否 | `https://api.openai.com/v1` | 兼容的 API 端点 |
| `OPENAI_MODEL` | 否 | `gpt-3.5-turbo` | 模型名称 |

## 常用命令

```bash
npm run dev       # 启动开发服务器 (localhost:3000)
npm run build     # 生产构建到 dist/
npm run lint      # TypeScript 类型检查
npm run clean     # 清理 dist/
```

## 提示词调试

编辑 `prompts/` 下的 `.md` 文件即可实时生效。每次 API 请求会自动检测文件修改时间并重载。日志会输出 `[prompts] Loaded "analyze"` 等信息确认加载状态。
