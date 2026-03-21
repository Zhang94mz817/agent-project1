import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import {
  DEFAULT_MODEL,
  DEFAULT_PORT,
  DEFAULT_PROJECT_ID,
  DEFAULT_USER_ID,
  HTML_FILE,
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

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    try {
      const html = readFileSync(HTML_FILE, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end("index.html not found");
    }
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
