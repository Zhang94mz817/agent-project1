import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import Anthropic from "@anthropic-ai/sdk";

// 工具实现
export const toolImplementations = {
  get_current_time: () => {
    return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  },

  calculator: ({ expression }) => {
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      return "错误: 只支持数字和 + - * / () 运算";
    }
    try {
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
      return content.length > 5000
        ? content.substring(0, 5000) + `\n\n... [已截断，总长度: ${content.length} 字符]`
        : content;
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
      const text = await response.text();
      const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return clean.length > 3000 ? clean.substring(0, 3000) + "... [已截断]" : clean;
    } catch (e) {
      return `请求失败: ${e.message}`;
    }
  },

  summarize: async ({ text }) => {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: `请用中文简洁总结以下内容（不超过150字）：\n\n${text.substring(0, 4000)}` }],
    });
    return response.content[0].text;
  },
};

// 工具 schema（供 Claude 使用）
export const toolSchemas = [
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
    description: "读取本地文件内容",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径（绝对路径或相对路径）" },
      },
      required: ["path"],
    },
  },
  {
    name: "web_fetch",
    description: "抓取网页内容并返回纯文本",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "要抓取的网页 URL" },
      },
      required: ["url"],
    },
  },
  {
    name: "summarize",
    description: "用 AI 对长文本进行摘要，返回简洁的中文摘要",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "需要摘要的文本内容" },
      },
      required: ["text"],
    },
  },
];
