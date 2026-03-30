import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlan } from "../lib/planner.mjs";

test("normalizePlan rewrites unstable step ids into ordered integers", () => {
  const plan = normalizePlan(
    {
      goal: "读取文件并总结",
      steps: [
        { id: 0, title: "第一步", tool: "read_file", input: { path: "./a.txt" }, reason: "先读取" },
        { id: 7, title: "第二步", tool: "unknown_tool", input: null, reason: "" },
      ],
    },
    "fallback goal",
  );

  assert.equal(plan.goal, "读取文件并总结");
  assert.deepEqual(
    plan.steps.map((step) => ({ id: step.id, tool: step.tool, input: step.input, reason: step.reason })),
    [
      { id: 1, tool: "read_file", input: { path: "./a.txt" }, reason: "先读取" },
      { id: 2, tool: "none", input: {}, reason: "根据目标推进任务" },
    ],
  );
});
