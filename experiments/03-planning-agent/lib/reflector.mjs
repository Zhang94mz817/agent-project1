import "./runtime-env.mjs";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, "../prompts/reflect.md"), "utf-8");

/**
 * 对执行结果进行反思总结
 * @param {string} goal - 用户原始目标
 * @param {object} plan - 执行的计划
 * @param {Array} results - executor 返回的执行结果
 * @returns {Promise<string>} 反思报告文本
 */
export async function reflect(goal, plan, results) {
  const client = new Anthropic();
  const resultMap = new Map(results.map((result) => [result.stepId, result]));

  const stepsReport = plan.steps
    .map((step) => {
      const result = resultMap.get(step.id);
      return [
        `步骤 ${step.id}：${step.title}`,
        `工具：${step.tool}`,
        `状态：${result ? (result.ok ? "成功" : "失败") : "未执行"}`,
        `结果：${result ? result.result : "未执行"}`,
      ].join("\n");
    })
    .join("\n\n");

  const userMessage = `用户目标：${goal}\n\n执行结果：\n${stepsReport}`;

  const response = await client.messages.create({
    model: "anthropic/claude-sonnet-4.6",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  return response.content[0].text;
}
