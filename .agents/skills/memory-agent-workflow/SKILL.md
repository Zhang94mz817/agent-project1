---
name: memory-agent-workflow
description: Use this skill when working on experiments/02-memory-agent to keep changes aligned with the layered-memory architecture and existing runtime flow.
---

## Purpose
Guide implementation work for `experiments/02-memory-agent`.

## Workflow
1. Start from the smallest relevant entry file or shared module.
2. Prefer reusing the shared modules under `lib/` instead of duplicating logic.
3. Keep the layered-memory model intact:
   - user memory = stable user facts/preferences
   - project memory = durable experiment facts
   - session memory = raw transcript + rolling summary + recent context
   - procedural memory = prompts / project instructions / skills
4. When changing runtime behavior, preserve existing surfaces unless the task explicitly changes them:
   - CLI commands in `agent.mjs`
   - WebSocket event protocol in `server.mjs`
   - UI event handling in `index.html`
5. For memory promotion, keep long-term memory conservative: only promote high-confidence, long-lived information.
6. For Web work, keep sessions isolated per connection.
7. Verify behavior through the existing CLI or Web entrypoint when the change affects runtime execution.

## Guardrails
- Keep the solution JSON/file-based unless the user explicitly asks for a heavier architecture.
- Do not add embeddings, vector stores, or database infrastructure by default.
- Do not copy local Codex settings into shared checked-in project config.
- Avoid unrelated refactors and keep changes focused.
