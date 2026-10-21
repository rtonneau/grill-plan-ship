# /idea start <name|slug> [--global]

**When:** there is time to grill an Idea, new or captured. Ends with the Idea saved as `grilled`.

1. Derive the slug (`SKILL.md`; a slug passes through unchanged). Run `idea-find.js <slug> --json`. The target Scope is Global with `--global`, else Project.
   - **No hit in either Scope:** a new Idea. Go to step 2.
   - **`captured` in the target Scope** (this case wins over a hit in the other Scope): read its file; the grill opens with its Problem (the note and context lines) instead of asking the user to restate it. Go to step 2.
   - **Any other hit** (any status in the other Scope, or a status past `captured` in the target Scope, `dropped` included): the collision prompt below.
2. Run the grill (below) until the design is approved.
3. Write the body file (`SKILL.md`, Idea body): Problem, Decisions, Open questions, Risks, and Terms for a Global Idea. No Plan yet; that is `/idea plan`.
4. Run the save checks (`references/capture.md`), then `idea-save.js <slug> --action grill --body-file <file> [--global] [--create-work-dir] --json`. Pass `--global` for a Global Idea, including a captured one found in Global.
5. Relay the `path` and the commit. Suggest `/idea plan` to add milestones now, or leave it `grilled` for later.

## Collision prompt

One `AskUserQuestion`, naming the existing Idea's status, Scope and path:

1. "Open the existing Idea": for `grilled` or `planned`, follow `references/review.md` on it. For `captured` in the other Scope, grill that Idea (step 2, saving with its Scope's flag). For `promoted` or `dropped`, show its summary (Problem, Decisions, the last Changelog entries, `promoted_to`) and stop: `idea-save.js` re-saves only active Ideas.
2. "Rename": ask for a new name in chat, then go back to step 1 with it.

## Grill

Use the first chain available, and say in one line which one runs: `grilling` and `domain-modeling` (mattpocock-skills, `grilling` first), else `brainstorming` (superpowers), else the built-in grill below. Every finite question goes through `AskUserQuestion` (`SKILL.md` rules), whichever chain runs.

**Terms** settle during the grill:
- **Project Idea:** add them to the target repo's `CONTEXT.md` as they settle (`domain-modeling` does this).
- **Global Idea:** write them in the Idea's `## Terms` section, and keep decisions in `## Decisions`. A Global Idea writes nothing to any repo's `CONTEXT.md` or `docs/adr/`; Promote carries its Terms into the target repo later.

**Done** when every Problem, Decision and Risk could be written without guessing, and what is still undecided is listed as an open question the user chose to leave open. Summarize the design, then ask for approval with `AskUserQuestion`; save nothing before it.

### Built-in grill

Adapted from the `grilling` and `domain-modeling` skills of mattpocock-skills. Interview the user until you both hold the same design. Treat it as a design tree: each decision opens the ones that hang off it. For a Project Idea, first read the repo's `CONTEXT.md` and `docs/adr/` when they exist.

- **Facts are yours, decisions are theirs.** Look up what the code and docs can answer; put every decision to the user.
- **Ask the frontier only:** questions whose prerequisites are settled. Recompute it after each answer.
- **Sharpen the language.** When a term is vague or clashes with the glossary, propose one precise word, and probe its boundary with a concrete edge case.
- **An Idea is not started work.** Stay at the level of problem, decisions and risks; implementation detail waits for Promote.
