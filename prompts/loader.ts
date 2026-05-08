import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const promptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)));

interface PromptSet {
  system: string;
  user: string;
}

const cache = new Map<string, { mtime: number; content: PromptSet }>();

function loadFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8").trim();
}

/** Load a prompt set (system + user), re-reading from disk when files change. */
export function loadPrompt(name: string): PromptSet {
  const dir = path.join(promptsDir, name);
  const systemPath = path.join(dir, "system.md");
  const userPath = path.join(dir, "user.md");

  let systemMtime = 0;
  let userMtime = 0;
  try {
    systemMtime = fs.statSync(systemPath).mtimeMs;
    userMtime = fs.statSync(userPath).mtimeMs;
  } catch {
    console.error(`Prompt "${name}" not found at ${dir}`);
    return { system: "", user: "" };
  }

  const latestMtime = Math.max(systemMtime, userMtime);
  const cached = cache.get(name);

  if (cached && cached.mtime >= latestMtime) {
    return cached.content;
  }

  const content: PromptSet = {
    system: loadFile(systemPath),
    user: loadFile(userPath),
  };
  cache.set(name, { mtime: latestMtime, content });
  console.log(`[prompts] Loaded "${name}" (system: ${content.system.length} chars, user: ${content.user.length} chars)`);
  return content;
}

/** Replace {{key}} placeholders with values. */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/** Escape user-provided text so {{...}} patterns are not treated as template variables. */
export function escapeText(text: string): string {
  return text.replace(/\{\{/g, '{\\{').replace(/\}\}/g, '}\\}');
}
