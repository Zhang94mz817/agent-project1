/**
 * 实验 02: 带记忆的 Agent — Web UI 服务器
 *
 * 提供 HTTP + WebSocket 服务，复用已有的 Memory、工具和 Agent 循环逻辑。
 *
 * 启动: node server.mjs
 * 访问: http://localhost:3000
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createServer } from "http";
import { WebSocketServer } from "ws";
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

const PORT = process.env.PORT || 3000;

// ============================================================
// Memory 系统 (复用自 agent.mjs)
// ============================================================

const MEMORY_FILE = resolve(__dirname, "memory.json");

class Memory {
  constructor(filePath) {
    this.filePath = filePath;
    this.messages = [];
    this.summary = "";
    this.load();
  }

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

  save() {
    writeFileSync(
      this.filePath,
      JSON.stringify({ messages: this.messages, summary: this.summary }, null, 2)
    );
  }

  add(message) {
    this.messages.push(message);
    this.save();
  }

  getMessages() {
    const MAX_MESSAGES = 20;
    if (this.messages.length <= MAX_MESSAGES) {
      return [...this.messages];
    }
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

  clear() {
    this.messages = [];
    this.summary = "";
    this.save();
    console.log("🧹 记忆已清除");
  }

  getStatus() {
    return {
      count: this.messages.length,
      summary: this.summary || "(无摘要)",
    };
  }
}

// ============================================================
// 工具定义 (复用自 agent.mjs)
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

  read_file: ({ path }) => {
    try {
      const absPath = resolve(path);
      if (!existsSync(absPath)) return `文件不存在: ${absPath}`;
      const content = readFileSync(absPath, "utf-8");
      if (content.length > 5000) {
        return content.substring(0, 5000) + `\n\n... [文件过长，已截断。总长度: ${content.length} 字符]`;
      }
      return content;
    } catch (e) {
      return `读取失败: ${e.message}`;
    }
  },

  web_fetch: async ({ url }) => {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return `HTTP 错误: ${response.status}`;
      const html = await response.text();
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
// Agent 循环 (改造: 通过回调推送事件)
// ============================================================

/**
 * @param {Anthropic} client
 * @param {Memory} memory
 * @param {string} userMessage
 * @param {(event: object) => void} emit - 向客户端推送事件
 */
async function runAgent(client, memory, userMessage, emit) {
  memory.add({ role: "user", content: userMessage });
  const messages = memory.getMessages();

  emit({ type: "thinking" });

  let turn = 0;
  while (true) {
    turn++;
    if (turn > 10) {
      emit({ type: "error", message: "超过 10 轮循环，强制停止" });
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

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      const answer = textBlock?.text || "(无回答)";
      memory.add({ role: "assistant", content: answer });
      emit({ type: "answer", content: answer });
      emit({ type: "memory_status", ...memory.getStatus() });
      return answer;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          emit({ type: "tool_call", name: block.name, input: block.input });

          const fn = toolImplementations[block.name];
          const result = fn ? await fn(block.input) : "未知工具";
          const resultStr = String(result);

          emit({ type: "tool_result", name: block.name, result: resultStr });

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultStr,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }
  }
}

// ============================================================
// HTTP + WebSocket 服务器
// ============================================================

const client = new Anthropic();
const memory = new Memory(MEMORY_FILE);

const htmlPath = resolve(__dirname, "index.html");

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    try {
      const html = readFileSync(htmlPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end("index.html not found");
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/memory") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(memory.getStatus()));
    return;
  }

  if (req.method === "GET" && req.url === "/api/history") {
    const history = memory.messages.map((msg) => ({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : "[工具调用]",
    }));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(history));
    return;
  }

  if (req.method === "GET" && req.url === "/api/tools") {
    const toolList = tools.map((t) => ({ name: t.name, description: t.description }));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(toolList));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// WebSocket 服务器
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket 客户端已连接");

  let busy = false;

  const send = (obj) => {
    try {
      if (ws.readyState === 1) { // OPEN
        ws.send(JSON.stringify(obj));
      }
    } catch (e) {
      console.error("发送消息失败:", e.message);
    }
  };

  // Send initial state
  send({ type: "memory_status", ...memory.getStatus() });
  send({ type: "tools_list", tools: tools.map((t) => ({ name: t.name, description: t.description })) });

  // Send existing chat history
  const history = memory.messages.map((msg) => ({
    role: msg.role,
    content: typeof msg.content === "string" ? msg.content : "[工具调用]",
  }));
  send({ type: "history", messages: history });

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === "chat") {
      if (busy) {
        send({ type: "error", message: "Agent 正在处理中，请稍候..." });
        return;
      }
      busy = true;
      const userContent = String(msg.content || "").trim();
      if (!userContent) {
        busy = false;
        return;
      }

      console.log(`💬 用户: ${userContent}`);
      send({ type: "user_echo", content: userContent });

      runAgent(client, memory, userContent, send)
        .catch((e) => {
          console.error(`❌ Agent 错误: ${e.message}`);
          send({ type: "error", message: e.message });
        })
        .finally(() => {
          busy = false;
        });
    }

    if (msg.type === "clear_memory") {
      memory.clear();
      send({ type: "memory_status", ...memory.getStatus() });
      send({ type: "memory_cleared" });
      console.log("🧹 客户端请求清除记忆");
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket 连接关闭");
  });

  ws.on("error", (err) => {
    console.error("WebSocket 错误:", err.message);
  });
});

server.listen(PORT, () => {
  console.log("============================================");
  console.log("  实验 02: 带记忆的 Agent — Web UI");
  console.log("============================================");
  console.log(`🌐 http://localhost:${PORT}`);
  console.log("");
});
