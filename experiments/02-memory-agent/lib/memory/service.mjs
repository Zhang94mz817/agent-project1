import {
  DEFAULT_MODEL,
  DEFAULT_PROJECT_ID,
  DEFAULT_USER_ID,
  PROJECTS_DIR,
  SESSION_RECENT_MESSAGE_COUNT,
  SESSION_SUMMARY_MIN_CHUNK,
  SESSION_SUMMARY_TRIGGER_MESSAGES,
  SESSIONS_DIR,
  USERS_DIR,
  normalizeId,
} from "../config.mjs";
import { ensureDir, ensureJsonFile, nowIso, readJson, writeJson } from "./file-store.mjs";
import { migrateLegacyMemory } from "./migrate.mjs";

const USER_MEMORY_VERSION = 1;
const PROJECT_MEMORY_VERSION = 1;
const SESSION_MEMORY_VERSION = 1;

function createDefaultUserMemory(userId) {
  const timestamp = nowIso();
  return {
    version: USER_MEMORY_VERSION,
    id: userId,
    profile: {
      name: null,
      occupation: null,
      experienceYears: null,
      languagePreference: null,
      responseStyle: null,
    },
    preferences: [],
    facts: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createDefaultProjectMemory(projectId) {
  const timestamp = nowIso();
  return {
    version: PROJECT_MEMORY_VERSION,
    id: projectId,
    name: projectId,
    facts: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createDefaultSessionMemory(sessionId, userId, projectId) {
  const timestamp = nowIso();
  return {
    version: SESSION_MEMORY_VERSION,
    id: sessionId,
    userId,
    projectId,
    summary: "",
    messages: [],
    metadata: {
      summarizedMessageCount: 0,
      migratedFromLegacy: false,
      lastSummaryAt: null,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function truncate(text, max = 160) {
  if (!text) return "";
  const value = String(text).replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function appendUnique(list, value) {
  if (!value) return;
  if (!list.includes(value)) list.push(value);
}

function upsertFact(list, nextFact) {
  const existing = list.find((fact) => fact.key === nextFact.key && fact.value === nextFact.value);
  if (existing) {
    existing.updatedAt = nowIso();
    existing.source = nextFact.source;
    existing.confidence = nextFact.confidence;
    return;
  }

  const replaced = list.find((fact) => fact.key === nextFact.key);
  if (replaced && nextFact.confidence === "high") {
    Object.assign(replaced, nextFact, { updatedAt: nowIso() });
    return;
  }

  list.push({ ...nextFact, updatedAt: nowIso() });
}

function summarizeMessages(messages) {
  const userRequests = [];
  const assistantDecisions = [];
  const openThreads = [];

  for (const message of messages) {
    if (message.role === "user") {
      appendUnique(userRequests, truncate(message.content, 120));
    }
    if (message.role === "assistant") {
      appendUnique(assistantDecisions, truncate(message.content, 120));
    }
  }

  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (lastUser) {
    appendUnique(openThreads, `当前主题仍围绕：${truncate(lastUser.content, 100)}`);
  }

  const parts = [];
  if (userRequests.length) parts.push(`用户要求：${userRequests.slice(-3).join("；")}`);
  if (assistantDecisions.length) parts.push(`已回应：${assistantDecisions.slice(-2).join("；")}`);
  if (openThreads.length) parts.push(`待延续：${openThreads.join("；")}`);
  return parts.join("\n");
}

function extractPromotions(messages) {
  const promotions = { user: [], project: [] };

  for (const message of messages) {
    if (message.role !== "user" || typeof message.content !== "string") continue;
    const text = message.content.trim();
    let match;

    match = text.match(/我叫([\u4e00-\u9fa5A-Za-z·\-]{2,30})(?=$|[，,。！!；;\s])/);
    if (match) {
      promotions.user.push({
        key: "profile.name",
        value: match[1],
        confidence: "high",
        source: "session-summary",
      });
    }

    match = text.match(/我是一个?(.+?)(?=$|[，,。！!；;\s])/);
    if (match && match[1].length <= 30) {
      promotions.user.push({
        key: "profile.occupation",
        value: match[1],
        confidence: "medium",
        source: "session-summary",
      });
    }

    match = text.match(/工作(\d+)年/);
    if (match) {
      promotions.user.push({
        key: "profile.experienceYears",
        value: match[1],
        confidence: "high",
        source: "session-summary",
      });
    }

    if (text.includes("请用中文") || text.includes("中文回答")) {
      promotions.user.push({
        key: "preference.languagePreference",
        value: "zh-CN",
        confidence: "high",
        source: "session-summary",
      });
    }

    if (text.includes("简洁一点") || text.includes("简短回答")) {
      promotions.user.push({
        key: "preference.responseStyle",
        value: "concise",
        confidence: "high",
        source: "session-summary",
      });
    }

    if (text.includes("02-memory-agent") || text.includes("memory demo")) {
      promotions.project.push({
        key: "active.topic",
        value: "memory-agent",
        confidence: "medium",
        source: "session-summary",
      });
    }
  }

  return promotions;
}

function toContextSection(title, body) {
  if (!body) return "";
  return `${title}\n${body}`.trim();
}

export class MemoryService {
  constructor({ userId = DEFAULT_USER_ID, projectId = DEFAULT_PROJECT_ID, sessionId, model = DEFAULT_MODEL } = {}) {
    this.userId = normalizeId(userId, DEFAULT_USER_ID);
    this.projectId = normalizeId(projectId, DEFAULT_PROJECT_ID);
    this.sessionId = normalizeId(sessionId, "session");
    this.model = model;

    ensureDir(USERS_DIR);
    ensureDir(PROJECTS_DIR);
    ensureDir(SESSIONS_DIR);

    this.userFile = `${USERS_DIR}/${this.userId}.json`;
    this.projectFile = `${PROJECTS_DIR}/${this.projectId}.json`;
    this.sessionFile = `${SESSIONS_DIR}/${this.sessionId}.json`;

    this.userMemory = ensureJsonFile(this.userFile, () => createDefaultUserMemory(this.userId));
    this.projectMemory = ensureJsonFile(this.projectFile, () => createDefaultProjectMemory(this.projectId));

    migrateLegacyMemory({
      sessionFile: this.sessionFile,
      sessionId: this.sessionId,
      userId: this.userId,
      projectId: this.projectId,
    });

    this.sessionMemory = ensureJsonFile(this.sessionFile, () =>
      createDefaultSessionMemory(this.sessionId, this.userId, this.projectId)
    );
  }

  reload() {
    this.userMemory = readJson(this.userFile, createDefaultUserMemory(this.userId));
    this.projectMemory = readJson(this.projectFile, createDefaultProjectMemory(this.projectId));
    this.sessionMemory = readJson(
      this.sessionFile,
      createDefaultSessionMemory(this.sessionId, this.userId, this.projectId)
    );
  }

  saveUserMemory() {
    this.userMemory.updatedAt = nowIso();
    writeJson(this.userFile, this.userMemory);
  }

  saveProjectMemory() {
    this.projectMemory.updatedAt = nowIso();
    writeJson(this.projectFile, this.projectMemory);
  }

  saveSessionMemory() {
    this.sessionMemory.updatedAt = nowIso();
    writeJson(this.sessionFile, this.sessionMemory);
  }

  async addMessage(role, content) {
    this.sessionMemory.messages.push({ role, content, createdAt: nowIso() });
    await this.maybeSummarizeSession();
    this.saveSessionMemory();
  }

  async maybeSummarizeSession() {
    const unsummarizedCount =
      this.sessionMemory.messages.length - (this.sessionMemory.metadata?.summarizedMessageCount || 0);

    if (unsummarizedCount < SESSION_SUMMARY_TRIGGER_MESSAGES) return;

    const targetKeepCount = SESSION_RECENT_MESSAGE_COUNT;
    const chunkSize = Math.max(
      SESSION_SUMMARY_MIN_CHUNK,
      this.sessionMemory.messages.length - targetKeepCount
    );

    if (chunkSize <= 0) return;

    const chunk = this.sessionMemory.messages.slice(0, chunkSize);
    const existingSummary = this.sessionMemory.summary?.trim();
    const nextSummary = summarizeMessages(chunk);
    this.sessionMemory.summary = existingSummary
      ? `${existingSummary}\n${nextSummary}`.trim()
      : nextSummary;

    this.sessionMemory.messages = this.sessionMemory.messages.slice(chunkSize);
    this.sessionMemory.metadata = {
      ...(this.sessionMemory.metadata || {}),
      summarizedMessageCount: (this.sessionMemory.metadata?.summarizedMessageCount || 0) + chunk.length,
      lastSummaryAt: nowIso(),
    };

    this.promoteFactsFromMessages(chunk);
    this.saveUserMemory();
    this.saveProjectMemory();
  }

  promoteFactsFromMessages(messages) {
    const promotions = extractPromotions(messages);
    let userChanged = false;
    let projectChanged = false;

    for (const fact of promotions.user) {
      if (fact.key === "profile.name") {
        this.userMemory.profile.name = fact.value;
        userChanged = true;
        continue;
      }
      if (fact.key === "profile.occupation") {
        this.userMemory.profile.occupation = fact.value;
        userChanged = true;
        continue;
      }
      if (fact.key === "profile.experienceYears") {
        this.userMemory.profile.experienceYears = Number(fact.value);
        userChanged = true;
        continue;
      }
      if (fact.key === "preference.languagePreference") {
        this.userMemory.profile.languagePreference = fact.value;
        userChanged = true;
        continue;
      }
      if (fact.key === "preference.responseStyle") {
        this.userMemory.profile.responseStyle = fact.value;
        userChanged = true;
        continue;
      }
      upsertFact(this.userMemory.facts, fact);
      userChanged = true;
    }

    for (const fact of promotions.project) {
      upsertFact(this.projectMemory.facts, fact);
      projectChanged = true;
    }

    if (userChanged) this.userMemory.updatedAt = nowIso();
    if (projectChanged) this.projectMemory.updatedAt = nowIso();
  }

  buildSystemPrompt(basePrompt) {
    const procedural = toContextSection("[Procedural Instructions]", basePrompt);

    const projectFacts = this.projectMemory.facts
      .map((fact) => `- ${fact.key}: ${fact.value}`)
      .join("\n");
    const projectMemory = toContextSection("[Project Memory]", projectFacts || "- (none)");

    const profileLines = Object.entries(this.userMemory.profile)
      .filter(([, value]) => value !== null && value !== "")
      .map(([key, value]) => `- ${key}: ${value}`);
    const factLines = (this.userMemory.facts || []).map((fact) => `- ${fact.key}: ${fact.value}`);
    const userMemory = toContextSection(
      "[User Memory]",
      [...profileLines, ...factLines].join("\n") || "- (none)"
    );

    const sessionSummary = toContextSection(
      "[Session Summary]",
      this.sessionMemory.summary || "- (none yet)"
    );

    return [procedural, projectMemory, userMemory, sessionSummary].filter(Boolean).join("\n\n");
  }

  getContextMessages() {
    return this.sessionMemory.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  getHistory() {
    return this.sessionMemory.messages.map((message) => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content : "[工具调用]",
      createdAt: message.createdAt,
    }));
  }

  clearSession() {
    this.sessionMemory = createDefaultSessionMemory(this.sessionId, this.userId, this.projectId);
    this.saveSessionMemory();
  }

  getStatus() {
    const userProfileFacts = Object.entries(this.userMemory.profile)
      .filter(([, value]) => value !== null && value !== "")
      .map(([key, value]) => ({
        key: `profile.${key}`,
        value,
        confidence: "high",
        source: "user-profile",
        updatedAt: this.userMemory.updatedAt || null,
      }));

    return {
      sessionId: this.sessionId,
      userId: this.userId,
      projectId: this.projectId,
      count: this.sessionMemory.messages.length,
      summary: this.sessionMemory.summary || "",
      userProfile: this.userMemory.profile,
      userFactCount: userProfileFacts.length + this.userMemory.facts.length,
      userFacts: [
        ...userProfileFacts,
        ...this.userMemory.facts.map((fact) => ({
          key: fact.key,
          value: fact.value,
          confidence: fact.confidence || null,
          source: fact.source || null,
          updatedAt: fact.updatedAt || null,
        })),
      ],
      projectFactCount: this.projectMemory.facts.length,
      projectFacts: this.projectMemory.facts.map((fact) => ({
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence || null,
        source: fact.source || null,
        updatedAt: fact.updatedAt || null,
      })),
      summarizedMessageCount: this.sessionMemory.metadata?.summarizedMessageCount || 0,
    };
  }
}
