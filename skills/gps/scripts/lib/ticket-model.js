// scripts/lib/ticket-model.js
// A ticket's optional "**Model:**" line: which values it may hold, how to read
// it, and how to judge it. Shared by /gps write (strict) and /gps ship
// (lenient); depends on nothing else in scripts/lib.

const MODEL_RE = /^\*\*Model:\*\*[ \t]*(.*?)[ \t]*$/;
const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/;

// Values the line may hold; "inherit" (or no line) means the session's own model.
const TICKET_MODELS = Object.freeze(['haiku', 'sonnet', 'opus', 'inherit']);

function toLines(text) {
  return text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
}

// Tracks fenced code blocks the CommonMark way: a fence closes only on a
// bare line of the same character, at least as long as the opening one,
// so "~~~" inside a ``` block or ``` inside a ```` block stays content.
function fenceTracker() {
  let open = null;
  return {
    // True when the line is a fence line or inside a fenced block.
    inCode(line, lineNumber) {
      if (open) {
        const close = line.match(FENCE_CLOSE_RE);
        if (close && close[1][0] === open.char && close[1].length >= open.length) open = null;
        return true;
      }
      const start = line.match(FENCE_OPEN_RE);
      if (start) open = { char: start[1][0], length: start[1].length, lineNumber };
      return Boolean(start);
    },
    get open() {
      return open;
    },
  };
}

// The raw value of a ticket's first "**Model:**" line outside code fences
// (an example in the Notes must not count), or null if it has none.
function readTicketModel(ticketText) {
  const fence = fenceTracker();
  const lines = toLines(ticketText);
  for (let i = 0; i < lines.length; i++) {
    if (fence.inCode(lines[i], i + 1)) continue;
    const match = lines[i].match(MODEL_RE);
    if (match) return match[1];
  }
  return null;
}

// Judges a ticket's text: { model, raw }. `raw` is the line's value, or null
// when there is no line. `model` is that value lowercased when it is a known
// model, else "inherit" (line missing, empty or unknown, e.g. hand-edited).
function normalizeTicketModel(ticketText) {
  const raw = readTicketModel(ticketText);
  const value = (raw || '').toLowerCase();
  return { model: TICKET_MODELS.includes(value) ? value : 'inherit', raw };
}

module.exports = { TICKET_MODELS, fenceTracker, readTicketModel, normalizeTicketModel };
