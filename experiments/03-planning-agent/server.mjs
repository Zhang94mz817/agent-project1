import "./lib/runtime-env.mjs";
import { readFileSync } from "fs";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { WebSocketServer } from "ws";
import { AgentSession } from "./lib/agent-session.mjs";
import { TaskHistoryStore } from "./lib/history-store.mjs";
import { parseClientMessage, parseServerMessage } from "./lib/protocol.mjs";
import { createPlan } from "./lib/planner.mjs";
import { executePlan } from "./lib/executor.mjs";
import { reflect } from "./lib/reflector.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = 3001;
const STATIC_FILES = new Map([
  ["/", { path: join(__dirname, "index.html"), contentType: "text/html; charset=utf-8" }],
  ["/app.js", { path: join(__dirname, "app.js"), contentType: "text/javascript; charset=utf-8" }],
  ["/lib/protocol.mjs", { path: join(__dirname, "lib/protocol.mjs"), contentType: "text/javascript; charset=utf-8" }],
]);
const historyStore = new TaskHistoryStore(join(__dirname, "data", "task-history.json"));

const server = createServer((req, res) => {
  if (req.method === "GET" && STATIC_FILES.has(req.url)) {
    const file = STATIC_FILES.get(req.url);

    try {
      res.writeHead(200, { "Content-Type": file.contentType });
      res.end(readFileSync(file.path, "utf-8"));
    } catch {
      res.writeHead(500);
      res.end("Static file not found");
    }
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const send = (obj) => {
    if (ws.readyState !== ws.OPEN) {
      return;
    }

    try {
      ws.send(JSON.stringify(parseServerMessage(obj)));
    } catch (error) {
      console.error("发送消息失败:", error.message);
    }
  };
  const session = new AgentSession(send, { createPlan, executePlan, reflect, historyStore });

  void session.start();

  ws.on("message", async (raw) => {
    try {
      const message = parseClientMessage(JSON.parse(raw.toString()));
      await session.handleMessage(message);
    } catch (error) {
      send({ type: "error", message: error.message });
    }
  });

  ws.on("error", (e) => console.error("WS 错误:", e.message));
  ws.on("close", () => console.log("连接关闭"));
});

server.listen(PORT, () => {
  console.log("============================================");
  console.log("  实验 03: Plan → Execute → Reflect Agent");
  console.log("============================================");
  console.log(`🌐 http://localhost:${PORT}`);
  console.log("");
});
