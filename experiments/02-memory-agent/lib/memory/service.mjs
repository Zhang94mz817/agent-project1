import {
  DEFAULT_MODEL,
  DEFAULT_PROJECT_ID,
  DEFAULT_USER_ID,
  SESSION_RECENT_MESSAGE_COUNT,
  SESSION_SUMMARY_MIN_CHUNK,
  SESSION_SUMMARY_TRIGGER_MESSAGES,
  normalizeId,
} from "../config.mjs";
import { getDb } from "./db-store.mjs";

const nowIso = () => new Date().toISOString();

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

function summarizeMessages(messages) {
  const userRequests = [];
  const assistantDecisions = [];
  const openThreads = [];

  for (const message of messages) {
    if (message.role === "user") appendUnique(userRequests, truncate(message.content, 120));
    if (message.role === "assistant") appendUnique(assistantDecisions, truncate(message.content, 120));
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser) appendUnique(openThreads, `当前主题仍围绕：${truncate(lastUser.content, 100)}`);

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
    if (match) promotions.user.push({ key: "profile.name", value: match[1], confidence: "high", source: "session-summary" });

    match = text.match(/我是一个?(.+?)(?=$|[，,。！!；;\s])/);
    if (match && match[1].length <= 30) promotions.user.push({ key: "profile.occupation", value: match[1], confidence: "medium", source: "session-summary" });

    match = text.match(/工作(\d+)年/);
    if (match) promotions.user.push({ key: "profile.experienceYears", value: match[1], confidence: "high", source: "session-summary" });

    if (text.includes("请用中文") || text.includes("中文回答")) promotions.user.push({ key: "preference.languagePreference", value: "zh-CN", confidence: "high", source: "session-summary" });
    if (text.includes("简洁一点") || text.includes("简短回答")) promotions.user.push({ key: "preference.responseStyle", value: "concise", confidence: "high", source: "session-summary" });

    if (text.includes("02-memory-agent") || text.includes("memory demo")) {
      promotions.project.push({ key: "active.topic", value: "memory-agent", confidence: "medium", source: "session-summary" });
    }
  }
  return promotions;
}

function toContextSection(title, body) {
  if (!body) return "";
  return `${title}\n${body}`.trim();
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function loadUser(db, userId) {
  const now = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO users (id, profile, created_at, updated_at) VALUES (?, '{}', ?, ?)`
  ).run(userId, now, now);

  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const facts = db.prepare(`SELECT * FROM user_facts WHERE user_id = ? ORDER BY id`).all(userId);

  let profile = {};
  try { profile = JSON.parse(row.profile || "{}"); } catch { /* ignore */ }

  return { id: userId, profile, facts: facts.map(({ key, value, confidence, source, updated_at }) => ({ key, value, confidence, source, updatedAt: updated_at })), createdAt: row.created_at, updatedAt: row.updated_at };
}

function saveUser(db, user) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, profile, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET profile = excluded.profile, updated_at = excluded.updated_at`
  ).run(user.id, JSON.stringify(user.profile || {}), user.createdAt || now, now);

  db.prepare(`DELETE FROM user_facts WHERE user_id = ?`).run(user.id);
  const ins = db.prepare(`INSERT INTO user_facts (user_id, key, value, confidence, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const f of user.facts || []) ins.run(user.id, f.key, String(f.value), f.confidence || null, f.source || null, f.updatedAt || now);
}

function loadProject(db, projectId) {
  const now = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`
  ).run(projectId, projectId, now, now);

  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId);
  const facts = db.prepare(`SELECT * FROM project_facts WHERE project_id = ? ORDER BY id`).all(projectId);

  return { id: projectId, name: row.name, facts: facts.map(({ key, value, confidence, source, updated_at }) => ({ key, value, confidence, source, updatedAt: updated_at })), createdAt: row.created_at, updatedAt: row.updated_at };
}

function saveProject(db, project) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`
  ).run(project.id, project.name || project.id, project.createdAt || now, now);

  db.prepare(`DELETE FROM project_facts WHERE project_id = ?`).run(project.id);
  const ins = db.prepare(`INSERT INTO project_facts (project_id, key, value, confidence, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const f of project.facts || []) ins.run(project.id, f.key, String(f.value), f.confidence || null, f.source || null, f.updatedAt || now);
}

function loadSession(db, sessionId, userId, projectId) {
  const now = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO sessions (id, user_id, project_id, summary, summarized_message_count, last_summary_at, migrated_from_legacy, created_at, updated_at)
     VALUES (?, ?, ?, '', 0, NULL, 0, ?, ?)`
  ).run(sessionId, userId, projectId, now, now);

  const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);
  const messages = db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY id`).all(sessionId);

  return {
    id: sessionId,
    userId: row.user_id,
    projectId: row.project_id,
    summary: row.summary || "",
    messages: messages.map(({ role, content, created_at }) => ({ role, content, createdAt: created_at })),
    metadata: {
      summarizedMessageCount: row.summarized_message_count || 0,
      migratedFromLegacy: row.migrated_from_legacy === 1,
      lastSummaryAt: row.last_summary_at || null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function saveSession(db, session) {
  const now = nowIso();
  const meta = session.metadata || {};
  db.prepare(
    `INSERT INTO sessions (id, user_id, project_id, summary, summarized_message_count, last_summary_at, migrated_from_legacy, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       summary = excluded.summary,
       summarized_message_count = excluded.summarized_message_count,
       last_summary_at = excluded.last_summary_at,
       updated_at = excluded.updated_at`
  ).run(
    session.id, session.userId, session.projectId,
    session.summary || "",
    meta.summarizedMessageCount || 0,
    meta.lastSummaryAt || null,
    meta.migratedFromLegacy ? 1 : 0,
    session.createdAt || now,
    now,
  );
}

function appendMessageToDb(db, sessionId, role, content, createdAt) {
  db.prepare(
    `INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)`
  ).run(sessionId, role, content, createdAt);
}

function deleteMessagesUpTo(db, sessionId, count) {
  // Delete the oldest `count` messages for this session
  db.prepare(
    `DELETE FROM messages WHERE id IN (
       SELECT id FROM messages WHERE session_id = ? ORDER BY id LIMIT ?
     )`
  ).run(sessionId, count);
}

// ── MemoryService ─────────────────────────────────────────────────────────────

export class MemoryService {
  constructor({ userId = DEFAULT_USER_ID, projectId = DEFAULT_PROJECT_ID, sessionId, model = DEFAULT_MODEL } = {}) {
    this.userId = normalizeId(userId, DEFAULT_USER_ID);
    this.projectId = normalizeId(projectId, DEFAULT_PROJECT_ID);
    this.sessionId = normalizeId(sessionId, "session");
    this.model = model;
    this.db = getDb();

    this.userMemory = loadUser(this.db, this.userId);
    this.projectMemory = loadProject(this.db, this.projectId);
    this.sessionMemory = loadSession(this.db, this.sessionId, this.userId, this.projectId);
  }

  reload() {
    this.userMemory = loadUser(this.db, this.userId);
    this.projectMemory = loadProject(this.db, this.projectId);
    this.sessionMemory = loadSession(this.db, this.sessionId, this.userId, this.projectId);
  }

  saveUserMemory() {
    saveUser(this.db, this.userMemory);
  }

  saveProjectMemory() {
    saveProject(this.db, this.projectMemory);
  }

  saveSessionMemory() {
    saveSession(this.db, this.sessionMemory);
  }

  async addMessage(role, content) {
    const createdAt = nowIso();
    this.sessionMemory.messages.push({ role, content, createdAt });
    appendMessageToDb(this.db, this.sessionId, role, content, createdAt);
    await this.maybeSummarizeSession();
    this.saveSessionMemory();
  }

  async maybeSummarizeSession() {
    const unsummarizedCount =
      this.sessionMemory.messages.length - (this.sessionMemory.metadata?.summarizedMessageCount || 0);

    if (unsummarizedCount < SESSION_SUMMARY_TRIGGER_MESSAGES) return;

    const targetKeepCount = SESSION_RECENT_MESSAGE_COUNT;
    const chunkSize = Math.max(SESSION_SUMMARY_MIN_CHUNK, this.sessionMemory.messages.length - targetKeepCount);
    if (chunkSize <= 0) return;

    const chunk = this.sessionMemory.messages.slice(0, chunkSize);
    const existingSummary = this.sessionMemory.summary?.trim();
    const nextSummary = summarizeMessages(chunk);
    this.sessionMemory.summary = existingSummary ? `${existingSummary}\n${nextSummary}`.trim() : nextSummary;
    this.sessionMemory.messages = this.sessionMemory.messages.slice(chunkSize);
    this.sessionMemory.metadata = {
      ...(this.sessionMemory.metadata || {}),
      summarizedMessageCount: (this.sessionMemory.metadata?.summarizedMessageCount || 0) + chunk.length,
      lastSummaryAt: nowIso(),
    };

    deleteMessagesUpTo(this.db, this.sessionId, chunkSize);

    this.promoteFactsFromMessages(chunk);
    this.saveUserMemory();
    this.saveProjectMemory();
  }

  forceSummarizeSession() {
    const messages = this.sessionMemory.messages;
    if (messages.length === 0) return { summarized: 0, summary: this.sessionMemory.summary };

    const keepCount = SESSION_RECENT_MESSAGE_COUNT;
    const chunkSize = Math.max(1, messages.length - keepCount);
    const chunk = messages.slice(0, chunkSize);

    const existingSummary = this.sessionMemory.summary?.trim();
    const nextSummary = summarizeMessages(chunk);
    this.sessionMemory.summary = existingSummary ? `${existingSummary}\n${nextSummary}`.trim() : nextSummary;
    this.sessionMemory.messages = messages.slice(chunkSize);
    this.sessionMemory.metadata = {
      ...(this.sessionMemory.metadata || {}),
      summarizedMessageCount: (this.sessionMemory.metadata?.summarizedMessageCount || 0) + chunk.length,
      lastSummaryAt: nowIso(),
    };

    deleteMessagesUpTo(this.db, this.sessionId, chunkSize);
    this.promoteFactsFromMessages(chunk);
    this.saveUserMemory();
    this.saveProjectMemory();
    this.saveSessionMemory();

    return { summarized: chunk.length, summary: this.sessionMemory.summary };
  }

  promoteFactsFromMessages(messages) {
    const promotions = extractPromotions(messages);
    let userChanged = false;
    let projectChanged = false;

    for (const fact of promotions.user) {
      if (fact.key === "profile.name") { this.userMemory.profile.name = fact.value; userChanged = true; continue; }
      if (fact.key === "profile.occupation") { this.userMemory.profile.occupation = fact.value; userChanged = true; continue; }
      if (fact.key === "profile.experienceYears") { this.userMemory.profile.experienceYears = Number(fact.value); userChanged = true; continue; }
      if (fact.key === "preference.languagePreference") { this.userMemory.profile.languagePreference = fact.value; userChanged = true; continue; }
      if (fact.key === "preference.responseStyle") { this.userMemory.profile.responseStyle = fact.value; userChanged = true; continue; }
      this._upsertFact(this.userMemory.facts, fact);
      userChanged = true;
    }

    for (const fact of promotions.project) {
      this._upsertFact(this.projectMemory.facts, fact);
      projectChanged = true;
    }

    if (userChanged) this.userMemory.updatedAt = nowIso();
    if (projectChanged) this.projectMemory.updatedAt = nowIso();
  }

  _upsertFact(list, nextFact) {
    const existing = list.find((f) => f.key === nextFact.key && f.value === nextFact.value);
    if (existing) { existing.updatedAt = nowIso(); existing.source = nextFact.source; existing.confidence = nextFact.confidence; return; }
    const replaced = list.find((f) => f.key === nextFact.key);
    if (replaced && nextFact.confidence === "high") { Object.assign(replaced, nextFact, { updatedAt: nowIso() }); return; }
    list.push({ ...nextFact, updatedAt: nowIso() });
  }

  buildSystemPrompt(basePrompt) {
    const procedural = toContextSection("[Procedural Instructions]", basePrompt);

    const projectFacts = this.projectMemory.facts.map((f) => `- ${f.key}: ${f.value}`).join("\n");
    const projectMemory = toContextSection("[Project Memory]", projectFacts || "- (none)");

    const profileLines = Object.entries(this.userMemory.profile)
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => `- ${k}: ${v}`);
    const factLines = (this.userMemory.facts || []).map((f) => `- ${f.key}: ${f.value}`);
    const userMemory = toContextSection("[User Memory]", [...profileLines, ...factLines].join("\n") || "- (none)");

    const sessionSummary = toContextSection("[Session Summary]", this.sessionMemory.summary || "- (none yet)");

    return [procedural, projectMemory, userMemory, sessionSummary].filter(Boolean).join("\n\n");
  }

  getContextMessages() {
    return this.sessionMemory.messages.map(({ role, content }) => ({ role, content }));
  }

  getHistory() {
    return this.sessionMemory.messages.map(({ role, content, createdAt }) => ({
      role,
      content: typeof content === "string" ? content : "[工具调用]",
      createdAt,
    }));
  }

  clearSession() {
    this.db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(this.sessionId);
    this.db.prepare(
      `UPDATE sessions SET summary = '', summarized_message_count = 0, last_summary_at = NULL, updated_at = ? WHERE id = ?`
    ).run(nowIso(), this.sessionId);
    this.sessionMemory.messages = [];
    this.sessionMemory.summary = "";
    this.sessionMemory.metadata = { summarizedMessageCount: 0, migratedFromLegacy: false, lastSummaryAt: null };
  }

  getStatus() {
    const userProfileFacts = Object.entries(this.userMemory.profile)
      .filter(([, v]) => v !== null && v !== "")
      .map(([key, value]) => ({ key: `profile.${key}`, value, confidence: "high", source: "user-profile", updatedAt: this.userMemory.updatedAt || null }));

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
        ...this.userMemory.facts.map((f) => ({ key: f.key, value: f.value, confidence: f.confidence || null, source: f.source || null, updatedAt: f.updatedAt || null })),
      ],
      projectFactCount: this.projectMemory.facts.length,
      projectFacts: this.projectMemory.facts.map((f) => ({ key: f.key, value: f.value, confidence: f.confidence || null, source: f.source || null, updatedAt: f.updatedAt || null })),
      summarizedMessageCount: this.sessionMemory.metadata?.summarizedMessageCount || 0,
    };
  }
}
