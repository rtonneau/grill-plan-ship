"use strict";
// Scope resolution for the idea skill: where Ideas live (project vs global) and git context.
//
// Global scope has no repo of its own: the user names a personal git repo once
// (idea-config.js --set-global-root <path>), remembered in a small per-user JSON
// file outside any project or plugin install (GPS_IDEA_CONFIG_PATH overrides the
// path; that env var is a test hook only).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { git, isRepo } = require("./git");
const { IdeaError, replaceFile } = require("./guard");

function globalConfigPath() {
  return process.env.GPS_IDEA_CONFIG_PATH || path.join(os.homedir(), ".gps", "idea-config.json");
}

// Never throws: a missing or unreadable file just means "not configured yet".
function readGlobalConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(globalConfigPath(), "utf8"));
    return { globalRoot: typeof data.globalRoot === "string" ? data.globalRoot : null };
  } catch {
    return { globalRoot: null };
  }
}

function writeGlobalConfig({ globalRoot }) {
  if (!globalRoot || !fs.existsSync(globalRoot) || !fs.statSync(globalRoot).isDirectory()) {
    throw new IdeaError(`Not a directory: ${globalRoot}`, "Pick an existing directory for the personal repo.");
  }
  if (!isRepo(globalRoot)) {
    throw new IdeaError(`Not a git repository: ${globalRoot}`, "Run `git init` there, or pick another path.");
  }
  const file = globalConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  replaceFile(file, JSON.stringify({ globalRoot }, null, 2));
  return { globalRoot };
}

function repoRoot(cwd) {
  try {
    const top = git(cwd, ["rev-parse", "--show-toplevel"]).trim();
    return top === "" ? null : path.resolve(top);
  } catch {
    return null;
  }
}

function hasLocalBranch(root, name) {
  try {
    git(root, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
    return true;
  } catch {
    return false;
  }
}

function defaultBranch(root) {
  try {
    const ref = git(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).trim();
    if (ref.startsWith("origin/") && ref.length > "origin/".length) return ref.slice("origin/".length);
  } catch {
    // no origin/HEAD: fall through to local branches
  }
  for (const name of ["main", "master"]) {
    if (hasLocalBranch(root, name)) return name;
  }
  return null;
}

function currentBranch(root) {
  try {
    const name = git(root, ["symbolic-ref", "--short", "-q", "HEAD"]).trim();
    return name === "" ? null : name;
  } catch {
    return null;
  }
}

function resolveScope({ cwd, global = false, globalRoot }) {
  const globalDir = globalRoot ? path.join(globalRoot, ".work", "idea", "global") : null;
  let scope, ideaDir, gitRoot, workRoot;
  if (global) {
    if (!globalRoot) {
      throw new IdeaError(
        "No personal repo configured for Global Ideas.",
        "Run `idea-config.js --set-global-root <path>` first."
      );
    }
    scope = "global";
    ideaDir = globalDir;
    workRoot = globalRoot;
    gitRoot = repoRoot(globalRoot);
  } else {
    scope = "project";
    gitRoot = repoRoot(cwd);
    workRoot = gitRoot || path.resolve(cwd);
    ideaDir = path.join(workRoot, ".work", "idea");
  }
  const inRepo = gitRoot !== null;
  const branch = inRepo ? currentBranch(gitRoot) : null;
  const def = inRepo ? defaultBranch(gitRoot) : null;
  return {
    scope,
    ideaDir,
    gitRoot,
    inRepo,
    workDirExists: fs.existsSync(path.join(workRoot, ".work")),
    branch,
    defaultBranch: def,
    offDefaultBranch: def !== null && branch !== null && branch !== def,
    globalDir,
  };
}

// Idea slugs in a directory; "global" is a reserved subdirectory, never an Idea.
function listIdeaSlugs(ideaDir) {
  let entries;
  try {
    entries = fs.readdirSync(ideaDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name.slice(0, -3))
    .sort();
}

module.exports = {
  globalConfigPath,
  readGlobalConfig,
  writeGlobalConfig,
  repoRoot,
  defaultBranch,
  currentBranch,
  resolveScope,
  listIdeaSlugs,
};
