import React, { useState, useRef, useCallback } from 'react';
import { Settings } from 'lucide-react';
import TextInput from './components/TextInput';
import KnowledgeGraph from './components/KnowledgeGraph';
import AnalysisPanel from './components/AnalysisPanel';
import SettingsPanel from './components/SettingsPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { GraphState, PanelState, Entity } from './types';
import { mergeGraphData, slugify } from './lib/graphUtils';
import { consumeSSEStream } from './lib/sseUtils';

export default function App() {
  const [leftWidth, setLeftWidth] = useState(55); // percentage
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isDraggingRef = useRef(false);

  const [originalText, setOriginalText] = useState('');
  const [graphDataState, setGraphDataState] = useState<GraphState>({ nodes: [], edges: [] });
  const graphDataRef = useRef<GraphState>(graphDataState);

  // Wrapper to keep ref in sync synchronously
  const setGraphData = useCallback((action: React.SetStateAction<GraphState>) => {
    const next = typeof action === 'function' ? action(graphDataRef.current) : action;
    graphDataRef.current = next;
    setGraphDataState(next);
  }, []);

  const graphData = graphDataState;

  const [panelState, setPanelState] = useState<PanelState>({
    selectedEntityId: null,
    analysisContent: '',
    thinkingContent: '',
    suggestedExplorations: [],
    isLoading: false,
  });

  const selectedEntityIdRef = useRef<string | null>(null);
  selectedEntityIdRef.current = panelState.selectedEntityId;

  // Cache expanded node analysis results — re-click restores from cache, no API call
  const analysisCacheRef = useRef<Map<string, { analysisContent: string; suggestedExplorations: string[] }>>(new Map());

  const selectedEntity = panelState.selectedEntityId
    ? graphData.nodes.find(n => n.id === panelState.selectedEntityId)
    : null;

  // Split Pane dragging — uses native events on divider only, avoids
  // triggering React re-renders on every mouseup (which would destroy text selection)
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;

    const onMove = (ev: MouseEvent) => {
      const newWidth = (ev.clientX / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) setLeftWidth(newWidth);
    };

    const onUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const abortControllerRef = useRef<AbortController | null>(null);

  function createAbortController(): AbortController {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;
    return ac;
  }

  const handleAnalyze = async (text: string) => {
    const abortController = createAbortController();

    setOriginalText(text);
    analysisCacheRef.current.clear();
    setPanelState(prev => ({ ...prev, isLoading: true, selectedEntityId: null, thinkingContent: '' }));

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: abortController.signal
      });
      if (!res.ok) {
        throw new Error(`Analyze API failed with status ${res.status}`);
      }

      await consumeSSEStream(res, {
        onChunk: (text) => setPanelState(prev => ({ ...prev, analysisContent: text })),
        onThinking: (text) => setPanelState(prev => ({ ...prev, thinkingContent: prev.thinkingContent + text })),
        onDone: (payload) => {
          setGraphData({
            nodes: (payload.entities || []).map((e: any) => ({ ...e, depth: 0, expanded: false })),
            edges: payload.relations || []
          });
          setPanelState({
            selectedEntityId: null,
            analysisContent: payload.summary || '生成图谱完成。',
            thinkingContent: '',
            suggestedExplorations: [],
            isLoading: false
          });
        },
        onError: (message) => { throw new Error(message); },
      });
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error(error);
      setPanelState(prev => ({ ...prev, isLoading: false, thinkingContent: '', analysisContent: '分析出错，请重试。' }));
    }
  };

  // useCallback prevents new function reference on every render,
  // which would trigger KnowledgeGraph useEffect to rebuild D3 simulation
  const handleNodeClick = useCallback(async (entity: Entity) => {
    // Already selected and expanded — no-op
    if (entity.id === selectedEntityIdRef.current && entity.expanded) return;

    // Previously expanded — restore cached result, no API call
    const cached = analysisCacheRef.current.get(entity.id);
    if (cached) {
      setPanelState({
        selectedEntityId: entity.id,
        analysisContent: cached.analysisContent,
        thinkingContent: '',
        suggestedExplorations: cached.suggestedExplorations,
        isLoading: false,
      });
      return;
    }

    const abortController = createAbortController();

    setPanelState(prev => ({ ...prev, selectedEntityId: entity.id, isLoading: true, thinkingContent: '' }));

    // Update node to expanded locally just for UI immediate feedback
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === entity.id ? { ...n, expanded: true } : n)
    }));

    try {
      // Use the latest nodes from the ref to avoid stale closures during rapid successive clicks
      const existingEntities = graphDataRef.current.nodes.map(n => ({ id: n.id, name: n.name }));

      const res = await fetch('/api/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity,
          existingEntities,
          originalText
        }),
        signal: abortController.signal
      });
      if (!res.ok) {
        throw new Error(`Expand API failed with status ${res.status}`);
      }

      await consumeSSEStream(res, {
        onChunk: (text) => setPanelState(prev => ({ ...prev, analysisContent: text })),
        onThinking: (text) => setPanelState(prev => ({ ...prev, thinkingContent: prev.thinkingContent + text })),
        onDone: (payload) => {
          setGraphData(prev => mergeGraphData(prev, payload.newEntities || [], payload.newRelations || [], entity.depth + 1));

          const finalAnalysis = payload.analysis || '';
          const finalSuggestions = payload.suggestedExplorations || [];
          analysisCacheRef.current.set(entity.id, {
            analysisContent: finalAnalysis,
            suggestedExplorations: finalSuggestions,
          });

          setPanelState(prev => ({
            ...prev,
            analysisContent: finalAnalysis,
            thinkingContent: '',
            suggestedExplorations: finalSuggestions,
            isLoading: false
          }));
        },
        onError: (message) => { throw new Error(message); },
      });
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error(error);
      setPanelState(prev => ({ ...prev, isLoading: false, thinkingContent: '', analysisContent: '扩展节点出错，请重试。' }));
      // Rollback expanded state on failure
      setGraphData(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => n.id === entity.id ? { ...n, expanded: false } : n)
      }));
    }
  }, [originalText]);

  const handleTagClick = async (tagName: string) => {
    // Check if exists
    const existingNode = graphData.nodes.find(n => n.name.toLowerCase() === tagName.toLowerCase());
    if (existingNode) {
      handleNodeClick(existingNode);
    } else {
      // Create temporary node
      const tempId = slugify(tagName);
      const newEntity: Entity = {
        id: tempId,
        name: tagName,
        type: 'concept',
        description: 'Auto-generated exploration node',
        depth: (selectedEntity?.depth || 0) + 1,
        expanded: false
      };
      
      // We can also add a relation from the currently selected entity to this new one
      const tempRelations = selectedEntity ? [{
        source: selectedEntity.id,
        target: tempId,
        relation: 'related_to'
      }] : [];

      setGraphData(prev => mergeGraphData(prev, [newEntity], tempRelations, newEntity.depth));
      
      // We can now call handleNodeClick immediately because setGraphData updates the ref synchronously
      handleNodeClick(newEntity);
    }
  };

  const handleTextSelect = useCallback((selectedText: string) => {
    const tempId = ('user_' + slugify(selectedText)).slice(0, 44);
    const currentSelectedId = selectedEntityIdRef.current;
    const parentNode = currentSelectedId
      ? graphDataRef.current.nodes.find(n => n.id === currentSelectedId)
      : null;

    const newEntity: Entity = {
      id: tempId,
      name: selectedText.length > 60 ? selectedText.slice(0, 60) + '...' : selectedText,
      type: 'concept',
      description: 'User-selected from analysis',
      depth: (parentNode?.depth || 0) + 1,
      expanded: false
    };

    const tempRelations = currentSelectedId ? [{
      source: currentSelectedId,
      target: tempId,
      relation: 'related_to'
    }] : [];

    setGraphData(prev => mergeGraphData(prev, [newEntity], tempRelations, newEntity.depth));
    handleNodeClick(newEntity);
  }, [handleNodeClick, setGraphData]);

  return (
    <div
      className="flex flex-col h-screen w-full bg-white text-gray-800 overflow-hidden font-sans">
      {/* Header */}
      <header className="shrink-0 h-12 border-b border-gray-200 flex items-center justify-between px-6 bg-white z-50 select-none">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-400"></div>
          <h1 className="text-sm font-semibold tracking-widest uppercase text-gray-500">Knowledge Graph Explorer <span className="text-xs font-mono ml-2 opacity-40">v1.1</span></h1>
        </div>
        <div className="flex gap-4 text-[10px] uppercase tracking-tighter text-gray-400 font-mono">
          <span>Nodes: {graphData.nodes.length}</span>
          <span>Edges: {graphData.edges.length}</span>
          <span>API: Healthy</span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="ml-1 p-0.5 rounded hover:bg-gray-200 transition-colors"
            title="模型设置"
          >
            <Settings className="w-3 h-3 text-gray-400 hover:text-gray-600" />
          </button>
        </div>
      </header>

      <ErrorBoundary>
        <main className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div
          className="flex flex-col h-full border-r border-gray-200 select-none"
          style={{ width: `${leftWidth}%` }}
        >
          <div className="h-[22%] min-h-[120px] p-4 bg-gray-50 border-b border-gray-200 shrink-0">
            <TextInput 
              onAnalyze={handleAnalyze} 
              isLoading={panelState.isLoading && !panelState.selectedEntityId} 
            />
          </div>
          <div className="flex-1 relative min-h-[300px]">
            {graphData.nodes.length > 0 ? (
              <KnowledgeGraph 
                data={graphData} 
                selectedEntityId={panelState.selectedEntityId}
                onNodeClick={handleNodeClick}
              />
            ) : (
              <div className="w-full h-full bg-[#f8f9fa] relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(#999999 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }}></div>
                <div className="text-gray-400 text-sm flex flex-col items-center gap-2 z-10">
                  <div className="w-16 h-16 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center mb-2">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                    </svg>
                  </div>
                  <span>Waiting for text analysis...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drag Divider */}
        <div
          className="w-1.5 bg-gray-200 hover:bg-gray-400 cursor-col-resize transition-colors z-10"
          onMouseDown={handleDividerMouseDown}
        />

        {/* Right Panel */}
        <div className="h-full flex-1 min-w-[300px] select-auto">
          <AnalysisPanel
            state={panelState}
            entityName={selectedEntity?.name}
            entityType={selectedEntity?.type}
            onTagClick={handleTagClick}
            onTextSelect={handleTextSelect}
          />
        </div>
      </main>
      </ErrorBoundary>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Footer Status Bar */}
      <footer className="shrink-0 h-6 bg-gray-100 border-t border-gray-200 px-4 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[9px] font-medium text-gray-500 uppercase tracking-tighter">
          <span>Session: {graphData.nodes.length > 0 ? "Active" : "Idle"}</span>
        </div>
        <div className="flex items-center gap-2">
          {panelState.isLoading ? (
            <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></span>
          ) : (
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
          )}
          <span className="text-[9px] font-medium text-gray-500 uppercase tracking-tighter">
            {panelState.isLoading ? "Loading" : "System Ready"}
          </span>
        </div>
      </footer>
    </div>
  );
}
