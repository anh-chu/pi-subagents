# @anh-chu/pi-subagents — DEPRECATED

> **Use [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) instead.**

This fork is no longer maintained. Upstream has outpaced us — token tracking, persistent settings, scheduled subagents, proper context isolation, and active maintenance from a broader contributor base. We can't keep up.

## What we've done

Our unique features have been submitted [upstream as PRs](https://github.com/tintinweb/pi-subagents/pulls?q=is%3Apr+author%3Aanh-chu):

- **Chain mode** — sequential agent execution with `{previous}` placeholder ([#53](https://github.com/tintinweb/pi-subagents/pull/53))
- **Dynamic routing guidelines** — Agent tool description auto-generated from agent configs ([#52](https://github.com/tintinweb/pi-subagents/pull/52))
- **Card grid widget** — card-grid layout for `/agents` with `/agents-view` toggle ([#54](https://github.com/tintinweb/pi-subagents/pull/54))

Once these land upstream (or are rejected with finality), there is zero reason to use this fork.

## Migrating

```bash
# In your pi settings.json, replace:
#   "@anh-chu/pi-subagents"  →  "@tintinweb/pi-subagents"
npm uninstall -g @anh-chu/pi-subagents
npm install -g @tintinweb/pi-subagents
```

Your custom agents (`.pi/agents/*.md`) and settings continue to work. The parent-bridge tools (`message_parent`, `ask_parent`, `reply_to_subagent`) were never used in practice — if you relied on them, [open an issue upstream](https://github.com/tintinweb/pi-subagents/issues).

## Why

We aggregated four forks (tintinweb, yzlin, Evizero, elidickinson) into one. That was useful in March 2026 when each fork had a different piece of the puzzle. By May 2026, upstream absorbed most of the ecosystem's improvements and added its own. Maintaining a 71-commit fork that can't clean-merge upstream is self-defeating. We're shutting it down.
