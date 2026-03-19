/**
 * 实验 01: 最简 Agent
 *
 * 一个 Agent 的本质就是: 循环 + 工具调用
 *
 *   用户提问 → Claude 思考 → 需要工具？→ 是 → 调用工具 → 把结果喂回 Claude → 继续循环
 *                                      → 否 → 输出最终回答 → 结束
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { ProxyAgent, setGlobalDispatcher } from "undici";

// 加载 .env 文件
const envFile = readFileSync(new URL("./.env", import.meta.url), "utf-8");
for (const line of envFile.split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

// 配置代理 (让 Node.js fetch 走本地代理)
if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
}

// ============================================================
// 第一步: 定义工具 (Tools)
// 工具就是你允许 Agent 调用的函数。先定义两个最简单的。
// ============================================================

// 工具的实际实现
const toolImplementations = {
  // 工具1: 获取当前时间
  get_current_time: () => {
    return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  },

  // 工具2: 简单计算器
  calculator: ({ expression }) => {
    try {
      // 仅允许数字和基本运算符，防止代码注入
      if (!/^[\d\s+\-*/().]+$/.test(expression)) {
        return "错误: 只支持数字和 + - * / () 运算";
      }
      return String(new Function(`return ${expression}`)());
    } catch {
      return "计算错误";
    }
  },
};

// 工具的 schema 定义 (告诉 Claude 有哪些工具可以用)
const tools = [
  {
    name: "get_current_time",
    description: "获取当前的北京时间",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "calculator",
    description: "计算数学表达式，支持加减乘除和括号",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "要计算的数学表达式，例如: (1 + 2) * 3",
        },
      },
      required: ["expression"],
    },
  },
];

// ============================================================
// 第二步: Agent 循环 (这是 Agent 的核心)
// ============================================================

async function runAgent(userMessage) {
  const client = new Anthropic();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`用户: ${userMessage}`);
  console.log("=".repeat(60));

  // 对话历史
  const messages = [{ role: "user", content: userMessage }];

  // Agent 循环: 不断运行直到 Claude 给出最终回答
  let turn = 0;
  while (true) {
    turn++;
    console.log(`\n--- Agent 第 ${turn} 轮 ---`);

    // 调用 Claude
    const response = await client.messages.create({
      model: "anthropic/claude-sonnet-4.5",
      max_tokens: 1024,
      system: "你是一个有用的助手。可以使用工具来帮助回答问题。请用中文回答。",
      tools,
      messages,
    });

    console.log(`停止原因: ${response.stop_reason}`);

    // 如果 Claude 不需要调用工具，循环结束
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      console.log(`\nAgent 回答: ${textBlock?.text}`);
      return textBlock?.text;
    }

    // Claude 想要调用工具
    if (response.stop_reason === "tool_use") {
      // 把 Claude 的回复(包含 tool_use)加入对话历史
      messages.push({ role: "assistant", content: response.content });

      // 执行每个工具调用
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`调用工具: ${block.name}(${JSON.stringify(block.input)})`);

          // 执行工具
          const fn = toolImplementations[block.name];
          const result = fn ? fn(block.input) : "未知工具";

          console.log(`工具结果: ${result}`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: String(result),
          });
        }
      }

      // 把工具结果加入对话历史，继续循环
      messages.push({ role: "user", content: toolResults });
    }
  }
}

// ============================================================
// 第三步: 运行!
// ============================================================

// 测试用例: 从简单到复杂
const testCases = [
  // 1. 不需要工具的简单问题
  "你好，你是谁？",
  // 2. 需要一个工具
  "现在几点了？",
  // 3. 需要一个工具 + 推理
  "计算一下 (15 + 27) * 3 - 10 等于多少",
  // 4. 需要多个工具 + 组合推理
  "现在几点了？另外帮我算一下，如果我每天工作8小时，一周工作5天，一年52周，我一年总共工作多少小时？",
];

// 运行指定的测试，默认运行全部
const index = parseInt(process.argv[2]);
if (!isNaN(index) && index >= 0 && index < testCases.length) {
  await runAgent(testCases[index]);
} else {
  for (const testCase of testCases) {
    await runAgent(testCase);
  }
}
