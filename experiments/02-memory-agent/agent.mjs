/**
 * 实验 02: 带记忆的 Agent
 *
 * 在实验 01 的基础上增加:
 * 1. Memory — 对话历史持久化，关掉程序再打开还记得之前聊过什么
 * 2. 交互式 REPL — 持续对话，不再是一次性运行
 * 3. 新工具 — 读文件、抓网页
 *
 * 架构:
 *   ┌──────────┐     ┌───────────┐     ┌───────────┐
 *   │ 用户输入  │────▶│ Agent 循环 │────▶│  工具执行  │
 *   └──────────┘     └─────┬─────┘     └───────────┘
 *                          │
 *                    ┌─────▼─────┐
 *                    │  Memory   │  ← 对话历史 JSON 文件
 *                    │ (持久化)   │
 *                    └───────────┘
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createInterface } from "readline";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// 环境配置
// ============================================================
const envFile = readFileSync(resolve(__dirname, ".env"), "utf-8");
for (const line of envFile.split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
}

// ============================================================
// Memory 系统
// ============================================================

const MEMORY_FILE = resolve(__dirname, "memory.json");

class Memory {
  constructor(filePath) {
    this.filePath = filePath;
    this.messages = [];
    this.summary = ""; // 当对话过长时的摘要
    this.load();
  }

  // 从文件加载历史记忆
  load() {
    if (existsSync(this.filePath)) {
      try {
        const data = JSON.parse(readFileSync(this.filePath, "utf-8"));
        this.messages = data.messages || [];
        this.summary = data.summary || "";
        console.log(`📂 已加载记忆 (${this.messages.length} 条历史消息)`);
      } catch {
        console.log("📂 记忆文件损坏，从头开始");
      }
    } else {
      console.log("📂 无历史记忆，全新开始");
    }
  }

  // 持久化到文件
  save() {
    writeFileSync(
      this.filePath,
      JSON.stringify({ messages: this.messages, summary: this.summary }, null, 2)
    );
  }

  // 添加消息
  add(message) {
    this.messages.push(message);
    this.save();
  }

  // 获取要发送给 Claude 的消息列表
  // 如果历史太长，用摘要 + 最近的消息
  getMessages() {
    const MAX_MESSAGES = 20; // 保留最近 20 条
    if (this.messages.length <= MAX_MESSAGES) {
      return [...this.messages];
    }
    // 超出限制时，前面的变成摘要，保留最近的
    const recent = this.messages.slice(-MAX_MESSAGES);
    if (this.summary) {
      return [
        { role: "user", content: `[以下是之前对话的摘要: ${this.summary}]` },
        { role: "assistant", content: "好的，我记住了之前的对话内容。" },
        ...recent,
      ];
    }
    return recent;
  }

  // 清除记忆
  clear() {
    this.messages = [];
    this.summary = "";
    this.save();
    console.log("🧹 记忆已清除");
  }
}

// ============================================================
// 工具定义
// ============================================================

const toolImplementations = {
  get_current_time: () => {
    return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  },

  calculator: ({ expression }) => {
    try {
      if (!/^[\d\s+\-*/().]+$/.test(expression)) {
        return "错误: 只支持数字和 + - * / () 运算";
      }
      return String(new Function(`return ${expression}`)());
    } catch {
      return "计算错误";
    }
  },

  // 新工具: 读取本地文件
  read_file: ({ path }) => {
    try {
      const absPath = resolve(path);
      if (!existsSync(absPath)) return `文件不存在: ${absPath}`;
      const content = readFileSync(absPath, "utf-8");
      // 限制返回长度，避免 token 爆炸
      if (content.length > 5000) {
        return content.substring(0, 5000) + `\n\n... [文件过长，已截断。总长度: ${content.length} 字符]`;
      }
      return content;
    } catch (e) {
      return `读取失败: ${e.message}`;
    }
  },

  // 新工具: 抓取网页内容
  web_fetch: async ({ url }) => {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return `HTTP 错误: ${response.status}`;
      const html = await response.text();
      // 简单提取文本: 去掉 HTML 标签和多余空白
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 5000) {
        return text.substring(0, 5000) + `\n\n... [内容过长，已截断]`;
      }
      return text;
    } catch (e) {
      return `抓取失败: ${e.message}`;
    }
  },
};

const tools = [
  {
    name: "get_current_time",
    description: "获取当前的北京时间",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "calculator",
    description: "计算数学表达式，支持加减乘除和括号",
    input_schema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "数学表达式，例如: (1 + 2) * 3" },
      },
      required: ["expression"],
    },
  },
  {
    name: "read_file",
    description: "读取本地文件内容。可以读取代码、配置文件、文本文件等。",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径，支持绝对路径和相对路径" },
      },
      required: ["path"],
    },
  },
  {
    name: "web_fetch",
    description: "抓取指定 URL 的网页内容，返回纯文本。适合获取文章、文档、API 响应等。",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "要抓取的网页 URL" },
      },
      required: ["url"],
    },
  },
];

// ============================================================
// Agent 循环
// ============================================================

async function runAgent(client, memory, userMessage) {
  // 把用户消息加入记忆
  memory.add({ role: "user", content: userMessage });

  // 从记忆获取完整对话历史
  const messages = memory.getMessages();

  let turn = 0;
  while (true) {
    turn++;
    if (turn > 10) {
      console.log("⚠️  超过 10 轮循环，强制停止");
      break;
    }

    const response = await client.messages.create({
      model: "anthropic/claude-sonnet-4.5",
      max_tokens: 2048,
      system: `你是一个有用的 AI 助手。你可以使用工具来帮助回答问题。
请用中文回答。当用户提到之前聊过的内容时，请参考对话历史来回答。`,
      tools,
      messages,
    });

    // 不需要工具，输出回答
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      const answer = textBlock?.text || "(无回答)";
      // 把 AI 回答也存入记忆
      memory.add({ role: "assistant", content: answer });
      return answer;
    }

    // 需要工具
    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`  🔧 ${block.name}(${JSON.stringify(block.input)})`);
          const fn = toolImplementations[block.name];
          const result = fn ? await fn(block.input) : "未知工具";
          console.log(`  ✅ 结果: ${String(result).substring(0, 100)}${String(result).length > 100 ? "..." : ""}`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: String(result),
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }
  }
}

// ============================================================
// 交互式 REPL
// ============================================================

async function main() {
  console.log("============================================");
  console.log("  实验 02: 带记忆的 Agent");
  console.log("============================================");
  console.log("命令:  /clear 清除记忆  /history 查看历史  /quit 退出\n");

  const client = new Anthropic();
  const memory = new Memory(MEMORY_FILE);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question("\n你: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return ask();

      // 内置命令
      if (trimmed === "/quit" || trimmed === "/exit") {
        console.log("👋 再见！记忆已保存。");
        rl.close();
        return;
      }
      if (trimmed === "/clear") {
        memory.clear();
        return ask();
      }
      if (trimmed === "/history") {
        console.log(`\n📜 历史记录 (${memory.messages.length} 条):`);
        for (const msg of memory.messages.slice(-10)) {
          const role = msg.role === "user" ? "你" : "AI";
          const text = typeof msg.content === "string"
            ? msg.content.substring(0, 80)
            : "[工具调用]";
          console.log(`  ${role}: ${text}`);
        }
        return ask();
      }

      try {
        const answer = await runAgent(client, memory, trimmed);
        console.log(`\nAgent: ${answer}`);
      } catch (e) {
        console.error(`\n❌ 错误: ${e.message}`);
      }
      ask();
    });
  };

  ask();
}

main();
