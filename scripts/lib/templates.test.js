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

console.log('templates.test.js: all assertions passed');
