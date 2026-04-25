# TODO

Reference: https://github.com/yeachan-heo/oh-my-claudecode — mirror useful features from here.

---

## Orchestration modes

- [ ] **Ralph mode** — persistent execution with verify/fix loops. Agent keeps retrying until task is verifiably complete. No silent partials.
- [ ] **Ultrawork mode** — burst parallel execution. Max concurrency, no staged pipeline.
- [ ] **Autopilot mode** — single lead agent drives end-to-end feature work autonomously.
- [ ] **Pipeline mode** — sequential staged processing with strict ordering. Steps: plan → prd → exec → verify → fix (loop).
- [ ] **ralplan** — iterative planning consensus before execution.

## Agent intelligence

- [ ] **Smart model routing** — auto-select haiku for simple tasks, sonnet/opus for complex reasoning. Reduce token cost 30-50%.
- [ ] **Deep interview** — Socratic requirements clarification before spawning agents. Ask clarifying questions, surface assumptions, measure clarity.
- [ ] **Skill learner** — extract reusable patterns from sessions into portable skill files. Auto-inject matching skills by trigger keywords.
- [ ] **Magic keywords** — natural language triggers in-session (`ralph`, `ulw`, `autopilot`, `ultrathink`, `deepsearch`) without slash commands.

## Observability

- [ ] **HUD statusline** — real-time orchestration metrics in status bar. Show active agents, token usage, model, turn count.
- [ ] **Session summaries** — write `.pi/sessions/*.json` after each session.
- [ ] **Replay logs** — write `.pi/state/agent-replay-*.jsonl` for post-session inspection.
- [ ] **Analytics & cost tracking** — aggregate token usage across all sessions. Per-agent and per-session breakdowns.

## Notifications

- [ ] **Telegram notifications** — send session summaries and stop callbacks to Telegram bot.
- [ ] **Discord notifications** — webhook-based stop callbacks with tag support (`@here`, role mentions).
- [ ] **Slack notifications** — webhook-based with `<!here>`, `<!channel>`, member mentions.

## Multi-provider orchestration

- [ ] **Provider advisor (`/ask`)** — route prompts to external CLIs (codex, gemini) and save markdown artifacts under `.pi/artifacts/ask/`.
- [ ] **CCG (cross-provider synthesis)** — send to codex + gemini in parallel, Claude synthesizes the result.
- [ ] **omc team equivalent** — spawn tmux CLI workers (claude/codex/gemini panes) for cross-model orchestration.

## Rate limits & reliability

- [ ] **Rate limit wait** — detect rate limit hits, auto-resume when quota resets. Daemon mode with tmux session detection.
- [ ] **Retry/backoff** — exponential backoff for transient API errors in agent runner.

## Skill system enhancements

- [ ] **Project-scoped skills** — `.pi/skills/` with `name`, `description`, `triggers` frontmatter. Auto-inject on keyword match.
- [ ] **User-scoped skills** — `~/.pi/skills/` as fallback. Project skills take priority.
- [ ] **Skill management commands** — `/skill list`, `/skill add`, `/skill remove`, `/skill edit`, `/skill search`.
- [ ] **Auto-learner** — `/learner` command extracts patterns with quality gates after session ends.

## Developer experience

- [ ] **`cancelomc` / `stopomc` keywords** — stop all active orchestration modes via natural language.
- [ ] **`/doctor` command** — diagnose config issues, stale caches, broken tool wiring.
- [ ] **`/review` slash command** — launch a review agent against current diff or file.
- [ ] **19 specialized agent templates** — pre-built agent types: architect, researcher, designer, tester, data-scientist, security, etc. with tier variants.
