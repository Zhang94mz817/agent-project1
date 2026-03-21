---
name: repo-context
description: Use this skill when you need quick context about this repository, its active experiment, or where a change should live.
---

## Purpose
Provide concise repository context before implementation work.

## What to cover
1. State that this repo is an AI agent lab with multiple experiments.
2. Identify `experiments/02-memory-agent` as the current active implementation area unless the user points elsewhere.
3. Summarize the key files for that experiment:
   - `agent.mjs` for the CLI entry
   - `server.mjs` for the Web entry
   - `index.html` for the UI
   - `lib/config.mjs`, `lib/tools.mjs`, `lib/run-agent.mjs`, and `lib/memory/*` for shared runtime logic
   - `prompts/system.md` for runtime procedural instructions
4. Clarify the boundary between:
   - Claude Code project guidance (`CLAUDE.md`, `.claude/settings.json`, `.claude/skills/`)
   - the demo's runtime memory (`experiments/02-memory-agent/data/...`)
5. Point the user to the smallest relevant file set for the task instead of listing the whole repo.

## Guardrails
- Keep the answer brief and action-oriented.
- Prefer file paths over long prose.
- Do not speculate about files you have not checked in the current task.
