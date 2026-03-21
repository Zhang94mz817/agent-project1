import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = resolve(__dirname, "..");
export const DATA_DIR = resolve(APP_DIR, "data");
export const USERS_DIR = resolve(DATA_DIR, "users");
export const PROJECTS_DIR = resolve(DATA_DIR, "projects");
export const SESSIONS_DIR = resolve(DATA_DIR, "sessions");
export const PROMPTS_DIR = resolve(APP_DIR, "prompts");
export const SYSTEM_PROMPT_FILE = resolve(PROMPTS_DIR, "system.md");
export const LEGACY_MEMORY_FILE = resolve(APP_DIR, "memory.json");
export const HTML_FILE = resolve(APP_DIR, "index.html");
export const ENV_FILE = resolve(APP_DIR, ".env");

export const DEFAULT_USER_ID = process.env.MEMORY_USER_ID || "default";
export const DEFAULT_PROJECT_ID = process.env.MEMORY_PROJECT_ID || "default";
export const DEFAULT_CLI_SESSION_ID = process.env.MEMORY_SESSION_ID || "cli-default";
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "anthropic/claude-sonnet-4.5";
export const DEFAULT_PORT = Number(process.env.PORT || 3000);

export const SESSION_SUMMARY_TRIGGER_MESSAGES = 16;
export const SESSION_RECENT_MESSAGE_COUNT = 10;
export const SESSION_SUMMARY_MIN_CHUNK = 4;
export const AGENT_MAX_TURNS = 10;

function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return;

  const envFile = readFileSync(ENV_FILE, "utf-8");
  for (const rawLine of envFile.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const [key, ...rest] = line.split("=");
    if (!key || rest.length === 0) continue;
    process.env[key.trim()] = rest.join("=").trim();
  }
}

loadEnvFile();

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
}

export function normalizeId(value, fallback) {
  const input = String(value || "").trim();
  if (!input) return fallback;
  return input.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || fallback;
}

export function readSystemPrompt() {
  if (!existsSync(SYSTEM_PROMPT_FILE)) return "你是一个有用的 AI 助手。请优先使用分层 memory，并用中文回答。";
  return readFileSync(SYSTEM_PROMPT_FILE, "utf-8").trim();
}
