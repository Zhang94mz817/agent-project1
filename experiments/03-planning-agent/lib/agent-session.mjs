import { CLIENT_MESSAGE_TYPES, HISTORY_LIMIT, SERVER_MESSAGE_TYPES, SESSION_STATES, TASK_STATUSES } from "./protocol.mjs";

const READY_MESSAGE = "请输入你的任务目标，我会为你制定执行计划。";

export class AgentSession {
  constructor(send, dependencies) {
    this.send = send;
    this.createPlan = dependencies.createPlan;
    this.executePlan = dependencies.executePlan;
    this.reflect = dependencies.reflect;
    this.historyStore = dependencies.historyStore ?? null;
    this.state = SESSION_STATES.IDLE;
    this.pendingPlan = null;
    this.pendingGoal = null;
    this.currentTask = null;
  }

  async start() {
    this.send({ type: SERVER_MESSAGE_TYPES.READY, message: READY_MESSAGE });
    await this.pushHistory();
  }

  async handleMessage(message) {
    switch (message.type) {
      case CLIENT_MESSAGE_TYPES.CHAT:
        await this.handleChat(message.content);
        return;
      case CLIENT_MESSAGE_TYPES.PLAN_APPROVED:
        await this.handlePlanApproved();
        return;
      case CLIENT_MESSAGE_TYPES.PLAN_REJECTED:
        await this.handlePlanRejected(message.feedback);
        return;
      default:
        this.sendError(`未知消息类型: ${message.type}`);
    }
  }

  async handleChat(content) {
    if (this.state !== SESSION_STATES.IDLE) {
      this.sendError("正在处理中，请稍候。");
      return;
    }

    this.pendingGoal = content;
    this.pendingPlan = null;
    this.currentTask = this.historyStore ? this.historyStore.createTask(content) : createTransientTask(content);
    this.state = SESSION_STATES.PLANNING;
    this.send({ type: SERVER_MESSAGE_TYPES.PLANNING, message: "正在制定执行计划…" });

    try {
      const plan = await this.createPlan(this.pendingGoal);
      this.pendingPlan = plan;
      this.currentTask.plan = plan;
      this.currentTask.updatedAt = nowIso();
      this.state = SESSION_STATES.AWAITING_APPROVAL;
      this.send({ type: SERVER_MESSAGE_TYPES.PLAN_READY, plan });
    } catch (error) {
      await this.failCurrentTask(`规划失败: ${error.message}`);
      this.reset();
      this.sendError(`规划失败: ${error.message}`);
    }
  }

  async handlePlanApproved() {
    if (this.state !== SESSION_STATES.AWAITING_APPROVAL || !this.pendingPlan) {
      this.sendError("当前没有可执行的计划。");
      return;
    }

    this.state = SESSION_STATES.EXECUTING;
    this.send({ type: SERVER_MESSAGE_TYPES.EXECUTING, message: "开始执行计划…" });
    let results = [];

    try {
      results = await this.executePlan(this.pendingPlan, this.send);
      this.state = SESSION_STATES.REFLECTING;
      this.send({ type: SERVER_MESSAGE_TYPES.REFLECTING, message: "正在生成反思报告…" });

      const reflection = await this.reflect(this.pendingGoal, this.pendingPlan, results);
      await this.completeCurrentTask(results, reflection);
      this.send({ type: SERVER_MESSAGE_TYPES.REFLECT_READY, reflection });
      this.reset();
    } catch (error) {
      await this.failCurrentTask(`执行失败: ${error.message}`, results);
      this.reset();
      this.sendError(`执行失败: ${error.message}`);
    }
  }

  async handlePlanRejected(feedback) {
    if (this.state !== SESSION_STATES.AWAITING_APPROVAL || !this.pendingGoal) {
      this.sendError("当前没有可修改的计划。");
      return;
    }

    this.state = SESSION_STATES.PLANNING;
    this.send({ type: SERVER_MESSAGE_TYPES.PLANNING, message: "根据你的意见重新制定计划…" });

    try {
      const plan = await this.createPlan(this.pendingGoal, feedback || "");
      this.pendingPlan = plan;
      this.currentTask.plan = plan;
      this.currentTask.updatedAt = nowIso();
      this.state = SESSION_STATES.AWAITING_APPROVAL;
      this.send({ type: SERVER_MESSAGE_TYPES.PLAN_READY, plan });
    } catch (error) {
      await this.failCurrentTask(`重新规划失败: ${error.message}`);
      this.reset();
      this.sendError(`重新规划失败: ${error.message}`);
    }
  }

  reset() {
    this.state = SESSION_STATES.IDLE;
    this.pendingPlan = null;
    this.pendingGoal = null;
    this.currentTask = null;
  }

  async pushHistory() {
    if (!this.historyStore) {
      return;
    }

    try {
      const items = await this.historyStore.listSummaries(HISTORY_LIMIT);
      this.send({ type: SERVER_MESSAGE_TYPES.HISTORY_LOADED, items });
    } catch (error) {
      console.error("加载任务历史失败:", error.message);
    }
  }

  async completeCurrentTask(results, reflection) {
    if (!this.currentTask) {
      return;
    }

    const hasFailures = results.some((result) => !result.ok);
    await this.persistCurrentTask({
      status: hasFailures ? TASK_STATUSES.COMPLETED_WITH_ERRORS : TASK_STATUSES.COMPLETED,
      results,
      reflection,
      error: null,
    });
  }

  async failCurrentTask(errorMessage, results = []) {
    if (!this.currentTask) {
      return;
    }

    await this.persistCurrentTask({
      status: TASK_STATUSES.FAILED,
      results,
      error: errorMessage,
      reflection: null,
    });
  }

  async persistCurrentTask(patch) {
    if (!this.currentTask) {
      return;
    }

    const timestamp = nowIso();

    this.currentTask = {
      ...this.currentTask,
      ...patch,
      updatedAt: timestamp,
      completedAt: timestamp,
    };

    if (!this.historyStore) {
      return;
    }

    try {
      const items = await this.historyStore.saveTask(this.currentTask);
      this.send({ type: SERVER_MESSAGE_TYPES.HISTORY_UPDATED, items });
    } catch (error) {
      console.error("写入任务历史失败:", error.message);
    }
  }

  sendError(message) {
    this.send({ type: SERVER_MESSAGE_TYPES.ERROR, message });
  }
}

function createTransientTask(goal) {
  const timestamp = nowIso();

  return {
    id: `transient-${Date.now()}`,
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

function nowIso() {
  return new Date().toISOString();
}
