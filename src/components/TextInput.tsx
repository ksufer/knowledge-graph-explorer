import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface TextInputProps {
  onAnalyze: (text: string) => void;
  isLoading: boolean;
}

export default function TextInput({ onAnalyze, isLoading }: TextInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !isLoading) {
      onAnalyze(text.trim());
    }
  };

  return (
    <div className="relative h-full flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入一段文本（支持中文），例如一本科幻小说的片段、一段历史典故、或者一篇科技新闻..."
        className="flex-1 w-full bg-white border border-gray-200 rounded-md p-3 text-sm text-gray-800 focus:outline-none focus:border-gray-400 resize-none placeholder:text-gray-400"
      />
      <div className="flex justify-between items-center shrink-0">
        <div className="flex gap-2 overflow-hidden">
          <span className="text-xs text-gray-400 whitespace-nowrap">通过 LLM 自动抽取实体和关系</span>
        </div>
        <button
          type="submit"
          disabled={!text.trim() || isLoading}
          onClick={handleSubmit}
          className="px-6 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold rounded transition-colors uppercase tracking-widest disabled:bg-gray-200 disabled:text-gray-400 flex items-center gap-2"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Analyze
        </button>
      </div>
    </div>
  );
}
