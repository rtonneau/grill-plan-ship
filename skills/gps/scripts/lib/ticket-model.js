// skills/gps/scripts/lib/ticket-model.js
// A ticket's optional "**Model:**" and "**Effort:**" lines: which values they
// may hold, how to read them, and how to judge them. Shared by /gps write
// (strict) and /gps ship (lenient).

const { toLines } = require('./guard');

const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/;

// Values the line may hold; "inherit" (or no line) means the session's own model.
const TICKET_MODELS = Object.freeze(['haiku', 'sonnet', 'opus', 'inherit']);

// Effort levels a ticket may ask for; "inherit" (or no line) means the
// session's own effort. Each level but inherit has a plugin subagent,
// agents/gps-ticket-<level>.md, that sets it (an Agent call can pass a model
// but not an effort).
//
// Decision: the hints stop at xhigh. Claude Code also has `max`, but a ticket
// is one small, independently committable change: max is slow and costly for
// that, and a ticket that seems to need it is a sign to split it in the plan
// or to run it inline under the user's own /effort. A "max" line is refused
// with that reason (MAX_EFFORT_REASON). See docs/decisions/0001-effort-hints-stop-at-xhigh.md.
const TICKET_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'inherit']);
const MAX_EFFORT_REASON = 'gps effort hints stop at xhigh: max is slow and costly for one small ticket, '
  + 'so split the ticket in the plan, or run it inline under your own /effort max';

const fieldRe = (label) => new RegExp(`^\\*\\*${label}:\\*\\*[ \\t]*(.*?)[ \\t]*$`);
const MODEL_RE = fieldRe('Model');
const EFFORT_RE = fieldRe('Effort');

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

// The raw value of a ticket's first line matching `re` outside code fences
// (an example in the Notes must not count), or null if it has none.
function readTicketField(ticketText, re) {
  const fence = fenceTracker();
  const lines = toLines(ticketText);
  for (let i = 0; i < lines.length; i++) {
    if (fence.inCode(lines[i], i + 1)) continue;
    const match = lines[i].match(re);
    if (match) return match[1];
  }
  return null;
}

const readTicketModel = (ticketText) => readTicketField(ticketText, MODEL_RE);
const readTicketEffort = (ticketText) => readTicketField(ticketText, EFFORT_RE);

// Judges a ticket's text: { model, raw }. `raw` is the line's value, or null
// when there is no line. `model` is that value lowercased when it is a known
// model, else "inherit" (line missing, empty or unknown, e.g. hand-edited).
function normalizeTicketModel(ticketText) {
  const raw = readTicketModel(ticketText);
  const value = (raw || '').toLowerCase();
  return { model: TICKET_MODELS.includes(value) ? value : 'inherit', raw };
}

// Same for the "**Effort:**" line: { effort, raw }, effort "inherit" when
// the line is missing, empty or unknown (max included: see TICKET_EFFORTS).
function normalizeTicketEffort(ticketText) {
  const raw = readTicketEffort(ticketText);
  const value = (raw || '').toLowerCase();
  return { effort: TICKET_EFFORTS.includes(value) ? value : 'inherit', raw };
}

module.exports = {
  TICKET_MODELS,
  TICKET_EFFORTS,
  MAX_EFFORT_REASON,
  fenceTracker,
  readTicketModel,
  readTicketEffort,
  normalizeTicketModel,
  normalizeTicketEffort,
};
