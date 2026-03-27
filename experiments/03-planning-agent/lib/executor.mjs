import { toolImplementations } from "./tools.mjs";

/**
 * 按计划逐步执行工具
 * @param {object} plan - planner 返回的计划对象
 * @param {function} emit - WebSocket 发送函数
 * @returns {Promise<Array<{stepId: number, result: string}>>}
 */
export async function executePlan(plan, emit) {
  const results = [];

  for (const step of plan.steps) {
    emit({ type: "step_start", stepId: step.id, title: step.title, tool: step.tool });

    let result;
    if (step.tool === "none") {
      result = "（无需工具，步骤已记录）";
    } else {
      const fn = toolImplementations[step.tool];
      if (!fn) {
        result = `未知工具: ${step.tool}`;
      } else {
        try {
          result = String(await fn(step.input));
        } catch (e) {
          result = `执行出错: ${e.message}`;
        }
      }
    }

    results.push({ stepId: step.id, title: step.title, tool: step.tool, result });
    emit({ type: "step_done", stepId: step.id, result });
  }

  return results;
}
