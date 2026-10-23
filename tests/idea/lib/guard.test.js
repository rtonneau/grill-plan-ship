// tests/idea/lib/guard.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { IdeaError, UsageError, replaceFile, writeTextAtomic } = require("../../../skills/idea/scripts/lib/guard");

test("IdeaError carries a hint", () => {
  const err = new IdeaError("It broke.", "Do this.");
  assert.ok(err instanceof Error);
  assert.equal(err.message, "It broke.");
  assert.equal(err.hint, "Do this.");
});

test("IdeaError defaults to a null hint", () => {
  const err = new IdeaError("It broke.");
  assert.equal(err.hint, null);
});

test("UsageError is an IdeaError", () => {
  assert.ok(new UsageError("x") instanceof IdeaError);
});

test("writeTextAtomic replaces a file's full content", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idea-guard-"));
  const file = path.join(dir, "x.md");
  writeTextAtomic(file, "first");
  assert.equal(fs.readFileSync(file, "utf-8"), "first");
  writeTextAtomic(file, "second");
  assert.equal(fs.readFileSync(file, "utf-8"), "second");
  assert.deepEqual(fs.readdirSync(dir), ["x.md"]); // no temp file left behind
});

test("replaceFile falls back to a direct write when rename fails with EPERM/EACCES", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idea-guard-"));
  for (const code of ["EPERM", "EACCES"]) {
    const existing = path.join(dir, `existing-${code}.txt`);
    fs.writeFileSync(existing, "old");
    const deniedRename = { ...fs, renameSync() { const err = new Error(code); err.code = code; throw err; } };
    replaceFile(existing, `new-${code}`, deniedRename);
    assert.equal(fs.readFileSync(existing, "utf-8"), `new-${code}`);

    const missing = path.join(dir, `missing-${code}.txt`);
    replaceFile(missing, `created-${code}`, deniedRename);
    assert.equal(fs.readFileSync(missing, "utf-8"), `created-${code}`);
    assert.ok(!fs.readdirSync(dir).some((name) => name.includes(".tmp-")));
  }
});

test("replaceFile propagates unexpected rename failures and cleans up", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idea-guard-"));
  const unchanged = path.join(dir, "unchanged.txt");
  fs.writeFileSync(unchanged, "before");
  const ioFailure = { ...fs, renameSync() { const err = new Error("disk failure"); err.code = "EIO"; throw err; } };
  assert.throws(() => replaceFile(unchanged, "after", ioFailure), (err) => err.code === "EIO");
  assert.equal(fs.readFileSync(unchanged, "utf-8"), "before");
  assert.ok(!fs.readdirSync(dir).some((name) => name.includes(".tmp-")));
});
