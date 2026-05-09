# 400 "extra usage" error on subagent completion notifications

## Summary

When pi-subagents delivers a completion notification to the orchestrator with `triggerTurn: true`, the orchestrator's API call to respond sometimes returns:

```
400 {"type":"error","error":{"type":"invalid_request_error","message":"You're out of extra usage. Ask your workspace admin to add more so you can keep going."}}
```

The orchestrator silently stops reacting. Without a fix, the user must type a manual prompt ("workers done", "check", etc.) to restart it. With the retry patch described below, Pi retries automatically.

---

## Reproduction

Occurs specifically when:
- The orchestrator is using a Claude model via CC OAuth (pi-claude-oauth-adapter)
- pi-subagents delivers a notification via `pi.sendMessage({ deliverAs: "followUp", triggerTurn: true })`
- The session is mid-to-late in a heavy workload (though it has also appeared early with only 29 messages in context)

Does NOT occur during:
- Normal user-prompted orchestrator turns
- Lightweight subagent sessions (simple bash commands)

---

## What was investigated and ruled out

### pi-claude-oauth-adapter billing header injection

Initial hypothesis: the adapter was not injecting the `x-anthropic-billing-header` for notification-triggered turns.

**Ruled out.** The oauth log (`PI_CLAUDE_OAUTH_LOG_FILE`) was captured during a live session that hit the error. Every single API call, including notification-triggered turns (`stack=0, activeTurn=false`), had the billing header present with the correct `cch` hash:

```
[19] 18:16:00 | msgs=106 stack=0 activeTurn=false
       billing: x-anthropic-billing-header: cc_version=2.1.96.0a4; cc_entrypoint=pi; cch=7a313;
       firstUser: what's leftover from the plan @docs/ui-reorg-plan.md ?

[20] 18:16:03 | msgs=106 stack=0 activeTurn=false
       billing: x-anthropic-billing-header: cc_version=2.1.96.0a4; cc_entrypoint=pi; cch=7a313;
       firstUser: what's leftover from the plan @docs/ui-reorg-plan.md ?
```

The `cch` hash (`7a313`) was identical across all 26 logged turns, whether user-prompted or notification-triggered. The billing header is correct.

### System prompt state on notification turns

Hypothesis: `agent.state.systemPrompt` gets reset to the full base prompt (including identity block and Pi docs) between the orchestrator's last user turn and the incoming notification, causing `normalizeSystemBlocks` to produce a different payload.

**Ruled out.** The system blocks are identical in the log for both types of turns:
```
sys[0]: x-anthropic-billing-header: ...
sys[1]: You are an expert coding assistant operating inside pi...
```

The identity block is stripped correctly on both. The system prompt state is unchanged at notification time.

### Context window size

Hypothesis: the notification content or accumulated history exceeds some context limit.

**Ruled out.** The first error in the reference session (ccmc, 2026-05-08) occurred with only **29 messages** in context (5 user, 14 assistant, 10 tool results), and a notification of 1,084 characters. No context limit is remotely stressed at that size. The errors persist across all session sizes from 29 to 270+ messages.

### activeTurn singleton overwrite (pi-claude-oauth-adapter)

Hypothesis: nested subagent `before_agent_start` events clobber the orchestrator's `activeTurn` state.

**Partially relevant, addressed.** pi-subagents runs subagents in their own sessions with their own extension runners, so the orchestrator's `before_agent_start` does NOT fire for subagent starts. However, the `activeTurn` singleton was still replaced with a stack (`activeTurnStack`) to guard against edge cases. This does not affect the 400 issue but improves general correctness.

### ensurePromptBlock identity block re-injection

Hypothesis: for notification turns where `payload.system` is empty, `ensurePromptBlock` rebuilds the system prompt including the identity block, triggering CC billing mode.

**Addressed, not the root cause.** A fix was applied to strip the identity block in `ensurePromptBlock`. In practice, `payload.system` is never empty for these turns (pi-ai always builds system blocks from `context.systemPrompt`), so this code path rarely fires.

### PI_CLAUDE_OAUTH_REINJECT_SCOPE=always

Observation: setting this env var appeared to stop the errors in one session.

**Unconfirmed fix.** The log captured during the subsequent error (described above) shows the flag was set AND the errors still occurred. The flag was likely coincidental. It does not change anything about notification turn payloads (the context hook still returns `undefined` for notification turns because `currentTurn()` is null after `agent_end` fires).

---

## Confirmed root cause

**The errors are genuine CC OAuth extra usage quota exhaustion**, not a billing header issue.

The billing header is correct. Anthropic receives the request, recognizes it as CC OAuth, checks the extra usage pool, and finds it empty or over limit. This returns `invalid_request_error` with "extra usage" rather than a rate limit or overloaded error.

Why it only hits notification turns and not user turns:

1. User turns are typed one at a time, spread out. Each turn's token cost is absorbed gradually.
2. Notification turns fire in bursts. When 3-5 subagents complete simultaneously, the orchestrator receives 3-5 `triggerTurn` calls within seconds of each other.
3. Each orchestrator response turn requires sending the full conversation history (which grows substantially during a heavy session). The combined token cost of multiple simultaneous orchestrator turns briefly spikes above the available extra usage pool.
4. The pool recovers within 30-60 seconds (session-end quota shows only 27% of the 5h window consumed).

From the log, entries [19]-[22] show the same `msgs=106` with gaps of 3s, 5s, 9s: that is exponential backoff from the retry fix firing, not separate notifications.

---

## Pi core bug

`@earendil-works/pi-coding-agent/dist/core/agent-session.js`, `_isRetryableError()` at line 1984:

```js
return /overloaded|provider.?returned.?error|rate.?limit|too many requests|
        429|500|502|503|504|service.?unavailable|server.?error|internal.?error|
        network.?error|connection.?error|connection.?refused|connection.?lost|
        websocket.?closed|websocket.?error|other side closed|fetch failed|
        upstream.?connect|reset before headers|socket hang up|ended without|
        http2 request did not get a response|timed? out|timeout|terminated|
        retry delay/i.test(err);
```

`"You're out of extra usage..."` matches none of these patterns. Pi classifies it as non-retryable, rewinds the turn, and goes silent. The notification content remains in conversation history but no turn is ever retried.

---

## Root cause confirmed (2026-05-09)

Log analysis (`PI_CLAUDE_OAUTH_LOG_FILE`) proved the mechanism:

- Failing turns: `before_provider_request` fires with `stackDepth:0, hasActiveTurn:false` — `before_agent_start` never ran.
- Succeeding turns (user-typed): `before_provider_request` fires with `stackDepth:1, hasActiveTurn:true` — `before_agent_start` ran.
- `after_provider_response` never fired in any session — the oauth adapter's 45 s retry timer was never scheduled. The event isn't emitted for HTTP error responses.

`sendMessage({ triggerTurn: true })` calls `this.agent.prompt()` directly, which bypasses `AgentSession.prompt()` and therefore `before_agent_start`. Something about `before_agent_start` running is required for Anthropic to accept the CC OAuth request. Without it, every automated turn gets 400 "extra usage" and the orchestrator goes silent.

The same failure occurs for followUp-continuation turns (when the orchestrator is streaming at notification time) because `runAgentLoopContinue` also skips `before_agent_start`.

## Applied fix (2026-05-09)

**`src/index.ts` — `emitIndividualNudge` and group nudge callback:**

- **Idle orchestrator**: send notification as custom message (display), then call `pi.sendUserMessage()` with a short trigger. `sendUserMessage` goes through `AgentSession.prompt()`, which fires `before_agent_start`, and the turn succeeds.
- **Streaming orchestrator**: send notification with `deliverAs: "nextTurn"`. It is silently queued and included in the next user-initiated turn, which fires `before_agent_start` naturally.

The widget (`widget.markFinished`, `widget.update`) still provides immediate visual feedback in both cases.

## Previously applied fixes (partial / did not address root cause)

### Fix 1: Pi core retry patch (local, applied 2026-05-08)

File: `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`

Change: added `extra.?usage` to the retryable error regex comment and pattern.

```js
// Before:
// Match: overloaded_error, provider returned error, rate limit, ...
return /overloaded|provider.?returned.?error|.../i.test(err);

// After:
// Match: overloaded_error, extra usage (transient CC quota spike), provider returned error, ...
return /overloaded|extra.?usage|provider.?returned.?error|.../i.test(err);
```

Effect: Pi now retries with exponential backoff instead of silently rewinding. Confirmed working in the log (entries [19]-[22] show 3 retries that eventually succeeded, as `msgs` incremented to 107 at entry [23]).

**This fix will be lost on next `pi update`.** It needs to be re-applied or upstreamed.

### Fix 2: activeTurnStack in pi-claude-oauth-adapter

Replaced the module-level `activeTurn` singleton with `activeTurnStack`. Pushes on `before_agent_start`, pops on `agent_end`. Prevents orchestrator state from being lost if subagent events somehow interact with the extension runner.

### Fix 3: identity block stripping in ensurePromptBlock

Added stripping of `IDENTITY_BLOCK` when `ensurePromptBlock` rebuilds the system prompt from `ctx.getSystemPrompt()`, matching what `normalizeSystemBlocks` already does for explicit blocks.

---

## Current environment state

```bash
# ~/.zshrc
export PI_CLAUDE_OAUTH_REINJECT_SCOPE=always  # unconfirmed mitigation, may not help
export PI_CLAUDE_OAUTH_LOG_FILE=/tmp/oauth-ccmc.log  # add before pi start to capture data
```

---

## What remains unknown

The billing header is provably correct on notification turns. Yet the errors occur. The only remaining question is whether there is some additional signal in the raw HTTP request that differs between user turns and notification turns that we cannot see from Pi's internal logs alone.

To definitively answer this, HTTP traffic interception (e.g., `mitmproxy`) during a failing turn would be needed. Compare the full raw request for a passing user turn vs a failing notification turn.

Until then, the retry fix is the correct mitigation: the pool recovers within a minute, and Pi retrying automatically produces the same result as the user typing a manual prompt.

---

## Upstream action needed

The retry patch in `agent-session.js` should be proposed to the pi-mono repository (`@earendil-works/pi-coding-agent`). The change is one line and clearly correct: "extra usage" is a transient quota spike, not a permanent error, and should be retried like `overloaded_error`.
