# /gps start <feature-name>

**When:** Beginning a new feature.

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/start-session.js "<feature-name>"`

**What it does:**

1. Cleans the feature name into a slug (e.g. `Add Dark Mode!` → `add-dark-mode`, printed when it changed; an empty result becomes `untitled-<HHMMSS>`) and creates the session directory `.work/sessions/YYYY-MM-DD__<slug>/` (local date). **If that session already exists, it fails and changes nothing** — tell the user and suggest `/gps status` or a different name.
2. Creates `.work/sessions/YYYY-MM-DD__<slug>/.session-config.json`, recording `scratch_dir`
   Also creates the session's scratch directory `.scratch/tests/YYYY-MM-DD__<slug>/` (for build/run/test artifacts) and appends `.work/` and `.scratch/` to the project's `.gitignore` if missing.
3. Creates `.work/sessions/YYYY-MM-DD__<slug>/01-grill/` directory
4. Creates empty `resume.md` and `notes.md` templates
5. Writes `.work/sessions/.current-session` pointing at this session, so later commands operate on it regardless of what other sessions exist
6. Looks up `.work/sessions/.pending-seeds.json` for an entry whose slug matches this session's slug (e.g. `/gps start runconfig-resolver` matches a seed keyed `runconfig-resolver`, written earlier by `/gps scout`). If found, removes that entry from the seeds file — consumed seeds don't linger — and carries its `problem`/`solution`/`files`/`sourceReport` (plus `severity` and `sourcePath` for seeds from `/gps scout --from`) forward as the starting context for brainstorming. If no match, brainstorming starts from zero as it always has.
7. Immediately invokes the `brainstorming` skill for this feature to begin the grill conversation — do not wait for or ask the user to run `/brainstorming` themselves. If a seed was found in step 6, open with that context already summarized rather than asking the user to restate it.

**If brainstorming classifies the work as "bounded"** (a short in-chat design instead of a full spec/plan doc):

- Presenting the design and getting a "yes" are two different steps. Answering an open design question (e.g. "macro file first or order-independent?") is **not** approval to implement. The agent must ask a standalone, unambiguous question — e.g. *"Ready for me to implement this?"* — and wait for an explicit yes before writing any code.
- Once approved, and **before touching any code**, the agent must save `01-grill/resume.md` by following the steps in `references/write.md` (write-target → payload → write-apply) — every grill phase leaves a trace on disk, bounded or not.
- No `02-plan/plan.md`, no tickets: bounded work skips straight from the saved resume to implementation via the normal dev workflow. Run `/gps finish` when done.

**Output:** The grill conversation begins right away.

**Next:** Once the brainstorming design is approved, run `/gps write` to save the resume, then `/gps plan`.

**Example:**

```
/gps start add-dark-mode
```

## Dependency

`brainstorming` (superpowers) runs the grill conversation. If it isn't available, stop and tell the user to install the `superpowers` plugin.
