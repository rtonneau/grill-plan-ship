// Tests for idea-file. Run: node --test tests/idea/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { slugify, validateSlug, parseIdea, serializeIdea, checkBody, nextStatus } = require("../../../skills/idea/scripts/lib/idea-file");

const CANON =
  "---\nstatus: planned\nscope: project\ncreated: 2026-10-05\nreviews: 1\npromoted_to: null\n---\n\n" +
  "## Problem\nSomething.\n\n## Changelog\n\n- 2026-10-05 — captured (dotfiles @ main)\n- 2026-10-06 — grilled\n";

test("slugify: lowercases, collapses runs, trims", () => {
  assert.equal(slugify("Zotero Sync!"), "zotero-sync");
  assert.equal(slugify("  --A__B  "), "a-b");
});

test("validateSlug: accepts good slugs", () => {
  validateSlug("zotero-sync");
  validateSlug("a1");
});

test("validateSlug rejects \"global\", empty and malformed", () => {
  assert.throws(() => validateSlug("global"));
  assert.throws(() => validateSlug(""));
  assert.throws(() => validateSlug("Foo"));
  assert.throws(() => validateSlug("a--b"));
  assert.throws(() => validateSlug("-a"));
});

test("parseIdea: meta, body, changelog", () => {
  const { meta, body, changelog } = parseIdea(CANON);
  assert.deepEqual(meta, { status: "planned", scope: "project", created: "2026-10-05", reviews: 1, promoted_to: null });
  assert.equal(body, "## Problem\nSomething.");
  assert.deepEqual(changelog, [
    { date: "2026-10-05", text: "captured (dotfiles @ main)" },
    { date: "2026-10-06", text: "grilled" },
  ]);
});

test("parseIdea: promoted_to string", () => {
  const t = CANON.replace("promoted_to: null", "promoted_to: some/path");
  assert.equal(parseIdea(t).meta.promoted_to, "some/path");
});

test("parse/serialize round trip is byte for byte", () => {
  assert.equal(serializeIdea(parseIdea(CANON)), CANON);
});

test("serializeIdea writes LF and Changelog last", () => {
  const out = serializeIdea(parseIdea(CANON.replace(/\n/g, "\r\n")));
  assert.equal(out, CANON);
  assert.ok(out.lastIndexOf("## Changelog") > out.indexOf("## Problem"));
});

test("checkBody rejects frontmatter", () => {
  assert.throws(() => checkBody("---\nstatus: x\n---\nhi"));
});

test("checkBody rejects a Changelog heading in the middle of a body", () => {
  assert.throws(() => checkBody("## Problem\nx\n\n## Changelog\n\n- y\n\n## More\nz"));
});

test("checkBody accepts a normal body", () => {
  checkBody("## Problem\nx\n\n---\n\nmore");
});

const OK = [
  ["capture", null, "captured"],
  ["grill", null, "grilled"],
  ["grill", "captured", "grilled"],
  ["plan", "grilled", "planned"],
  ["plan", "planned", "planned"],
  ["review", "grilled", "grilled"],
  ["review", "planned", "planned"],
  ["promote", "captured", "promoted"],
  ["promote", "grilled", "promoted"],
  ["promote", "planned", "promoted"],
  ["drop", "captured", "dropped"],
  ["drop", "grilled", "dropped"],
  ["drop", "planned", "dropped"],
];
for (const [action, cur, next] of OK) {
  test(`nextStatus: ${action} ${cur === null ? "none" : cur} -> ${next}`, () => {
    assert.equal(nextStatus(cur, action), next);
  });
}

test("nextStatus rejects review of a captured Idea", () => {
  assert.throws(() => nextStatus("captured", "review"), { message: "cannot review a captured Idea" });
});

test("nextStatus rejects other pairs", () => {
  assert.throws(() => nextStatus("promoted", "drop"), { message: "cannot drop a promoted Idea" });
  assert.throws(() => nextStatus("captured", "capture"), { message: "cannot capture a captured Idea" });
});
