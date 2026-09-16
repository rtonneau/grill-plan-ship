# Task 2: Add `scripts/lib/templates.js`

**Context:** This is the second task in the fix. Task 1 just created the four markdown template files under `templates/`. This task creates a Node.js module to load and render those templates.

**Files:**
- Create: `scripts/lib/templates.js`
- Create: `scripts/lib/templates.test.js` (plain Node assertions, no test framework needed)

**Interfaces:**
- Consumes: The template files created in Task 1 (at `templates/01-grill-resume.md`, `templates/02-plan.md`, `templates/02-ticket.md`, `templates/03-implement-log.md`)
- Produces: Two exports:
  - `loadTemplate(fileName: string): string` — reads a template file by name from the `templates/` directory
  - `renderTemplate(content: string, vars: Record<string,string>): string` — replaces `{{ key }}` placeholders in content with values from the vars map; only known keys are substituted; unrecognized placeholders stay as-is

**How it works:**
- `loadTemplate('01-grill-resume.md')` returns the full file content as a string
- `renderTemplate('# {{ title }}\n\n{{ unknown }}', { title: 'Hello' })` returns `'# Hello\n\n{{ unknown }}'` (title is replaced, unknown is not)

**What to do:**

1. **Create `scripts/lib/templates.test.js`** with this exact content:

```javascript
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
```

2. **Create `scripts/lib/templates.js`** with this exact content:

```javascript
// scripts/lib/templates.js
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

function loadTemplate(fileName) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, fileName), 'utf-8');
}

function renderTemplate(content, vars) {
  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

module.exports = { loadTemplate, renderTemplate };
```

3. **Test it:** Run `node scripts/lib/templates.test.js` and confirm it prints `templates.test.js: all assertions passed`

4. **Commit:** `git add scripts/lib/templates.js scripts/lib/templates.test.js && git commit -m "feat: add shared template loader/renderer for gps scripts"`

**Report to:**
.superpowers/sdd/2026-09-16-fix-gps-build-inconsistencies/task-2-report.md

Write your report with this structure:
```
## Status
[DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED]

## Commits
[List each commit: hash message]

## Test Result
[Confirm test output: node scripts/lib/templates.test.js — did it print the success message?]

## Concerns (if any)
[Optional: any doubts]
```

When done, post only:
- Status (one word)
- Commits (hash space message)
- One-line test summary
- Any concerns
