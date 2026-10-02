# /gps config

**When:** Checking or refreshing the project's GitHub flag (`.work/gps-config.json`), typically after a project that started without GitHub gets a github.com `origin` or a `gh auth login`. Detection otherwise runs only once, when the file is first created.

**What it does:**

- `/gps config` — run `node $CLAUDE_PLUGIN_ROOT/skills/gps/scripts/config.js` (read-only, except that it creates a missing file). It prints the stored `github.enabled`, its `detected_at`, and what detection finds now with the reason. Relay it.
- `/gps config --rescan` — run `node $CLAUDE_PLUGIN_ROOT/skills/gps/scripts/config.js --rescan`. If the detected value matches, it refreshes `detected_at` and you are done. If it differs, it prints `⚠️  Stored value differs: github.enabled <old> → <new>. Nothing was changed.`:
  1. **Confirm** — show the user the old and new value and the detection reason, and ask with `AskUserQuestion` whether to apply it. Warn when the change turns GitHub **off** (a hand-forced `true`, e.g. for GitHub Enterprise, would be lost).
  2. **Apply** — only after a yes, run `node $CLAUDE_PLUGIN_ROOT/skills/gps/scripts/config.js --rescan --apply`. On a no, change nothing.

The new value applies to sessions whose plan is not saved yet (branch at the plan write, issue at the grill write of `/gps issue`). Sessions already past those writes keep their current mode: no branch, PR or issue is created for them afterwards.

**Output:** the stored and detected values; `✅ Updated: github.enabled <old> → <new>.` after an apply.

**Example:**

```
/gps config
/gps config --rescan
```
