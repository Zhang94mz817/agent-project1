import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSession } from "../lib/agent-session.mjs";
import { TaskHistoryStore } from "../lib/history-store.mjs";
import { CLIENT_MESSAGE_TYPES } from "../lib/protocol.mjs";

test("AgentSession persists completed tasks and pushes history updates", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "planning-agent-session-"));
  const historyPath = join(tempDir, "task-history.json");
  const historyStore = new TaskHistoryStore(historyPath);
  const messages = [];

  const session = new AgentSession((message) => messages.push(message), {
    createPlan: async (goal) => ({
      goal,
      steps: [{ id: 1, title: "检查", tool: "none", input: {}, reason: "验证流程" }],
    }),
    executePlan: async () => [{ stepId: 1, title: "检查", tool: "none", ok: true, output: "ok", error: null, result: "ok" }],
    reflect: async () => "反思完成",
    historyStore,
  });

  try {
    await session.start();
    await session.handleMessage({ type: CLIENT_MESSAGE_TYPES.CHAT, content: "测试任务" });
    await session.handleMessage({ type: CLIENT_MESSAGE_TYPES.PLAN_APPROVED });

    const savedHistory = JSON.parse(await readFile(historyPath, "utf-8"));
    assert.equal(savedHistory.length, 1);
    assert.equal(savedHistory[0].status, "completed");
    assert.equal(savedHistory[0].reflection, "反思完成");
    assert.deepEqual(
      messages.map((message) => message.type),
      ["ready", "history_loaded", "planning", "plan_ready", "executing", "reflecting", "history_updated", "reflect_ready"],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
