// Host adapters over shared role briefs. Tiers stay portable in session
// files. Claude has stable family aliases. Codex has none, and its spawn tool
// lists the models and efforts this account can use, so the parent resolves
// the tier against that list unless the project pinned a model (decision 0014).
const { GpsError, UsageError } = require('./guard');

const CLAUDE_MODELS = Object.freeze({ fast: 'haiku', medium: 'sonnet', heavy: 'opus' });
const TIER_INTENT = Object.freeze({
  fast: 'the most efficient model offered',
  medium: 'the everyday workhorse model offered',
  heavy: 'the most capable model offered',
});

// delegation.codex.models.<tier>: "<model>" or { model, efforts } (efforts optional).
function pinnedCodexModel(tier, config = {}) {
  const codex = config.delegation && config.delegation.codex;
  const entry = codex && codex.models && codex.models[tier];
  const model = typeof entry === 'string' ? entry : entry && entry.model;
  if (typeof model !== 'string' || !model.trim()) return null;
  return { model, efforts: entry && Array.isArray(entry.efforts) ? entry.efforts : null };
}

// { call, notes, lifecycle }: `call` holds only the host tool's parameters, `notes` what the
// parent must resolve or tell the user. Hints are preferences; explicit overrides
// are requirements and must not be downgraded.
function buildDispatch(host, { model, effort, description, prompt, taskName, requiredModel = false, requiredEffort = false }, config = {}) {
  const effortSet = effort !== 'inherit';
  if (host === 'claude') {
    return {
      call: {
        subagent_type: 'general-purpose',
        ...(model !== 'inherit' && { model: CLAUDE_MODELS[model] }),
        ...(effortSet && { effort }),
        description,
        prompt,
      },
      notes: [],
      lifecycle: 'Use Agent with general-purpose in fresh context, not a fork or worktree. Inspect the live schema before calling. If it returns a background ID, wait for its completion notification and read the final result; a launch acknowledgment is not completion. Use only the host-supported result/wait mechanism. Children inherit host permissions; these briefs do not enforce a read-only sandbox.',
    };
  }
  if (host !== 'codex') throw new UsageError('--host must be one of: claude, codex.');
  const notes = [];
  const pinned = model === 'inherit' ? null : pinnedCodexModel(model, config);
  let keepEffort = effortSet;
  if (pinned && effortSet && pinned.efforts && !pinned.efforts.includes(effort)) {
    if (requiredEffort) throw new GpsError(`Required effort ${effort} is not listed for ${pinned.model}.`, 'Choose a model that supports it or ask the user to change the requirement.');
    keepEffort = false;
    notes.push(`Effort ${effort} is not listed for ${pinned.model} in delegation.codex: left out, tell the user.`);
  }
  if (model !== 'inherit' && !pinned) {
    notes.push(`Set model to ${TIER_INTENT[model]} by your spawn tool (tier ${model}). ${requiredModel ? 'This is required: if unavailable, report BLOCKED rather than substitute.' : 'If it offers no such choice, leave model out and tell the user.'}`);
  }
  if (keepEffort && !pinned) {
    notes.push(requiredEffort
      ? `Effort ${effort} is required: verify it against the live tool; if unavailable, report BLOCKED rather than lower or omit it.`
      : `If the chosen model does not list effort ${effort}, use its nearest lower level and tell the user.`);
  }
  return {
    call: {
      task_name: taskName,
      message: prompt,
      fork_turns: 'none',
      ...(pinned && { model: pinned.model }),
      ...(keepEffort && { reasoning_effort: effort }),
    },
    notes,
    lifecycle: 'Use spawn_agent with fork_turns none; model and reasoning_effort overrides require this fresh context. Suffix task_name if already used so each fresh child, including recovery and re-review, has a unique name. Retain the returned identity, use wait_agent and completion messages to obtain the final result; an ID, progress message or timeout is not completion. Inspect the live schema for available models and permissions; no per-call sandbox override is assumed. These briefs do not enforce a read-only sandbox.',
  };
}

module.exports = { CLAUDE_MODELS, TIER_INTENT, buildDispatch, pinnedCodexModel };
