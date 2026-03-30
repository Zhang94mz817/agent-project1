import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export const toolImplementations = {
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
        return text.substring(0, 5000) + "\n\n... [内容过长，已截断]";
      }
      return text;
    } catch (e) {
      return `抓取失败: ${e.message}`;
    }
  },
};

export const tools = [
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
  {
    name: "memory_upsert",
    description: "将重要事实写入长期记忆（user 或 project 层）。用于主动记住用户偏好、姓名、项目背景等值得跨会话保留的信息。",
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          enum: ["user", "project"],
          description: "写入哪一层：user（用户相关）或 project（项目相关）",
        },
        key: { type: "string", description: "事实的键，例如 profile.name、preference.language、project.stack" },
        value: { type: "string", description: "事实的值" },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "置信度，默认 high",
        },
      },
      required: ["layer", "key", "value"],
    },
  },
  {
    name: "memory_query",
    description: "查询当前的长期记忆内容，包括 user profile、user facts 和 project facts。",
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          enum: ["user", "project", "all"],
          description: "查询哪一层，默认 all",
        },
      },
      required: [],
    },
  },
];

export function listTools() {
  return tools.map((tool) => ({ name: tool.name, description: tool.description }));
}
