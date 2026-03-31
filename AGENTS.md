# Codex Project Instructions

## Repo focus
- This repository is an AI agent lab with multiple experiments.
- The current active implementation focus is `experiments/02-memory-agent`.
- Prefer keeping changes scoped to the relevant experiment instead of refactoring unrelated areas.

## Memory-agent expectations
- Reuse the shared runtime modules in `experiments/02-memory-agent/lib/` instead of duplicating logic in entry files.
- Keep runtime memory layered:
  - `user memory` for stable user facts and preferences
  - `project memory` for durable repo or experiment facts
  - `session memory` for raw messages, rolling summary, and recent context
  - `procedural memory` in prompts, this file, and skills rather than runtime JSON facts
- Keep the implementation file-based and JSON-based unless a task explicitly asks for something heavier.
- Do not add embeddings, vector databases, routers, or other memory infrastructure unless explicitly requested.

## Runtime boundaries
- Preserve CLI behavior in `agent.mjs`, especially `/clear`, `/history`, and `/quit`, unless the task explicitly changes them.
- Preserve the WebSocket message protocol used by `server.mjs` and `index.html` where possible.
- Web sessions should remain isolated per connection; do not reintroduce shared browser transcript state.
- Only promote high-confidence, long-lived facts into user/project memory. Temporary debugging details should stay in session memory.

## Codex project config
- `.Codex/settings.json` must contain only safe, shared, non-secret project settings.
- Never copy `.Codex/settings.local.json` into committed project config.
- Put reusable repo workflow guidance in `.Codex/skills/` instead of burying it in ad hoc prompts.

## Working style
- Prefer minimal, direct changes over broad cleanup.
- Read existing files before modifying them.
- When changing `experiments/02-memory-agent`, verify behavior through the existing CLI or Web entrypoints if the task affects runtime behavior.
