# GPS Tutorial

A walkthrough of `grill-plan-ship` (`/gps`) using short, concrete examples. See `README.md` for install steps and `skills/gps/SKILL.md` for the full command reference.

## The mental model

Every feature moves through four phases, each producing files under `.work/sessions/YYYY-MM-DD__<slug>/`:

```
grill (brainstorm) → plan (tickets) → ship (implement) → finish (archive)
```

`/gps write` is the "save checkpoint" step after grill and after plan — it turns an approved conversation into files on disk. Nothing is written to disk from a conversation until you run it.

## Example 1: A full feature, start to finish

```
/gps start add-dark-mode
```
Cleans the name to a slug, creates `.work/sessions/2026-09-22__add-dark-mode/`, and immediately opens a brainstorming conversation — answer its questions about the problem, constraints, and approach.

```
/gps write
```
Once you approve the brainstormed design, this saves it to `01-grill/resume.md`.

```
/gps plan
```
Reads the approved resume and opens a planning conversation that breaks the work into atomic tickets.

```
/gps write
```
Once you approve the tickets, this saves `02-plan/plan.md` and one file per ticket under `02-plan/tickets/`.

```
/gps ship
```
Implements every ticket in order — one commit per ticket — stopping only if a ticket genuinely blocks (and telling you why).

```
/gps finish
```
Generates `INDEX.md` summarizing the session and clears it as the current session.

## Example 2: Implementing one ticket by hand

Prefer to review each ticket yourself instead of letting `/gps ship` run the whole queue?

```
/gps ticket 2
```
Scaffolds `03-implement/02-<slug>/` and prints ticket 2's spec. Implement it, verify it, then either run `/gps ticket 3` next or switch to `/gps ship` to finish the rest automatically.

## Example 3: Sourcing a feature from the codebase itself

No feature idea yet, but you want the codebase to suggest one?

```
/gps scout
```
Scans the project for architecture candidates and prints ready-to-copy `/gps start <slug>` commands, e.g.:

```
/gps start runconfig-resolver
```
Brainstorming opens already seeded with that candidate's problem/solution — you're not starting from a blank page.

## Example 4: Picking work back up later

Stopping for the day mid-session:

```
/gps handoff
```
Writes `HANDOFF.md` with what's done, why, and the next concrete action — for you or a fresh session to read later.

Next time, in a new session:

```
/gps resume
```
Prints a catch-up briefing: the saved handoff, freshly recomputed live state (tickets, git log, git status), and the suggested next command.

Lost track of which session is active, or how many are open?

```
/gps status
```
Lists every session with its phase, and for the current one, what's pending and why. Read-only — safe to run any time.

## Tips

- `/gps write` figures out on its own whether grill or plan is pending — you never have to say which.
- Re-running `/gps start`, `/gps plan`, `/gps ticket`, or `/gps finish` against existing output never overwrites work; it refuses or resumes.
- See `README.md#session-structure` for what the on-disk session layout looks like, and `skills/gps/SKILL.md` for exact behavior of every command.
