import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, "../prompts/plan.md"), "utf-8");

// create_plan 工具的 schema，强制 Claude 输出结构化计划
const createPlanTool = {
  name: "create_plan",
  description: "输出结构化的任务执行计划",
  input_schema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description: "用一句话描述用户的目标",
      },
      steps: {
        type: "array",
        description: "执行步骤列表",
        items: {
          type: "object",
          properties: {
            id: { type: "number", description: "步骤序号，从 1 开始" },
            title: { type: "string", description: "步骤标题（中文，简洁描述做什么）" },
            tool: {
              type: "string",
              enum: ["web_fetch", "calculator", "read_file", "get_current_time", "summarize", "none"],
              description: "该步骤使用的工具",
            },
            input: {
              type: "object",
              description: "工具的输入参数，tool 为 none 时可为空对象",
            },
            reason: { type: "string", description: "为什么需要这一步（中文）" },
          },
          required: ["id", "title", "tool", "input", "reason"],
        },
      },
    },
    required: ["goal", "steps"],
  },
};

/**
 * 调用 Claude 生成结构化执行计划
 * @param {string} userGoal - 用户输入的目标
 * @param {string|null} feedback - 用户拒绝后的修改意见
 * @returns {Promise<{goal: string, steps: Array}>}
 */
export async function createPlan(userGoal, feedback = null) {
  const client = new Anthropic();

  const userMessage = feedback
    ? `目标：${userGoal}\n\n用户对上一版计划的修改意见：${feedback}\n\n请根据修改意见重新制定计划。`
    : `目标：${userGoal}`;

  const response = await client.messages.create({
    model: "anthropic/claude-sonnet-4.6",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [createPlanTool],
    tool_choice: { type: "tool", name: "create_plan" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("Planner 未返回计划");

  return toolUse.input;
}
