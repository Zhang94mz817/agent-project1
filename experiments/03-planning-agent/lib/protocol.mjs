export const CLIENT_MESSAGE_TYPES = Object.freeze({
  CHAT: "chat",
  PLAN_APPROVED: "plan_approved",
  PLAN_REJECTED: "plan_rejected",
});

export const SERVER_MESSAGE_TYPES = Object.freeze({
  READY: "ready",
  HISTORY_LOADED: "history_loaded",
  HISTORY_UPDATED: "history_updated",
  PLANNING: "planning",
  PLAN_READY: "plan_ready",
  EXECUTING: "executing",
  STEP_START: "step_start",
  STEP_DONE: "step_done",
  STEP_FAILED: "step_failed",
  REFLECTING: "reflecting",
  REFLECT_READY: "reflect_ready",
  ERROR: "error",
});

export const SESSION_STATES = Object.freeze({
  IDLE: "idle",
  PLANNING: "planning",
  AWAITING_APPROVAL: "awaiting_approval",
  EXECUTING: "executing",
  REFLECTING: "reflecting",
});

export const TASK_STATUSES = Object.freeze({
  COMPLETED: "completed",
  COMPLETED_WITH_ERRORS: "completed_with_errors",
  FAILED: "failed",
});

export const HISTORY_LIMIT = 8;

export function isBusyState(state) {
  return state !== SESSION_STATES.IDLE;
}

export function createClientMessage(type, payload = {}) {
  return parseClientMessage({ type, ...payload });
}

export function parseClientMessage(value) {
  const message = ensureRecord(value, "客户端消息格式无效");

  switch (message.type) {
    case CLIENT_MESSAGE_TYPES.CHAT:
      return {
        type: CLIENT_MESSAGE_TYPES.CHAT,
        content: ensureNonEmptyText(message.content, "任务目标不能为空。"),
      };
    case CLIENT_MESSAGE_TYPES.PLAN_APPROVED:
      return { type: CLIENT_MESSAGE_TYPES.PLAN_APPROVED };
    case CLIENT_MESSAGE_TYPES.PLAN_REJECTED:
      return {
        type: CLIENT_MESSAGE_TYPES.PLAN_REJECTED,
        feedback: normalizeText(message.feedback),
      };
    default:
      throw new Error(`未知客户端消息类型: ${String(message.type)}`);
  }
}

export function createServerMessage(type, payload = {}) {
  return parseServerMessage({ type, ...payload });
}

export function parseServerMessage(value) {
  const message = ensureRecord(value, "服务端消息格式无效");

  switch (message.type) {
    case SERVER_MESSAGE_TYPES.READY:
    case SERVER_MESSAGE_TYPES.PLANNING:
    case SERVER_MESSAGE_TYPES.EXECUTING:
    case SERVER_MESSAGE_TYPES.REFLECTING:
    case SERVER_MESSAGE_TYPES.ERROR:
      return {
        type: message.type,
        message: ensureNonEmptyText(message.message, "消息内容不能为空。"),
      };
    case SERVER_MESSAGE_TYPES.PLAN_READY:
      return {
        type: SERVER_MESSAGE_TYPES.PLAN_READY,
        plan: normalizePlan(message.plan),
      };
    case SERVER_MESSAGE_TYPES.STEP_START:
      return {
        type: SERVER_MESSAGE_TYPES.STEP_START,
        stepId: ensureStepId(message.stepId),
        title: ensureNonEmptyText(message.title, "步骤标题不能为空。"),
        tool: ensureNonEmptyText(message.tool, "步骤工具不能为空。"),
      };
    case SERVER_MESSAGE_TYPES.STEP_DONE:
      return {
        type: SERVER_MESSAGE_TYPES.STEP_DONE,
        stepId: ensureStepId(message.stepId),
        result: ensureTextOrDefault(message.result, "（无结果）"),
        output: normalizeNullableText(message.output),
        error: null,
      };
    case SERVER_MESSAGE_TYPES.STEP_FAILED:
      return {
        type: SERVER_MESSAGE_TYPES.STEP_FAILED,
        stepId: ensureStepId(message.stepId),
        result: ensureTextOrDefault(message.result, "步骤执行失败。"),
        output: normalizeNullableText(message.output),
        error: ensureTextOrDefault(message.error, "未知错误。"),
      };
    case SERVER_MESSAGE_TYPES.REFLECT_READY:
      return {
        type: SERVER_MESSAGE_TYPES.REFLECT_READY,
        reflection: ensureNonEmptyText(message.reflection, "反思内容不能为空。"),
      };
    case SERVER_MESSAGE_TYPES.HISTORY_LOADED:
    case SERVER_MESSAGE_TYPES.HISTORY_UPDATED:
      return {
        type: message.type,
        items: normalizeHistoryItems(message.items),
      };
    default:
      throw new Error(`未知服务端消息类型: ${String(message.type)}`);
  }
}

export function normalizeHistoryItems(items) {
  if (!Array.isArray(items)) {
    throw new Error("历史记录格式无效。");
  }

  return items.map((item) => normalizeHistoryItem(item));
}

export function normalizeHistoryItem(item) {
  const record = ensureRecord(item, "历史记录格式无效。");
  const status = ensureEnum(record.status, Object.values(TASK_STATUSES), "任务状态无效。");

  return {
    id: ensureNonEmptyText(record.id, "历史记录缺少 ID。"),
    goal: ensureNonEmptyText(record.goal, "历史记录缺少目标。"),
    status,
    createdAt: ensureNonEmptyText(record.createdAt, "历史记录缺少创建时间。"),
    completedAt: normalizeNullableText(record.completedAt),
    stepCount: ensureNonNegativeInteger(record.stepCount, "步骤数量无效。"),
    failedStepCount: ensureNonNegativeInteger(record.failedStepCount, "失败步骤数量无效。"),
    reflectionPreview: normalizeNullableText(record.reflectionPreview),
    error: normalizeNullableText(record.error),
  };
}

function normalizePlan(plan) {
  const record = ensureRecord(plan, "计划格式无效。");
  const steps = Array.isArray(record.steps) ? record.steps : null;

  if (!steps || steps.length === 0) {
    throw new Error("计划步骤不能为空。");
  }

  return {
    goal: ensureNonEmptyText(record.goal, "计划目标不能为空。"),
    steps: steps.map((step, index) => normalizePlanStep(step, index)),
  };
}

function normalizePlanStep(step, index) {
  const record = ensureRecord(step, `计划步骤 ${index + 1} 格式无效。`);

  return {
    id: ensureStepId(record.id),
    title: ensureNonEmptyText(record.title, `计划步骤 ${index + 1} 标题不能为空。`),
    tool: ensureNonEmptyText(record.tool, `计划步骤 ${index + 1} 工具不能为空。`),
    input: ensurePlainObject(record.input, `计划步骤 ${index + 1} 输入无效。`),
    reason: ensureNonEmptyText(record.reason, `计划步骤 ${index + 1} 原因不能为空。`),
  };
}

function ensureRecord(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value;
}

function ensurePlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value;
}

function ensureNonEmptyText(value, message) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function ensureTextOrDefault(value, fallback) {
  const text = normalizeText(value);
  return text || fallback;
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text || null;
}

function ensureStepId(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("步骤 ID 无效。");
  }

  return value;
}

function ensureNonNegativeInteger(value, message) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }

  return value;
}

function ensureEnum(value, allowedValues, message) {
  if (!allowedValues.includes(value)) {
    throw new Error(message);
  }

  return value;
}
