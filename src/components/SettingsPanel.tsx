import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

interface ModelConfig {
  api_key: string;
  base_url: string;
  model: string;
  max_tokens: number;
  temperature: number;
  top_p: number;
  presence_penalty: number;
  top_k: number;
  enable_thinking: boolean;
  reasoning_effort: "high" | "max";
  provider: string | null;
  hiddenParams: string[];
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const modelsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTestResult(null);
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
        }).then(r => r.json()).then((updated: ModelConfig) => {
          setConfig(prev2 => prev2 ? { ...prev2, ...updated } : prev2);
        });
      }, 300);
      return next;
    });
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save current config first
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const res = await fetch('/api/settings/test', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, text: `连接成功 — ${data.model}` });
      } else {
        setTestResult({ ok: false, text: data.error || '连接失败' });
      }
    } catch {
      setTestResult({ ok: false, text: '网络错误' });
    } finally {
      setTesting(false);
    }
  };

  const handleFetchModels = async () => {
    setModelsLoading(true);
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data.ok) {
        setModels(data.models);
        setModelSearch("");
        setModelsOpen(true);
      }
    } catch { /* ignore */ }
    finally { setModelsLoading(false); }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  // Dismiss model dropdown on outside click
  useEffect(() => {
    if (!modelsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (modelsRef.current && !modelsRef.current.contains(e.target as Node)) {
        setModelsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [modelsOpen]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40 transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col animate-[settingsSlideIn_0.2s_ease-out]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">模型设置</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {config && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* API Key */}
            <label className="block">
              <span className="text-xs font-medium text-gray-500">API Key</span>
              <input
                type="password"
                value={config.api_key}
                onChange={e => save({ api_key: e.target.value })}
                placeholder={config.api_key === '***' ? '已设置（不显示）' : '输入 API Key'}
                className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400 font-mono"
              />
            </label>

            {/* Base URL */}
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Base URL</span>
              <input
                type="text"
                value={config.base_url}
                onChange={e => save({ base_url: e.target.value })}
                className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400 font-mono"
              />
            </label>

            {/* Test connection */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
              {testResult && (
                <span className={`text-xs ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                  {testResult.ok ? '✓' : '✗'} {testResult.text}
                </span>
              )}
            </div>

            <hr className="border-gray-100" />

            {/* Model name */}
            <label className="block">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Model</span>
                {config.provider && (
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    {config.provider === 'deepseek' ? 'DeepSeek' : config.provider === 'qwen' ? 'Qwen' : config.provider}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={config.model}
                onChange={e => save({ model: e.target.value })}
                className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400 font-mono"
              />
            </label>

            {/* Model list button + dropdown */}
            <div className="relative" ref={modelsRef}>
              <button
                onClick={handleFetchModels}
                disabled={modelsLoading}
                className="w-full mt-1 px-3 py-1.5 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {modelsLoading ? '获取中…' : '获取模型列表'}
              </button>
              {modelsOpen && models.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  <div className="sticky top-0 bg-white px-2 py-2 border-b border-gray-100">
                    <input
                      type="text"
                      value={modelSearch}
                      onChange={e => setModelSearch(e.target.value)}
                      placeholder="搜索模型…"
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400"
                      autoFocus
                    />
                  </div>
                  {models
                    .filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()))
                    .map(m => (
                      <button
                        key={m}
                        onClick={() => {
                          save({ model: m });
                          setModelsOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-gray-50 transition-colors truncate ${
                          m === config.model ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                </div>
              )}
            </div>

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

            {/* Presence Penalty — hidden for providers that don't support it */}
            {!config.hiddenParams.includes('presence_penalty') && (
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
            )}

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
                  className="absolute left-0 top-0.5 w-4 h-4 bg-white rounded-full shadow"
                  style={{ transform: config.enable_thinking ? 'translateX(18px)' : 'translateX(2px)', transition: 'transform 0.15s ease' }}
                />
              </button>
            </label>

            {/* reasoning_effort — hidden for providers that don't support it */}
            {!config.hiddenParams.includes('reasoning_effort') && (
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Reasoning Effort</span>
                <div className="mt-1 flex gap-1.5">
                  {(['high', 'max'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => save({ reasoning_effort: v })}
                      className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                        config.reasoning_effort === v
                          ? 'bg-gray-700 text-white border-gray-700'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </label>
            )}
          </div>
        )}

        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <p className="text-[10px] text-gray-400">修改即时生效，自动保存</p>
        </div>
      </div>

      <style>{`
        @keyframes settingsSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </>
  );
}
