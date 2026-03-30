import { SERVER_MESSAGE_TYPES } from "./protocol.mjs";
import { getToolDefinition } from "./tools.mjs";

/**
 * 按计划逐步执行工具
 * @param {object} plan - planner 返回的计划对象
 * @param {function} emit - WebSocket 发送函数
 * @returns {Promise<Array<{stepId: number, result: string}>>}
 */
export async function executePlan(plan, emit) {
  const results = [];

  for (const step of plan.steps) {
    emit({ type: SERVER_MESSAGE_TYPES.STEP_START, stepId: step.id, title: step.title, tool: step.tool });

    const outcome = await executeStep(step);
    results.push(outcome);

    emit({
      type: outcome.ok ? SERVER_MESSAGE_TYPES.STEP_DONE : SERVER_MESSAGE_TYPES.STEP_FAILED,
      stepId: step.id,
      result: outcome.result,
      output: outcome.output,
      error: outcome.error,
    });
  }

  return results;
}

async function executeStep(step) {
  const definition = getToolDefinition(step.tool);

  if (!definition) {
    return buildFailedResult(step, `未知工具: ${step.tool}`);
  }

  if (typeof definition.execute !== "function") {
    return buildSuccessResult(step, "（无需工具，步骤已记录）");
  }

  try {
    const output = String(await definition.execute(step.input ?? {}));
    return buildSuccessResult(step, output);
  } catch (error) {
    return buildFailedResult(step, error.message);
  }
}

function buildSuccessResult(step, output) {
  const text = typeof output === "string" ? output : String(output ?? "");

  return {
    stepId: step.id,
    title: step.title,
    tool: step.tool,
    ok: true,
    output: text,
    error: null,
    result: summarizeOutput(text),
  };
}

function buildFailedResult(step, error) {
  const reason = typeof error === "string" && error.trim() ? error.trim() : "未知错误";

  return {
    stepId: step.id,
    title: step.title,
    tool: step.tool,
    ok: false,
    output: null,
    error: reason,
    result: `失败: ${reason}`,
  };
}

function summarizeOutput(output) {
  return output.trim() ? output : "（工具执行完成，但未返回内容）";
}
