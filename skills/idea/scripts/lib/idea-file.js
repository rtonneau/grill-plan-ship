"use strict";
// Idea file model: slug rules, frontmatter/body/changelog parse + serialize, status transitions.

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CHANGELOG_HEADING = "## Changelog";

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function validateSlug(slug) {
  if (typeof slug !== "string" || slug === "") throw new Error("invalid slug: empty");
  if (slug === "global") throw new Error('invalid slug: "global" is reserved');
  if (!SLUG_RE.test(slug)) throw new Error(`invalid slug: ${slug}`);
}

function parseIdea(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") throw new Error("missing frontmatter");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new Error("unterminated frontmatter");

  const raw = {};
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    const i = line.indexOf(":");
    if (i === -1) throw new Error(`bad frontmatter line: ${line}`);
    raw[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const meta = {
    status: raw.status,
    scope: raw.scope,
    created: raw.created,
    reviews: Number(raw.reviews === undefined ? 0 : raw.reviews),
    promoted_to: raw.promoted_to === undefined || raw.promoted_to === "null" || raw.promoted_to === "" ? null : raw.promoted_to,
  };

  const rest = lines.slice(end + 1);
  const ci = rest.indexOf(CHANGELOG_HEADING);
  const bodyLines = ci === -1 ? rest : rest.slice(0, ci);
  const clLines = ci === -1 ? [] : rest.slice(ci + 1);
  const body = bodyLines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");

  const changelog = [];
  for (const line of clLines) {
    const m = /^- (\d{4}-\d{2}-\d{2}) — (.*)$/.exec(line);
    if (m) changelog.push({ date: m[1], text: m[2] });
  }
  return { meta, body, changelog };
}

function serializeIdea({ meta, body, changelog }) {
  const fm = [
    "---",
    `status: ${meta.status}`,
    `scope: ${meta.scope}`,
    `created: ${meta.created}`,
    `reviews: ${meta.reviews}`,
    `promoted_to: ${meta.promoted_to === null || meta.promoted_to === undefined ? "null" : meta.promoted_to}`,
    "---",
    "",
  ].join("\n");
  const cleanBody = String(body).replace(/^\n+/, "").replace(/\n+$/, "");
  let out = fm + "\n" + (cleanBody === "" ? "" : cleanBody + "\n\n") + CHANGELOG_HEADING + "\n";
  if (changelog.length > 0) {
    out += "\n" + changelog.map((e) => `- ${e.date} — ${e.text}`).join("\n") + "\n";
  }
  return out;
}

function checkBody(body) {
  const lines = String(body).replace(/\r\n/g, "\n").split("\n");
  if (lines[0].trim() === "---") throw new Error("body must not contain frontmatter");
  if (lines.some((l) => l.trim() === CHANGELOG_HEADING)) {
    throw new Error("body must not contain a ## Changelog heading");
  }
}

const TRANSITIONS = {
  capture: { none: "captured" },
  grill: { none: "grilled", captured: "grilled" },
  plan: { grilled: "planned", planned: "planned" },
  review: { grilled: "grilled", planned: "planned" },
  promote: { captured: "promoted", grilled: "promoted", planned: "promoted" },
  drop: { captured: "dropped", grilled: "dropped", planned: "dropped" },
};

function nextStatus(current, action) {
  const key = current === null || current === undefined ? "none" : current;
  const row = Object.prototype.hasOwnProperty.call(TRANSITIONS, action) ? TRANSITIONS[action] : {};
  if (!Object.prototype.hasOwnProperty.call(row, key)) {
    throw new Error(`cannot ${action} a ${key} Idea`);
  }
  return row[key];
}

module.exports = { slugify, validateSlug, parseIdea, serializeIdea, checkBody, nextStatus };
