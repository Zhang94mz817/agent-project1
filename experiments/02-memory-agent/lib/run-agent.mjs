import { AGENT_MAX_TURNS } from "./config.mjs";
import { toolImplementations, tools } from "./tools.mjs";

const nowIso = () => new Date().toISOString();

function buildMemoryTools(memoryService) {
  return {
    memory_upsert: ({ layer, key, value, confidence = "high" }) => {
      if (layer === "user") {
        if (key.startsWith("profile.")) {
          const field = key.slice("profile.".length);
          if (field in memoryService.userMemory.profile) {
            memoryService.userMemory.profile[field] = value;
            memoryService.userMemory.updatedAt = nowIso();
          } else {
            memoryService._upsertFact(memoryService.userMemory.facts, { key, value, confidence, source: "agent-tool" });
          }
        } else {
          memoryService._upsertFact(memoryService.userMemory.facts, { key, value, confidence, source: "agent-tool" });
        }
        memoryService.saveUserMemory();
        return `✓ user memory 已更新: ${key} = ${value}`;
      }
      if (layer === "project") {
        memoryService._upsertFact(memoryService.projectMemory.facts, { key, value, confidence, source: "agent-tool" });
        memoryService.saveProjectMemory();
        return `✓ project memory 已更新: ${key} = ${value}`;
      }
      return "未知 layer";
    },

    memory_query: ({ layer = "all" } = {}) => {
      const lines = [];
      if (layer === "user" || layer === "all") {
        lines.push("[User Profile]");
        const profile = memoryService.userMemory.profile;
        const profileLines = Object.entries(profile).filter(([, v]) => v !== null && v !== "");
        if (profileLines.length) profileLines.forEach(([k, v]) => lines.push(`  ${k}: ${v}`));
        else lines.push("  (empty)");

        lines.push("[User Facts]");
        if (memoryService.userMemory.facts.length) {
          memoryService.userMemory.facts.forEach((f) =>
            lines.push(`  ${f.key}: ${f.value}  [${f.confidence || "?"}/${f.source || "?"}]`)
          );
        } else {
          lines.push("  (empty)");
        }
      }
      if (layer === "project" || layer === "all") {
        lines.push("[Project Facts]");
        if (memoryService.projectMemory.facts.length) {
          memoryService.projectMemory.facts.forEach((f) =>
            lines.push(`  ${f.key}: ${f.value}  [${f.confidence || "?"}/${f.source || "?"}]`)
          );
        } else {
          lines.push("  (empty)");
        }
      }
      return lines.join("\n");
    },
    session_summarize: () => {
      const { summarized, summary } = memoryService.forceSummarizeSession();
      if (summarized === 0) return "当前没有可压缩的消息。";
      return `✓ 已压缩 ${summarized} 条消息。当前摘要：\n${summary}`;
    },
  };
}

export async function runAgent({ client, memoryService, userMessage, systemPrompt, enabledTools, emit = () => {} }) {
  const memoryTools = buildMemoryTools(memoryService);
  const activeTools = tools.filter((t) => !enabledTools || enabledTools.has(t.name));

  await memoryService.addMessage("user", userMessage);
  const messages = memoryService.getContextMessages();

  emit({ type: "thinking" });

  let turn = 0;
  while (true) {
    turn += 1;
    if (turn > AGENT_MAX_TURNS) {
      throw new Error(`超过 ${AGENT_MAX_TURNS} 轮循环，强制停止`);
    }

    const response = await client.messages.create({
      model: memoryService.model,
      max_tokens: 2048,
      system: memoryService.buildSystemPrompt(systemPrompt),
      tools: activeTools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const answer = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n") || "(无回答)";

      await memoryService.addMessage("assistant", answer);
      emit({ type: "answer", content: answer });
      emit({ type: "memory_status", ...memoryService.getStatus() });
      return answer;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        emit({ type: "tool_call", name: block.name, input: block.input });
        const fn = memoryTools[block.name] ?? toolImplementations[block.name];
        const result = fn ? await fn(block.input) : "未知工具";
        const resultStr = String(result);
        emit({ type: "tool_result", name: block.name, result: resultStr });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultStr,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }
}
