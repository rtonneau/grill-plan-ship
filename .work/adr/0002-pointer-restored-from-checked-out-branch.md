# A missing session pointer is restored from the checked-out branch

_ADR 0002, recorded 2026-11-20 (session 2026-11-20__stacked-session-finish-merged-into-its-open-base-branch-deletes)._

<!-- Format adapted from mattpocock-skills' domain-modeling (ADR-FORMAT.md): https://github.com/mattpocock/skills.git -->

A session stacked with `--base` on an open session's branch deletes `.current-session` in its finish commit, so merging it back into that branch deletes the open session's pointer without a conflict. When the pointer is missing (no file, nothing else wrong) and exactly one unfinished session makes the checked-out branch its busy branch, gps re-points to that session, writes the file and warns. This narrows the rule that pointer resolution never falls back to another session: the checked-out branch identifies its owner without ambiguity. An invalid, missing-session or finished pointer, no match or several matches still fail as before. Restoring the base's pointer at finish was rejected because it leaves the finished session's worktree pointing at a session that lives in another worktree.
