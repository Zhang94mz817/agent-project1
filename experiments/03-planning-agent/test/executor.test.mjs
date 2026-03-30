import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executePlan } from "../lib/executor.mjs";

test("executePlan keeps empty tool output as success with a readable summary", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "planning-agent-executor-"));
  const filePath = join(tempDir, "empty.txt");
  const emitted = [];

  try {
    await writeFile(filePath, "", "utf-8");

    const results = await executePlan(
      {
        goal: "读取空文件",
        steps: [{ id: 1, title: "读取空文件", tool: "read_file", input: { path: filePath }, reason: "验证空输出" }],
      },
      (message) => emitted.push(message),
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].ok, true);
    assert.equal(results[0].output, "");
    assert.equal(results[0].result, "（工具执行完成，但未返回内容）");
    assert.deepEqual(
      emitted.map((message) => message.type),
      ["step_start", "step_done"],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
