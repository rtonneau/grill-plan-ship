// Host adapters share a ticket brief; model aliases stay portable in session files.
const { GpsError, UsageError } = require('./guard');
const { TICKET_EFFORTS } = require('./ticket-model');

const CLAUDE_MODELS = Object.freeze({ fast: 'haiku', medium: 'sonnet', heavy: 'opus' });
const CODEX_MODELS = Object.freeze({
  fast: Object.freeze({ model: 'gpt-6-luna', efforts: Object.freeze(['low', 'medium', 'high', 'xhigh']) }),
  medium: Object.freeze({ model: 'gpt-6-sol', efforts: Object.freeze(['low', 'medium', 'high', 'xhigh']) }),
  heavy: Object.freeze({ model: 'gpt-6-astra', efforts: Object.freeze(['low', 'medium', 'high', 'xhigh']) }),
});

function validateParentEffort(host, parentEffort) {
  if (parentEffort == null) return;
  if (host !== 'codex') throw new UsageError('--parent-effort only applies to --host codex.');
  if (!TICKET_EFFORTS.includes(parentEffort) || parentEffort === 'inherit') {
    throw new UsageError('--parent-effort must be one of: low, medium, high, xhigh.');
  }
}

function resolveCodexHints({ model, effort, parentEffort }, config = {}) {
  validateParentEffort('codex', parentEffort);
  const codex = config.delegation && config.delegation.codex;
  const configured = model === 'inherit' ? null : codex && codex.models && codex.models[model];
  const mapping = model === 'inherit' ? null : configured || CODEX_MODELS[model];
  const hint = 'Configure delegation.codex in .work/gps-config.json using models available in your Codex client, or explicitly choose inherit/inherit.';
  if (model !== 'inherit' && (!mapping || typeof mapping.model !== 'string' || !mapping.model.trim())) {
    throw new GpsError(`No Codex model mapping for ${model}.`, hint);
  }
  const resolvedEffort = mapping && effort === 'inherit' ? parentEffort : effort;
  if (mapping && resolvedEffort == null) {
    throw new GpsError(`Parent effort is unknown for mapped Codex model ${model}.`, 'Choose an explicit supported ticket effort, or supply --parent-effort from authoritative current runtime context.');
  }
  const efforts = model === 'inherit' ? codex && codex.inheritEfforts : mapping.efforts;
  if (resolvedEffort !== 'inherit' && (!Array.isArray(efforts)
    || !efforts.every((e) => TICKET_EFFORTS.includes(e) && e !== 'inherit') || !efforts.includes(resolvedEffort))) {
    throw new GpsError(`Codex effort ${resolvedEffort} is not configured as supported for ${model}.`, hint);
  }
  return {
    ...(mapping && { model: mapping.model }),
    ...(resolvedEffort !== 'inherit' && { reasoning_effort: resolvedEffort }),
  };
}

function buildDispatch(host, { model, effort, parentEffort, description, prompt, taskName }, config = {}) {
  validateParentEffort(host, parentEffort);
  if (host === 'claude') {
    return {
      subagent_type: effort === 'inherit' ? 'general-purpose' : `grill-plan-ship:gps-ticket-${effort}`,
      ...(model !== 'inherit' && { model: CLAUDE_MODELS[model] }),
      description,
      prompt,
    };
  }
  if (host !== 'codex') throw new UsageError('--host must be one of: claude, codex.');
  return {
    task_name: taskName,
    message: prompt,
    fork_turns: 'none',
    ...resolveCodexHints({ model, effort, parentEffort }, config),
  };
}

module.exports = { CLAUDE_MODELS, CODEX_MODELS, buildDispatch, resolveCodexHints, validateParentEffort };
