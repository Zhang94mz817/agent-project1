import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "fs";
import { createServer } from "http";
import { extname, join, resolve } from "path";
import { WebSocketServer } from "ws";
import {
  CLIENT_DIST_DIR,
  DEFAULT_MODEL,
  DEFAULT_PORT,
  DEFAULT_PROJECT_ID,
  DEFAULT_USER_ID,
  readSystemPrompt,
} from "./lib/config.mjs";
import { MemoryService } from "./lib/memory/service.mjs";
import { runAgent } from "./lib/run-agent.mjs";
import { listTools } from "./lib/tools.mjs";

const client = new Anthropic();
const systemPrompt = readSystemPrompt();
const toolList = listTools();
const PORT = DEFAULT_PORT;

function createSessionId() {
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createMemoryService(sessionId) {
  return new MemoryService({
    userId: DEFAULT_USER_ID,
    projectId: DEFAULT_PROJECT_ID,
    sessionId,
    model: DEFAULT_MODEL,
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  if (req.method === "GET" && !req.url.startsWith("/api")) {
    const urlPath = req.url === "/" ? "/index.html" : (req.url || "/").split("?")[0];
    const abs = resolve(join(CLIENT_DIST_DIR, urlPath));
    if (!abs.startsWith(CLIENT_DIST_DIR)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const filePath = existsSync(abs) ? abs : join(CLIENT_DIST_DIR, "index.html");
    const mime = MIME[extname(filePath)] || "text/html; charset=utf-8";
    res.writeHead(200, { "Content-Type": mime });
    res.end(readFileSync(filePath));
    return;
  }

  if (req.method === "GET" && req.url === "/api/tools") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(toolList));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const sessionId = createSessionId();
  const memoryService = createMemoryService(sessionId);
  let busy = false;
  const enabledTools = new Set([
    "get_current_time", "calculator", "read_file", "web_fetch",
    "memory_upsert", "memory_query",
  ]);

  const send = (obj) => {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
      }
    } catch (error) {
      console.error("发送消息失败:", error.message);
    }
  };

  console.log(`🔌 WebSocket 客户端已连接 (${sessionId})`);

  send({ type: "session_ready", sessionId });
  send({ type: "memory_status", ...memoryService.getStatus() });
  send({ type: "tools_list", tools: toolList });
  send({ type: "history", messages: memoryService.getHistory() });

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

      const userContent = String(msg.content || "").trim();
      if (!userContent) return;

      busy = true;
      console.log(`💬 [${sessionId}] 用户: ${userContent}`);
      send({ type: "user_echo", content: userContent });

      runAgent({
        client,
        memoryService,
        userMessage: userContent,
        systemPrompt,
        enabledTools,
        emit: send,
      })
        .catch((error) => {
          console.error(`❌ [${sessionId}] Agent 错误: ${error.message}`);
          send({ type: "error", message: error.message });
        })
        .finally(() => {
          busy = false;
        });
    }

    if (msg.type === "set_tool_enabled") {
      const name = String(msg.name || "");
      if (msg.enabled) {
        enabledTools.add(name);
        console.log(`🔧 [${sessionId}] 启用工具: ${name}`);
      } else {
        enabledTools.delete(name);
        console.log(`🔧 [${sessionId}] 禁用工具: ${name}`);
      }
    }

    if (msg.type === "force_summarize") {
      if (busy) {
        send({ type: "error", message: "Agent 正在处理中，请稍候..." });
        return;
      }
      const result = memoryService.forceSummarizeSession();
      send({ type: "force_summarize_result", summarized: result.summarized, summary: result.summary });
      send({ type: "memory_status", ...memoryService.getStatus() });
      console.log(`📝 [${sessionId}] 强制压缩: ${result.summarized} 条消息`);
    }

    if (msg.type === "clear_memory") {
      memoryService.clearSession();
      send({ type: "memory_status", ...memoryService.getStatus() });
      send({ type: "memory_cleared" });
      console.log(`🧹 已清除 session: ${sessionId}`);
    }
  });

  ws.on("close", () => {
    console.log(`🔌 WebSocket 连接关闭 (${sessionId})`);
  });

  ws.on("error", (error) => {
    console.error(`WebSocket 错误 (${sessionId}):`, error.message);
  });
});

server.listen(PORT, () => {
  console.log("============================================");
  console.log("  实验 02: 带分层记忆的 Agent — Web UI");
  console.log("============================================");
  console.log(`🌐 http://localhost:${PORT}`);
  console.log("");
});
