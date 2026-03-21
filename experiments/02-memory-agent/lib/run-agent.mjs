import { AGENT_MAX_TURNS } from "./config.mjs";
import { toolImplementations, tools } from "./tools.mjs";

export async function runAgent({ client, memoryService, userMessage, systemPrompt, emit = () => {} }) {
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
      tools,
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

      messages.push({ role: "user", content: toolResults });
    }
  }
}
