import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { WebSocketServer } from "ws";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { createPlan } from "./lib/planner.mjs";
import { executePlan } from "./lib/executor.mjs";
import { reflect } from "./lib/reflector.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载 .env
try {
  const envFile = readFileSync(join(__dirname, ".env"), "utf-8");
  for (const line of envFile.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
} catch {}

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
}

const PORT = 3001;
const HTML_FILE = join(__dirname, "index.html");

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    try {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(readFileSync(HTML_FILE, "utf-8"));
    } catch {
      res.writeHead(500);
      res.end("index.html not found");
    }
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let busy = false;
  let pendingPlan = null;  // 等待用户确认的计划
  let pendingGoal = null;  // 对应的用户目标

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  send({ type: "ready", message: "请输入你的任务目标，我会为你制定执行计划。" });

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // 用户发送新任务目标
    if (msg.type === "chat") {
      if (busy) {
        send({ type: "error", message: "正在处理中，请稍候。" });
        return;
      }
      busy = true;
      pendingPlan = null;
      pendingGoal = msg.content;

      send({ type: "planning", message: "正在制定执行计划…" });

      createPlan(pendingGoal)
        .then((plan) => {
          pendingPlan = plan;
          send({ type: "plan_ready", plan });
        })
        .catch((e) => {
          send({ type: "error", message: `规划失败: ${e.message}` });
        })
        .finally(() => {
          busy = false;
        });
    }

    // 用户确认计划，开始执行
    if (msg.type === "plan_approved") {
      if (busy || !pendingPlan) return;
      busy = true;

      send({ type: "executing", message: "开始执行计划…" });

      executePlan(pendingPlan, send)
        .then((results) => {
          send({ type: "reflecting", message: "正在生成反思报告…" });
          return reflect(pendingGoal, pendingPlan, results);
        })
        .then((reflection) => {
          send({ type: "reflect_ready", reflection });
          pendingPlan = null;
        })
        .catch((e) => {
          send({ type: "error", message: `执行失败: ${e.message}` });
        })
        .finally(() => {
          busy = false;
        });
    }

    // 用户拒绝计划，重新规划
    if (msg.type === "plan_rejected") {
      if (busy || !pendingGoal) return;
      busy = true;
      const feedback = msg.feedback || "";

      send({ type: "planning", message: "根据你的意见重新制定计划…" });

      createPlan(pendingGoal, feedback)
        .then((plan) => {
          pendingPlan = plan;
          send({ type: "plan_ready", plan });
        })
        .catch((e) => {
          send({ type: "error", message: `重新规划失败: ${e.message}` });
        })
        .finally(() => {
          busy = false;
        });
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
