import { existsSync } from "fs";
import {
  DEFAULT_CLI_SESSION_ID,
  DEFAULT_PROJECT_ID,
  DEFAULT_USER_ID,
  LEGACY_MEMORY_FILE,
  SESSION_RECENT_MESSAGE_COUNT,
} from "../config.mjs";
import { nowIso, readJson, writeJson } from "./file-store.mjs";

function normalizeLegacyMessage(message) {
  if (!message || typeof message !== "object") return null;
  if (message.role !== "user" && message.role !== "assistant") return null;
  if (typeof message.content !== "string") return null;
  return {
    role: message.role,
    content: message.content,
    createdAt: nowIso(),
  };
}

export function migrateLegacyMemory({ sessionFile, sessionId, userId = DEFAULT_USER_ID, projectId = DEFAULT_PROJECT_ID }) {
  if (sessionId !== DEFAULT_CLI_SESSION_ID || existsSync(sessionFile) || !existsSync(LEGACY_MEMORY_FILE)) {
    return { migrated: false };
  }

  const legacy = readJson(LEGACY_MEMORY_FILE, null);
  if (!legacy || !Array.isArray(legacy.messages)) {
    return { migrated: false };
  }

  const messages = legacy.messages.map(normalizeLegacyMessage).filter(Boolean);
  const timestamp = nowIso();
  const summarizedMessageCount = legacy.summary
    ? Math.max(0, messages.length - SESSION_RECENT_MESSAGE_COUNT)
    : 0;

  const migratedSession = {
    version: 1,
    id: sessionId,
    userId,
    projectId,
    summary: typeof legacy.summary === "string" ? legacy.summary : "",
    messages,
    metadata: {
      summarizedMessageCount,
      migratedFromLegacy: true,
      lastSummaryAt: legacy.summary ? timestamp : null,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  writeJson(sessionFile, migratedSession);
  return { migrated: true, count: messages.length };
}
