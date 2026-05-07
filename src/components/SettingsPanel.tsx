import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

interface ModelConfig {
  model: string;
  max_tokens: number;
  temperature: number;
  top_p: number;
  presence_penalty: number;
  top_k: number;
  enable_thinking: boolean;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) {
      fetch('/api/settings')
        .then(r => r.json())
        .then(setConfig);
    }
  }, [open]);

  const save = useCallback((patch: Partial<ModelConfig>) => {
    setConfig(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
      }, 300);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40 transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col animate-[slideIn_0.2s_ease-out]"
        style={{
          '@keyframes slideIn': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        } as any}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">模型设置</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {config && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Model name */}
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Model</span>
              <input
                type="text"
                value={config.model}
                onChange={e => save({ model: e.target.value })}
                className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400 font-mono"
              />
            </label>

            {/* max_tokens */}
            <label className="block">
              <span className="text-xs font-medium text-gray-500">max_tokens</span>
              <input
                type="number"
                value={config.max_tokens}
                onChange={e => save({ max_tokens: +e.target.value })}
                min={256} max={65536} step={256}
                className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400 font-mono"
              />
            </label>

            {/* Temperature */}
            <label className="block">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-gray-500">Temperature</span>
                <span className="font-mono text-gray-400">{config.temperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                value={config.temperature}
                onChange={e => save({ temperature: +e.target.value })}
                min={0} max={2} step={0.1}
                className="mt-1 w-full accent-gray-600"
              />
            </label>

            {/* Top P */}
            <label className="block">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-gray-500">Top P</span>
                <span className="font-mono text-gray-400">{config.top_p.toFixed(2)}</span>
              </div>
              <input
                type="range"
                value={config.top_p}
                onChange={e => save({ top_p: +e.target.value })}
                min={0} max={1} step={0.05}
                className="mt-1 w-full accent-gray-600"
              />
            </label>

            {/* Presence Penalty */}
            <label className="block">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-gray-500">Presence Penalty</span>
                <span className="font-mono text-gray-400">{config.presence_penalty.toFixed(1)}</span>
              </div>
              <input
                type="range"
                value={config.presence_penalty}
                onChange={e => save({ presence_penalty: +e.target.value })}
                min={-2} max={2} step={0.1}
                className="mt-1 w-full accent-gray-600"
              />
            </label>

            {/* Top K */}
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Top K</span>
              <input
                type="number"
                value={config.top_k}
                onChange={e => save({ top_k: +e.target.value })}
                min={1} max={100} step={1}
                className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400 font-mono"
              />
            </label>

            {/* Enable Thinking */}
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Enable Thinking</span>
              <button
                onClick={() => save({ enable_thinking: !config.enable_thinking })}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  config.enable_thinking ? 'bg-gray-700' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    config.enable_thinking ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
          </div>
        )}

        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <p className="text-[10px] text-gray-400">修改即时生效，自动保存</p>
        </div>
      </div>

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </>
  );
}
