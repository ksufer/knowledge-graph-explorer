// 运营商预设定义。新增运营商只需加一个 key。
export interface ProviderPreset {
  name: string;
  match: string[];
  defaults: {
    max_tokens: number;
    temperature: number;
    top_p: number;
    presence_penalty: number;
    enable_thinking: boolean;
    reasoning_effort?: "high" | "max";
  };
  hiddenParams: string[];
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  deepseek: {
    name: "DeepSeek",
    match: ["deepseek"],
    defaults: {
      max_tokens: 65536,
      temperature: 1.0,
      top_p: 1.0,
      presence_penalty: 0,
      enable_thinking: false,
      reasoning_effort: "high",
    },
    hiddenParams: ["presence_penalty"],
  },
  qwen: {
    name: "Qwen",
    match: ["qwen"],
    defaults: {
      max_tokens: 32768,
      temperature: 0.7,
      top_p: 0.8,
      presence_penalty: 1.5,
      enable_thinking: false,
    },
    hiddenParams: ["reasoning_effort"],
  },
};

const PRESET_ENTRIES = Object.entries(PROVIDER_PRESETS);

/** 根据模型名匹配运营商，返回 preset key 或 null */
export function matchProvider(model: string): string | null {
  const lower = model.toLowerCase();
  for (const [key, preset] of PRESET_ENTRIES) {
    if (preset.match.some(kw => lower.includes(kw))) return key;
  }
  return null;
}
