import Anthropic from "@anthropic-ai/sdk";
import { createInterface } from "readline";
import {
  DEFAULT_CLI_SESSION_ID,
  DEFAULT_MODEL,
  DEFAULT_PROJECT_ID,
  DEFAULT_USER_ID,
  readSystemPrompt,
} from "./lib/config.mjs";
import { MemoryService } from "./lib/memory/service.mjs";
import { runAgent } from "./lib/run-agent.mjs";

async function main() {
  console.log("============================================");
  console.log("  实验 02: 带分层记忆的 Agent");
  console.log("============================================");
  console.log("命令:  /clear 清除当前 session  /history 查看历史  /quit 退出\n");

  const client = new Anthropic();
  const systemPrompt = readSystemPrompt();
  const memoryService = new MemoryService({
    userId: DEFAULT_USER_ID,
    projectId: DEFAULT_PROJECT_ID,
    sessionId: DEFAULT_CLI_SESSION_ID,
    model: DEFAULT_MODEL,
  });

  const status = memoryService.getStatus();
  console.log(`📂 Session: ${status.sessionId}，已加载 ${status.count} 条消息`);
  if (status.summary) {
    console.log(`📝 摘要: ${status.summary.substring(0, 120)}${status.summary.length > 120 ? "..." : ""}`);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question("\n你: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return ask();

      if (trimmed === "/quit" || trimmed === "/exit") {
        console.log("👋 再见！session 已保存。");
        rl.close();
        return;
      }

      if (trimmed === "/clear") {
        memoryService.clearSession();
        console.log("🧹 当前 session 已清除。user/project memory 保留。");
        return ask();
      }

      if (trimmed === "/history") {
        const history = memoryService.getHistory();
        console.log(`\n📜 当前 session 历史 (${history.length} 条):`);
        for (const msg of history.slice(-10)) {
          const role = msg.role === "user" ? "你" : "Agent";
          console.log(`  ${role}: ${String(msg.content).substring(0, 100)}`);
        }
        const current = memoryService.getStatus();
        if (current.summary) {
          console.log(`\n📝 滚动摘要:\n${current.summary}`);
        }
        return ask();
      }

      try {
        const answer = await runAgent({
          client,
          memoryService,
          userMessage: trimmed,
          systemPrompt,
          emit: (event) => {
            if (event.type === "tool_call") {
              console.log(`  🔧 ${event.name}(${JSON.stringify(event.input)})`);
            }
            if (event.type === "tool_result") {
              const preview = String(event.result);
              console.log(`  ✅ 结果: ${preview.substring(0, 100)}${preview.length > 100 ? "..." : ""}`);
            }
          },
        });
        console.log(`\nAgent: ${answer}`);
      } catch (error) {
        console.error(`\n❌ 错误: ${error.message}`);
      }

      ask();
    });
  };

  ask();
}

main();
