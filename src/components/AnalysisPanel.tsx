import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { PanelState, EntityType } from '../types';
import { slugify } from '../lib/graphUtils';

interface AnalysisPanelProps {
  state: PanelState;
  entityName?: string;
  entityType?: EntityType;
  onTagClick: (tagName: string) => void;
  onTextSelect?: (text: string) => void;
}

const typeColors: Record<EntityType, string> = {
  person: 'bg-blue-50 text-blue-600 border-blue-200',
  location: 'bg-green-50 text-green-600 border-green-200',
  organization: 'bg-orange-50 text-orange-600 border-orange-200',
  event: 'bg-red-50 text-red-600 border-red-200',
  concept: 'bg-purple-50 text-purple-600 border-purple-200',
  time: 'bg-gray-100 text-gray-500 border-gray-200',
  other: 'bg-gray-50 text-gray-500 border-gray-200'
};

const chineseFont = { fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif" };

export default function AnalysisPanel({ state, entityName, entityType, onTagClick, onTextSelect }: AnalysisPanelProps) {
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-selection-menu]')) return;

      const selection = window.getSelection();
      const text = selection?.toString().trim();
      const rangeCount = selection?.rangeCount ?? 0;

      if (!text || text.length <= 1 || rangeCount === 0) {
        setTimeout(() => setSelectionMenu(null), 0);
        return;
      }

      const range = selection!.getRangeAt(0);
      if (!panelRef.current?.contains(range.commonAncestorContainer)) {
        setTimeout(() => setSelectionMenu(null), 0);
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelectionMenu({ x: rect.left + rect.width / 2, y: rect.top - 8, text });
    };

    document.addEventListener('mouseup', handleMouseUp, true);
    return () => document.removeEventListener('mouseup', handleMouseUp, true);
  }, []);

  // Dismiss selection menu on scroll
  const handleContentScroll = useCallback(() => {
    if (selectionMenu) setSelectionMenu(null);
  }, [selectionMenu]);

  // Only show skeleton when loading AND no content has arrived yet
  if (state.isLoading && !state.analysisContent) {
    return (
      <div className="flex flex-col h-full bg-white p-6 animate-pulse" style={chineseFont}>
        <div className="h-8 w-1/3 bg-gray-200 rounded mb-4"></div>
        <div className="h-4 w-1/4 bg-gray-200 rounded mb-8"></div>

        <div className="space-y-4">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          <div className="h-4 bg-gray-200 rounded w-4/6"></div>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="flex flex-col h-full bg-white relative select-auto" style={chineseFont}>
      {/* Floating "Add to Graph" button — portal to body to escape backdrop-blur containing block */}
      {selectionMenu && createPortal(
        <div
          data-selection-menu
          className="fixed z-[9999] transform -translate-x-1/2 -translate-y-full pointer-events-auto"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onTextSelect?.(selectionMenu.text);
              setSelectionMenu(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg shadow-lg transition-colors whitespace-nowrap flex items-center gap-1"
          >
            + 添加到图谱
          </button>
        </div>,
        document.body
      )}
      <div className="p-6 border-b border-gray-200 bg-gray-50/50 shrink-0">
        <div className="flex items-center justify-between mb-2">
          {entityType ? (
            <span className={`px-2 py-0.5 text-[10px] font-bold border rounded uppercase tracking-wider ${typeColors[entityType] || typeColors.other}`}>
              Entity: {entityType.toUpperCase()}
            </span>
          ) : (
            <span className="px-2 py-0.5 text-[10px] font-bold border rounded uppercase tracking-wider bg-gray-100 text-gray-500 border-gray-200">
              Overview
            </span>
          )}
          <span className="text-[10px] text-gray-400 font-mono">ID: {entityName ? slugify(entityName) : 'summary'}</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          {entityName || "图谱摘要"}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 select-auto" onScroll={handleContentScroll}>
        {state.analysisContent ? (
          <div>
            <div className="text-[15px] text-gray-700 leading-relaxed select-auto prose max-w-none
                            prose-headings:font-bold prose-headings:text-gray-900 prose-headings:tracking-tight
                            prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-sm
                            prose-h2:border-l-2 prose-h2:border-gray-300 prose-h2:pl-3 prose-h2:mt-6 prose-h2:mb-3
                            prose-h3:border-l-2 prose-h3:border-gray-200 prose-h3:pl-3 prose-h3:mt-5 prose-h3:mb-2
                            prose-p:my-2 prose-p:leading-relaxed
                            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                            prose-strong:text-gray-900 prose-strong:font-semibold
                            prose-code:text-[13px] prose-code:bg-gray-100 prose-code:text-pink-600 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                            prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:rounded-lg
                            prose-blockquote:border-l-2 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:text-gray-500 prose-blockquote:italic
                            prose-ul:my-2 prose-ol:my-2
                            prose-li:my-0.5 prose-li:text-gray-700
                            prose-table:border-collapse prose-table:w-full
                            prose-th:border prose-th:border-gray-300 prose-th:bg-gray-100 prose-th:px-3 prose-th:py-2 prose-th:text-xs prose-th:font-bold prose-th:text-gray-700
                            prose-td:border prose-td:border-gray-200 prose-td:px-3 prose-td:py-2 prose-td:text-sm
                            prose-hr:border-gray-200
                            prose-img:rounded-lg">
              <ReactMarkdown>{state.analysisContent}</ReactMarkdown>
            </div>
            {state.isLoading && (
              <span className="inline-block w-2.5 h-5 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            点击左侧图谱中的节点，即可查看深度解析。
          </div>
        )}
      </div>

      {state.suggestedExplorations && state.suggestedExplorations.length > 0 && (
        <div className="p-6 border-t border-gray-200 bg-gray-50 shrink-0">
          <h4 className="text-xs font-bold text-gray-500 mb-3">建议探索</h4>
          <div className="flex flex-wrap gap-2">
            {state.suggestedExplorations.map((tag, idx) => (
              <button
                key={idx}
                onClick={() => onTagClick(tag)}
                className="px-3 py-1 bg-white hover:bg-gray-100 border border-gray-200 rounded-full text-xs text-gray-600 cursor-pointer transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
