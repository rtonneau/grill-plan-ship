// skills/gps/scripts/lib/jev.js
//
// TypeSafe's Jev, used to judge a ticket's Model/Effort hints (/gps plan).
// Fully optional: gated by TYPESAFE_API_KEY and .work/gps-config.json's
// jev.enabled (lib/project-config.js). One POST /v1/systemone per /gps
// plan run, judging every ticket's Model and Effort together.
//
// GPS_JEV_TIMEOUT_MS overrides the timeout for tests; read fresh on every
// call (never cached at module load), the same way lib/github.js's
// ghCommand() reads GPS_GH_BIN, so a test can change it between calls.
// Tests fake fetch itself (tests/fixtures/fake-fetch.js), so the endpoint
// is fixed.

const JEV_MODEL = 'jev-latest';

class JevError extends Error {}

// Version-named, so Jev's judgment has real nuance; the ticket's
// **Model:** line only ever gets the collapsed family (decision 0004).
const MODEL_CRITERIA = {
  'haiku-5.5': 'Small, clear, and of a kind that recurs often: renames, docs, config, one file with an obvious pattern.',
  'sonnet-5': 'Ordinary multi-step implementation judgment (older Sonnet build).',
  'sonnet-5.5': 'Ordinary multi-step implementation judgment (current Sonnet build).',
  'opus-5': 'Cross-file design judgment or genuinely tricky debugging (older Opus build).',
  'opus-5.5': 'Cross-file design judgment or genuinely tricky debugging (current Opus build).',
};

const EFFORT_CRITERIA = {
  low: 'The change is spelled out.',
  medium: 'Ordinary.',
  high: 'Subtle logic, or several files to keep consistent.',
  xhigh: 'Hard reasoning a mistake would be costly in.',
};

const FAMILY_BY_MODEL = {
  'haiku-5.5': 'haiku',
  'sonnet-5': 'sonnet',
  'sonnet-5.5': 'sonnet',
  'opus-5': 'opus',
  'opus-5.5': 'opus',
};

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

function timeoutMs() {
  return Number(process.env.GPS_JEV_TIMEOUT_MS) || 15000;
}

// { enabled, reason }: enabled when TYPESAFE_API_KEY is set. No network
// call (unlike diagnoseGithub's `gh auth status`), so nothing expensive to
// cache.
function diagnoseJev() {
  return process.env.TYPESAFE_API_KEY
    ? { enabled: true, reason: 'TYPESAFE_API_KEY is set' }
    : { enabled: false, reason: 'TYPESAFE_API_KEY is not set' };
}

// One POST's body: state.tickets plus a model_<name>/effort_<name> Choice
// question pair per ticket, each referencing its own ticket by backticked
// state path (Jev's own convention for pointing at part of a shared state).
function buildRequestBody(tickets) {
  const state = { tickets: tickets.map(({ name, body }) => ({ name, body })) };
  const questions = {};
  tickets.forEach(({ name }, i) => {
    questions[`model_${name}`] = {
      type: 'choice',
      instructions: `Which Claude model should implement the ticket at \`state.tickets[${i}].body\`?`,
      criteria: MODEL_CRITERIA,
    };
    questions[`effort_${name}`] = {
      type: 'choice',
      instructions: `How much reasoning effort does the ticket at \`state.tickets[${i}].body\` need?`,
      criteria: EFFORT_CRITERIA,
    };
  });
  return { state, model: JEV_MODEL, questions };
}

// Collapses each ticket's model_<name>/effort_<name> answers into
// { model, modelRaw, modelConfidence, effort, effortConfidence }, keyed
// by ticket name. Throws JevError on anything the response doesn't supply.
function parseAnswers(tickets, json) {
  const answers = (json && json.answers) || {};
  const result = {};
  for (const { name } of tickets) {
    const modelAnswer = answers[`model_${name}`];
    const effortAnswer = answers[`effort_${name}`];
    if (!modelAnswer || !effortAnswer) throw new JevError(`Jev response is missing an answer for ticket "${name}".`);
    if (!Object.hasOwn(FAMILY_BY_MODEL, modelAnswer.choice)) {
      throw new JevError(`Jev returned an unknown model "${modelAnswer.choice}" for ticket "${name}".`);
    }
    if (!Object.hasOwn(EFFORT_CRITERIA, effortAnswer.choice)) {
      throw new JevError(`Jev returned an unknown effort "${effortAnswer.choice}" for ticket "${name}".`);
    }
    const family = FAMILY_BY_MODEL[modelAnswer.choice];
    result[name] = {
      model: family,
      modelRaw: modelAnswer.choice,
      modelConfidence: modelAnswer.confidence,
      effort: effortAnswer.choice,
      effortConfidence: effortAnswer.confidence,
    };
  }
  return result;
}

// Judges every ticket's Model/Effort in one call. Throws JevError on any
// failure: missing key, network error, timeout, non-2xx, or a malformed/
// incomplete/unknown response.
async function classifyTickets(tickets) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new JevError('TYPESAFE_API_KEY is not set.');

  const controller = new AbortController();
  const ms = timeoutMs();
  const timer = setTimeout(() => controller.abort(), ms);
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody(tickets)),
      signal: controller.signal,
    });
  } catch (err) {
    throw new JevError(`Jev request failed: ${err.name === 'AbortError' ? `timed out after ${ms}ms` : err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new JevError(`Jev request failed: HTTP ${response.status}`);

  let json;
  try {
    json = await response.json();
  } catch (err) {
    throw new JevError(`Jev response was not valid JSON: ${err.message}`);
  }
  return parseAnswers(tickets, json);
}

module.exports = {
  JevError, MODEL_CRITERIA, EFFORT_CRITERIA, FAMILY_BY_MODEL, diagnoseJev, classifyTickets,
};
