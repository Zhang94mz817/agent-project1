import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { randomUUID } from "crypto";
import { HISTORY_LIMIT, TASK_STATUSES, normalizeHistoryItems } from "./protocol.mjs";

export class TaskHistoryStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async listSummaries(limit = HISTORY_LIMIT) {
    const records = await this.readRecords();
    return summarizeRecords(records, limit);
  }

  async saveTask(task) {
    return this.enqueue(async () => {
      const records = await this.readRecords();
      const record = normalizeTaskRecord(task);
      const index = records.findIndex((item) => item.id === record.id);

      if (index >= 0) {
        records[index] = record;
      } else {
        records.unshift(record);
      }

      await this.writeRecords(records);
      return summarizeRecords(records, HISTORY_LIMIT);
    });
  }

  createTask(goal) {
    const timestamp = new Date().toISOString();

    return {
      id: randomUUID(),
      goal,
      status: TASK_STATUSES.FAILED,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      plan: null,
      results: [],
      reflection: null,
      error: null,
    };
  }

  async readRecords() {
    try {
      const content = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(content);

      return Array.isArray(parsed) ? parsed.map((record) => normalizeTaskRecord(record)) : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async writeRecords(records) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(records, null, 2), "utf-8");
  }

  enqueue(task) {
    const next = this.queue.then(task, task);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

function normalizeTaskRecord(record) {
  const safeRecord = ensureRecord(record);
  const results = Array.isArray(safeRecord.results) ? safeRecord.results.map((result) => normalizeResult(result)) : [];
  const plan = normalizePlanValue(safeRecord.plan);
  const createdAt = ensureIsoText(safeRecord.createdAt);
  const updatedAt = ensureIsoText(safeRecord.updatedAt ?? createdAt);
  const completedAt = safeRecord.completedAt ? ensureIsoText(safeRecord.completedAt) : null;

  return {
    id: ensureText(safeRecord.id),
    goal: ensureText(safeRecord.goal),
    status: normalizeStatus(safeRecord.status),
    createdAt,
    updatedAt,
    completedAt,
    plan,
    results,
    reflection: normalizeNullableText(safeRecord.reflection),
    error: normalizeNullableText(safeRecord.error),
  };
}

function normalizePlanValue(plan) {
  if (!plan) {
    return null;
  }

  const safePlan = ensureRecord(plan);
  const steps = Array.isArray(safePlan.steps) ? safePlan.steps : [];

  return {
    goal: ensureText(safePlan.goal),
    steps: steps.map((step) => {
      const safeStep = ensureRecord(step);
      return {
        id: Number.isInteger(safeStep.id) ? safeStep.id : 0,
        title: ensureText(safeStep.title),
        tool: ensureText(safeStep.tool),
        input: ensurePlainObject(safeStep.input ?? {}),
        reason: ensureText(safeStep.reason),
      };
    }),
  };
}

function normalizeResult(result) {
  const safeResult = ensureRecord(result);
  const output = normalizeNullableText(safeResult.output);
  const error = normalizeNullableText(safeResult.error);

  return {
    stepId: Number.isInteger(safeResult.stepId) ? safeResult.stepId : 0,
    title: ensureText(safeResult.title),
    tool: ensureText(safeResult.tool),
    ok: Boolean(safeResult.ok),
    output,
    error,
    result: ensureTextOrDefault(safeResult.result, output ?? error ?? "（无结果）"),
  };
}

function summarizeRecords(records, limit) {
  const summaries = records
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit)
    .map((record) => ({
      id: record.id,
      goal: record.goal,
      status: record.status,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      stepCount: record.plan?.steps?.length ?? 0,
      failedStepCount: record.results.filter((item) => !item.ok).length,
      reflectionPreview: buildPreview(record.reflection),
      error: record.error,
    }));

  return normalizeHistoryItems(summaries);
}

function buildPreview(text) {
  const value = normalizeNullableText(text);
  return value ? value.slice(0, 120) : null;
}

function ensureRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("任务历史记录格式无效。");
  }

  return value;
}

function ensurePlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("任务历史对象无效。");
  }

  return value;
}

function ensureText(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("任务历史文本字段无效。");
  }

  return value.trim();
}

function ensureTextOrDefault(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();
  return text || fallback;
}

function ensureIsoText(value) {
  const text = ensureText(value);

  if (Number.isNaN(Date.parse(text))) {
    throw new Error("任务历史时间字段无效。");
  }

  return text;
}

function normalizeNullableText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text || null;
}

function normalizeStatus(value) {
  switch (value) {
    case TASK_STATUSES.COMPLETED:
    case TASK_STATUSES.COMPLETED_WITH_ERRORS:
    case TASK_STATUSES.FAILED:
      return value;
    default:
      throw new Error("任务历史状态无效。");
  }
}
