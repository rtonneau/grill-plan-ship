// scripts/lib/templates.test.js
const assert = require('assert');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./templates');

// renderTemplate substitutes only known keys, leaves the rest untouched
const rendered = renderTemplate('# {{ title }}\n\n{{ unknown placeholder }}', { title: 'Hello' });
assert.strictEqual(rendered, '# Hello\n\n{{ unknown placeholder }}');

// loadTemplate reads a real file from templates/ relative to the project root
const resumeTemplate = loadTemplate('01-grill-resume.md');
assert.ok(resumeTemplate.includes('{{ feature-name }}'), 'expected resume template to contain {{ feature-name }} placeholder');

// Every template, rendered with the variables its handler passes, must
// leave no "{{ }}" behind: template_version 2 sessions only detect
// <!-- gps:fill --> markers, so a stray {{ }} would never be caught.
const handlerVars = {
  '01-grill-resume.md': { 'feature-name': 'f', timestamp: 't' },
  '02-plan.md': { 'feature-name': 'f', timestamp: 't' },
  '02-ticket.md': { N: '01', slug: '[slug]' },
  '03-implement-log.md': { N: '01' },
  'handoff.md': {
    'feature-name': 'f', 'session-id': 's', timestamp: 't', 'current-phase': 'p', 'active-ticket': 'a',
    'git-status-project': 'g', 'git-status-session': 'g', 'ticket-queue-summary': 'q', 'git-log': 'l',
  },
};
for (const [file, vars] of Object.entries(handlerVars)) {
  const out = renderTemplate(loadTemplate(file), vars);
  assert.ok(!/\{\{[^}]+\}\}/.test(out), `${file} leaves a {{ }} placeholder after rendering`);
}
for (const file of ['01-grill-resume.md', '02-plan.md', '02-ticket.md', 'handoff.md']) {
  assert.ok(/<!--\s*gps:fill\b/.test(loadTemplate(file)), `${file} has no gps:fill markers`);
}

console.log('templates.test.js: all assertions passed');
