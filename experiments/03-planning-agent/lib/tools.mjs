import "./runtime-env.mjs";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import Anthropic from "@anthropic-ai/sdk";

const EMPTY_INPUT_SCHEMA = { type: "object", properties: {}, required: [] };

const toolRegistry = [
  {
    name: "get_current_time",
    description: "获取当前的北京时间",
    inputSchema: EMPTY_INPUT_SCHEMA,
    execute: () => new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
  },
  {
    name: "calculator",
    description: "计算数学表达式，支持加减乘除和括号",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "数学表达式，例如: (1 + 2) * 3" },
      },
      required: ["expression"],
    },
    execute: ({ expression }) => {
      if (!/^[\d\s+\-*/().]+$/.test(expression)) {
        throw new Error("只支持数字和 + - * / () 运算");
      }

      try {
        return String(new Function(`return ${expression}`)());
      } catch {
        throw new Error("计算错误");
      }
    },
  },
  {
    name: "read_file",
    description: "读取本地文件内容",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径（绝对路径或相对路径）" },
      },
      required: ["path"],
    },
    execute: ({ path }) => {
      const absPath = resolve(path);
      if (!existsSync(absPath)) {
        throw new Error(`文件不存在: ${absPath}`);
      }

      try {
        const content = readFileSync(absPath, "utf-8");
        return content.length > 5000
          ? content.substring(0, 5000) + `\n\n... [已截断，总长度: ${content.length} 字符]`
          : content;
      } catch (error) {
        throw new Error(`读取失败: ${error.message}`);
      }
    },
  },
  {
    name: "web_fetch",
    description: "抓取网页内容并返回纯文本",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "要抓取的网页 URL" },
      },
      required: ["url"],
    },
    execute: async ({ url }) => {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)" },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(`HTTP 错误: ${response.status}`);
        }
        const text = await response.text();
        const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return clean.length > 3000 ? clean.substring(0, 3000) + "... [已截断]" : clean;
      } catch (error) {
        throw new Error(`请求失败: ${error.message}`);
      }
    },
  },
  {
    name: "summarize",
    description: "用 AI 对长文本进行摘要，返回简洁的中文摘要",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "需要摘要的文本内容" },
      },
      required: ["text"],
    },
    execute: async ({ text }) => {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: `请用中文简洁总结以下内容（不超过150字）：\n\n${text.substring(0, 4000)}` }],
      });
      return response.content[0].text;
    },
  },
  {
    name: "none",
    description: "该步骤无需调用工具（如分析、总结类步骤）",
    inputSchema: EMPTY_INPUT_SCHEMA,
    execute: null,
  },
];

export const toolDefinitions = toolRegistry.map(({ name, description, inputSchema }) => ({
  name,
  description,
  input_schema: inputSchema,
}));

export const planToolNames = toolRegistry.map(({ name }) => name);

const toolDefinitionMap = new Map(toolRegistry.map((tool) => [tool.name, tool]));

export function getToolDefinition(name) {
  return toolDefinitionMap.get(name) ?? null;
}

export function renderPlannerToolGuide() {
  return [
    "可用工具：",
    ...toolRegistry.map((tool) => `- \`${tool.name}\`: ${tool.description}，${describeToolInput(tool.inputSchema)}`),
  ].join("\n");
}

function describeToolInput(inputSchema) {
  const properties = inputSchema.properties ?? {};
  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return "无需参数";
  }

  return `需要 ${entries.map(([name, config]) => `${name} 参数（${config.description ?? "无描述"}）`).join("；")}`;
}
