// Tests for scope. Run: node --test tests/idea/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { makeRepo, git, tmpDir } = require("../helpers");
const {
  globalConfigPath, readGlobalConfig, writeGlobalConfig,
  repoRoot, defaultBranch, resolveScope, listIdeaSlugs,
} = require("../../../skills/idea/scripts/lib/scope");
const { IdeaError } = require("../../../skills/idea/scripts/lib/guard");

function withEnv(name, value, fn) {
  const old = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (old === undefined) delete process.env[name];
    else process.env[name] = old;
  }
}

test("globalConfigPath: GPS_IDEA_CONFIG_PATH overrides the default", () => {
  withEnv("GPS_IDEA_CONFIG_PATH", "/some/where/idea-config.json", () => {
    assert.equal(globalConfigPath(), "/some/where/idea-config.json");
  });
  withEnv("GPS_IDEA_CONFIG_PATH", undefined, () => {
    assert.equal(globalConfigPath(), path.join(os.homedir(), ".gps", "idea-config.json"));
  });
});

test("readGlobalConfig: null when the file is missing", () => {
  const cfg = path.join(tmpDir(), "idea-config.json");
  withEnv("GPS_IDEA_CONFIG_PATH", cfg, () => {
    assert.deepEqual(readGlobalConfig(), { globalRoot: null });
  });
});

test("readGlobalConfig: null when the file is unreadable JSON", () => {
  const dir = tmpDir();
  const cfg = path.join(dir, "idea-config.json");
  fs.writeFileSync(cfg, "not json");
  withEnv("GPS_IDEA_CONFIG_PATH", cfg, () => {
    assert.deepEqual(readGlobalConfig(), { globalRoot: null });
  });
});

test("readGlobalConfig: reads back what writeGlobalConfig wrote", () => {
  const repo = makeRepo();
  const cfg = path.join(tmpDir(), "nested", "idea-config.json");
  withEnv("GPS_IDEA_CONFIG_PATH", cfg, () => {
    const written = writeGlobalConfig({ globalRoot: repo });
    assert.deepEqual(written, { globalRoot: repo });
    assert.ok(fs.existsSync(cfg));
    assert.deepEqual(readGlobalConfig(), { globalRoot: repo });
  });
});

test("writeGlobalConfig: rejects a path that is not a git repository", () => {
  const dir = tmpDir();
  const cfg = path.join(tmpDir(), "idea-config.json");
  withEnv("GPS_IDEA_CONFIG_PATH", cfg, () => {
    assert.throws(() => writeGlobalConfig({ globalRoot: dir }), /Not a git repository/);
    assert.ok(!fs.existsSync(cfg));
  });
});

test("writeGlobalConfig: rejects a path that does not exist", () => {
  const cfg = path.join(tmpDir(), "idea-config.json");
  withEnv("GPS_IDEA_CONFIG_PATH", cfg, () => {
    assert.throws(() => writeGlobalConfig({ globalRoot: path.join(tmpDir(), "nope") }), /Not a directory/);
    assert.ok(!fs.existsSync(cfg));
  });
});

test("writeGlobalConfig: resolves a relative path to absolute before validating and storing", () => {
  const repo = makeRepo();
  const cfg = path.join(tmpDir(), "idea-config.json");
  const relative = path.relative(process.cwd(), repo);
  withEnv("GPS_IDEA_CONFIG_PATH", cfg, () => {
    const written = writeGlobalConfig({ globalRoot: relative });
    assert.ok(path.isAbsolute(written.globalRoot));
    assert.equal(written.globalRoot, repo);
    assert.deepEqual(JSON.parse(fs.readFileSync(cfg, "utf8")), { globalRoot: repo });
    // A later read, from any cwd, gets the same absolute path back.
    assert.deepEqual(readGlobalConfig(), { globalRoot: repo });
  });
});

test("writeGlobalConfig: rejects a relative path that resolves to a non-repo directory", () => {
  const dir = tmpDir();
  const cfg = path.join(tmpDir(), "idea-config.json");
  const relative = path.relative(process.cwd(), dir);
  withEnv("GPS_IDEA_CONFIG_PATH", cfg, () => {
    assert.throws(() => writeGlobalConfig({ globalRoot: relative }), /Not a git repository/);
    assert.ok(!fs.existsSync(cfg));
  });
});

test("writeGlobalConfig: rejects a relative path that resolves to a nonexistent directory", () => {
  const cfg = path.join(tmpDir(), "idea-config.json");
  const relative = path.relative(process.cwd(), path.join(tmpDir(), "nope"));
  withEnv("GPS_IDEA_CONFIG_PATH", cfg, () => {
    assert.throws(() => writeGlobalConfig({ globalRoot: relative }), /Not a directory/);
    assert.ok(!fs.existsSync(cfg));
  });
});

test("repoRoot: top-level from a subdirectory, null outside a repo", () => {
  const repo = makeRepo();
  const sub = path.join(repo, "a", "b");
  fs.mkdirSync(sub, { recursive: true });
  assert.equal(repoRoot(sub), repo);
  assert.equal(repoRoot(repo), repo);
  assert.equal(repoRoot(tmpDir()), null);
});

test("defaultBranch: from origin/HEAD", () => {
  const repo = makeRepo({ branch: "trunk", remote: true });
  assert.equal(defaultBranch(repo), "trunk");
});

test("defaultBranch: only master", () => {
  assert.equal(defaultBranch(makeRepo({ branch: "master" })), "master");
});

test("defaultBranch: main preferred over master", () => {
  const repo = makeRepo({ branch: "main" });
  git(repo, ["branch", "master"]);
  assert.equal(defaultBranch(repo), "main");
});

test("defaultBranch: neither gives null", () => {
  assert.equal(defaultBranch(makeRepo({ branch: "trunk" })), null);
});

test("resolveScope: project scope from a subdirectory uses the repo root", () => {
  const repo = makeRepo();
  const sub = path.join(repo, "src");
  fs.mkdirSync(sub);
  const s = resolveScope({ cwd: sub, global: false, globalRoot: undefined });
  assert.equal(s.scope, "project");
  assert.equal(s.ideaDir, path.join(repo, ".work", "idea"));
  assert.equal(s.gitRoot, repo);
  assert.equal(s.inRepo, true);
  assert.equal(s.workDirExists, false);
  assert.equal(s.branch, "main");
  assert.equal(s.defaultBranch, "main");
  assert.equal(s.offDefaultBranch, false);
  fs.mkdirSync(path.join(repo, ".work"));
  assert.equal(resolveScope({ cwd: sub, globalRoot: undefined }).workDirExists, true);
});

test("resolveScope: offDefaultBranch on a feature branch", () => {
  const repo = makeRepo();
  git(repo, ["checkout", "-q", "-b", "feat/x"]);
  const s = resolveScope({ cwd: repo, global: false });
  assert.equal(s.branch, "feat/x");
  assert.equal(s.defaultBranch, "main");
  assert.equal(s.offDefaultBranch, true);
});

test("resolveScope: offDefaultBranch false when defaultBranch is null", () => {
  const repo = makeRepo({ branch: "trunk" });
  git(repo, ["checkout", "-q", "-b", "feat/x"]);
  const s = resolveScope({ cwd: repo });
  assert.equal(s.defaultBranch, null);
  assert.equal(s.offDefaultBranch, false);
});

test("resolveScope: outside a repo uses cwd", () => {
  const dir = tmpDir();
  const s = resolveScope({ cwd: dir });
  assert.equal(s.inRepo, false);
  assert.equal(s.gitRoot, null);
  assert.equal(s.ideaDir, path.join(dir, ".work", "idea"));
  assert.equal(s.branch, null);
  assert.equal(s.defaultBranch, null);
  assert.equal(s.offDefaultBranch, false);
});

test("resolveScope: --global throws without a configured globalRoot", () => {
  assert.throws(
    () => resolveScope({ cwd: tmpDir(), global: true, globalRoot: undefined }),
    /No personal repo configured/
  );
});

test("resolveScope: global root's project and global dirs are distinct", () => {
  const root = makeRepo();
  const sub = path.join(root, "src");
  fs.mkdirSync(sub);
  const p = resolveScope({ cwd: sub, global: false, globalRoot: root });
  const g = resolveScope({ cwd: sub, global: true, globalRoot: root });
  assert.equal(p.ideaDir, path.join(root, ".work", "idea"));
  assert.equal(g.ideaDir, path.join(root, ".work", "idea", "global"));
  assert.notEqual(p.ideaDir, g.ideaDir);
  assert.equal(g.gitRoot, root);
  assert.equal(g.scope, "global");
  assert.equal(g.globalDir, g.ideaDir);
  assert.equal(g.branch, "main");
  assert.equal(g.defaultBranch, "main");
});

test("resolveScope: throws IdeaError when the configured Global root is no longer a git repository", () => {
  const root = makeRepo();
  fs.rmSync(root, { recursive: true, force: true });
  assert.throws(
    () => resolveScope({ cwd: tmpDir(), global: true, globalRoot: root }),
    (err) => err instanceof IdeaError && /no longer a git repository/.test(err.message)
  );
});

test("resolveScope: throws IdeaError when the configured Global root exists but its .git is gone", () => {
  const root = makeRepo();
  fs.rmSync(path.join(root, ".git"), { recursive: true, force: true });
  assert.throws(
    () => resolveScope({ cwd: tmpDir(), global: true, globalRoot: root }),
    (err) => err instanceof IdeaError && /no longer a git repository/.test(err.message)
  );
});

test("resolveScope: global scope from an unrelated cwd reads branch fields from the global root", () => {
  const root = makeRepo();
  git(root, ["checkout", "-q", "-b", "feat/y"]);
  const g = resolveScope({ cwd: tmpDir(), global: true, globalRoot: root });
  assert.equal(g.gitRoot, root);
  assert.equal(g.branch, "feat/y");
  assert.equal(g.offDefaultBranch, true);
});

test("listIdeaSlugs: project listing skips the global/ subdirectory", () => {
  const root = makeRepo();
  const p = resolveScope({ cwd: root, globalRoot: root });
  const g = resolveScope({ cwd: root, global: true, globalRoot: root });
  fs.mkdirSync(g.ideaDir, { recursive: true });
  fs.mkdirSync(p.ideaDir, { recursive: true });
  fs.writeFileSync(path.join(p.ideaDir, "alpha.md"), "x");
  fs.writeFileSync(path.join(g.ideaDir, "beta.md"), "x");
  assert.deepEqual(listIdeaSlugs(p.ideaDir), ["alpha"]);
  assert.deepEqual(listIdeaSlugs(g.ideaDir), ["beta"]);
  assert.deepEqual(listIdeaSlugs(path.join(root, "missing")), []);
});
