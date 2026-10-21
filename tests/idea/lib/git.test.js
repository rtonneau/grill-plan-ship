// Tests for git. Run: node --test tests/idea/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { makeRepo, git, tmpDir } = require("../helpers");
const { commitPaths, safeGitArgs } = require("../../../skills/idea/scripts/lib/git");

// Every idea skill git process trusts only the containing repository for that
// invocation. This keeps direct Node script calls usable from agent sandboxes
// without changing the user's global git config or wrapping the command in a
// host-specific shell environment assignment.
test("safeGitArgs: scopes safe.directory to the repository containing root, nothing outside one", () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), "idea-safe-dir-"));
  const repo = path.join(container, "repo with spaces");
  const nestedProject = path.join(repo, "packages", "app");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.mkdirSync(nestedProject, { recursive: true });
  assert.deepEqual(
    safeGitArgs(nestedProject, ["status", "--short"]),
    ["-c", `safe.directory=${repo}`, "status", "--short"]
  );

  const linked = path.join(container, "linked worktree");
  fs.mkdirSync(linked);
  fs.writeFileSync(path.join(linked, ".git"), "gitdir: elsewhere\n");
  assert.deepEqual(
    safeGitArgs(linked, ["rev-parse", "HEAD"]),
    ["-c", `safe.directory=${linked}`, "rev-parse", "HEAD"]
  );

  const nonRepo = path.join(container, "not-a-repo");
  fs.mkdirSync(nonRepo);
  assert.deepEqual(safeGitArgs(nonRepo, ["status"]), ["status"]);
  fs.rmSync(container, { recursive: true, force: true });
});

test("commitPaths: commits only the given paths, unrelated staged file stays staged", () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, "other.txt"), "other");
  git(repo, ["add", "other.txt"]);
  fs.mkdirSync(path.join(repo, ".work", "idea"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".work", "idea", "a.md"), "idea");
  const before = git(repo, ["rev-parse", "HEAD"]).trim();
  const r = commitPaths(repo, [".work/idea/a.md"], "feat(idea): a");
  assert.match(r.sha, /^[0-9a-f]{40}$/);
  assert.equal(r.sha, git(repo, ["rev-parse", "HEAD"]).trim());
  assert.notEqual(r.sha, before);
  assert.equal(git(repo, ["show", "--name-only", "--format=", "HEAD"]).trim(), ".work/idea/a.md");
  assert.equal(git(repo, ["diff", "--cached", "--name-only"]).trim(), "other.txt");
  assert.equal(git(repo, ["log", "-1", "--format=%s"]).trim(), "feat(idea): a");
});

test("commitPaths: skips outside a git repository", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "a.md"), "x");
  assert.deepEqual(commitPaths(dir, ["a.md"], "msg"), { sha: null, skipped: "not a git repository" });
});

test("commitPaths: nothing changed gives a skip, not an error", () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, "a.md"), "x");
  commitPaths(repo, ["a.md"], "first");
  const r = commitPaths(repo, ["a.md"], "again");
  assert.equal(r.sha, null);
  assert.equal(r.skipped, "nothing to commit");
});
