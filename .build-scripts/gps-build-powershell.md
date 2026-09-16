# grill-plan-ship: Build Guide (PowerShell 7.6.5 + GitHub CLI)

Complete step-by-step guide using **PowerShell 7.6.5** and **GitHub CLI**.

---

## STEP 1: Create GitHub Repo (15 min)

### What you're doing
Creating a GitHub repository using the GitHub CLI.

### PowerShell Commands

```powershell
# Create the repository on GitHub (public)
gh repo create grill-plan-ship --public --clone

# Navigate into the cloned repository
cd grill-plan-ship

# Verify you're in the right place
Get-Location
# Output: C:\path\to\grill-plan-ship

# Check what's there
ls -Directory
# Output: .git, README.md, LICENSE
```

### What just happened
- `gh repo create` created a public GitHub repository
- `--clone` automatically cloned it to your local machine
- You're now in the repo directory

---

## STEP 2: Create Directory Structure (10 min)

### What you're doing
Creating folders and files for the plugin.

### PowerShell Commands

```powershell
# Create all required directories
@('skills', 'templates', 'scripts', 'examples', 'evals') | ForEach-Object {
    New-Item -ItemType Directory -Path $_ -Force | Out-Null
}

# Create empty files
@('SKILL.md', 'README.md', 'LICENSE', 'package.json', '.gitignore') | ForEach-Object {
    New-Item -ItemType File -Path $_ -Force | Out-Null
}

# Verify structure
Get-ChildItem -Directory
# Output:
# Directory: C:\path\to\grill-plan-ship
#
# Mode                 LastWriteTime         Length Name
# ----                 -------------         ------ ----
# d----           9/16/2026  2:15 PM                .git
# d----           9/16/2026  2:15 PM                examples
# d----           9/16/2026  2:15 PM                evals
# d----           9/16/2026  2:15 PM                scripts
# d----           9/16/2026  2:15 PM                skills
# d----           9/16/2026  2:15 PM                templates
```

### Add .gitignore

```powershell
# Create .gitignore with proper content
$gitignoreContent = @"
node_modules/
.env
*.log
.DS_Store
evals/test-output/
"@

$gitignoreContent | Set-Content -Path '.gitignore' -Encoding UTF8

# Verify
Get-Content '.gitignore'
```

### Add package.json

```powershell
# Create package.json
$packageJson = @{
    name = "grill-plan-ship"
    version = "1.0.0"
    description = "Universal workflow plugin: grill → plan → ship"
    keywords = @("workflow", "brainstorm", "planning", "implementation")
    author = "your-username"
    license = "MIT"
} | ConvertTo-Json -Indent 2

$packageJson | Set-Content -Path 'package.json' -Encoding UTF8

# Verify
Get-Content 'package.json'
```

### Commit to Git

```powershell
# Stage all files
git add .

# Create initial commit
git commit -m "chore: initial project structure"

# Push to GitHub
git push origin main

# Verify
git log --oneline -n 1
# Output: abc1234 chore: initial project structure
```

---

## STEP 3: Write SKILL.md (1.5 hours)

### What you're doing
Creating the **entry point** file that Claude Code reads.

### PowerShell: Create SKILL.md

```powershell
$skillContent = @"
# grill-plan-ship

Universal workflow plugin: brainstorm → plan → implement.

**Commands:**
- ``/gps start <feature-name>`` — Begin a new feature
- ``/gps plan`` — Generate plan + tickets
- ``/gps ticket <number>`` — Implement ticket N
- ``/gps finish`` — Archive session + summary

---

## Overview

This plugin orchestrates a repeatable, documented workflow for any code project:

1. **Grill** (Session 1) — Brainstorm, clarify spec
2. **Plan** (Session 2) — Break work into atomic tickets
3. **Ship** (Session 3+) — Implement tickets one by one
4. **Finish** — Archive and summarize

All output lives in ``.work/sessions/YYYYMMDD__<feature>/`` with a standard structure.

---

## Commands

### /gps start <feature-name>

**When:** Beginning a new feature.

**What it does:**
1. Creates session directory: ``.work/sessions/YYYYMMDD__<feature-name>/``
2. Creates ``.work/sessions/YYYYMMDD__<feature-name>/.session-config.json``
3. Creates ``.work/sessions/YYYYMMDD__<feature-name>/01-grill/`` directory
4. Creates empty ``resume.md`` and ``notes.md`` templates

**Output:** Ready to brainstorm.

**Example:**
```
/gps start add-dark-mode
```

---

### /gps plan

**When:** After reviewing the grill session (resume.md approved).

**What it does:**
1. Reads ``.work/sessions/CURRENT/01-grill/resume.md``
2. Creates ``02-plan/`` directory
3. Creates ``02-plan/plan.md`` template
4. Creates 4 ticket templates in ``02-plan/tickets/``

**Output:** Ticket templates ready for you to fill in.

**Next:** Run ``/writing-plans`` to generate actual tickets. Run ``/unslop`` on each ticket.

---

### /gps ticket <number>

**When:** Starting implementation of a ticket.

**What it does:**
1. Reads ``02-plan/tickets/NN-*.md``
2. Creates ``03-implement/NN-slug/`` directory
3. Creates ``commit-log.md`` template
4. Prints ticket spec to console

**Output:** Workspace + spec printed. Ready to code.

---

### /gps finish

**When:** All tickets complete.

**What it does:**
1. Generates ``INDEX.md`` (session summary)
2. Updates ``.session-config.json`` with "completed" status
3. Prints summary

**Output:** Archived session, ready to start next feature.

---

## Composable Skills

This plugin composes:
- ``brainstorming`` (superpowers)
- ``writing-plans`` (superpowers)
- ``unslop`` (for crisp language)

---

## Installation

```powershell
gh repo clone yourusername/grill-plan-ship ``$HOME\.claude\skills\grill-plan-ship

# Restart Claude Code
```

Then in any project:
```
/gps start your-feature-name
```
"@

$skillContent | Set-Content -Path 'SKILL.md' -Encoding UTF8

# Verify
Get-Content 'SKILL.md' | Select-Object -First 10
```

### Commit

```powershell
git add SKILL.md
git commit -m "docs: add command specs to SKILL.md"
git push origin main
```

---

## STEP 4: Create 4 JavaScript Handlers (2 hours)

### Handler 1: `scripts/start-session.js`

```powershell
# Create the handler
$handler1 = @"
#!/usr/bin/env node

/**
 * /gps start <feature-name>
 *
 * Creates session directory with structure:
 * .work/sessions/YYYYMMDD__<feature-name>/
 *   ├── .session-config.json
 *   ├── 01-grill/
 *   │   ├── resume.md
 *   │   └── notes.md
 *   └── INDEX.md
 */

const fs = require('fs');
const path = require('path');

function startSession(featureName) {
  // Generate session ID
  const date = new Date().toISOString().split('T')[0];
  const slug = featureName.toLowerCase().replace(/\s+/g, '-');
  const sessionId = \`\${date}__\${slug}\`;

  // Create directories
  const projectRoot = process.cwd();
  const workDir = path.join(projectRoot, '.work', 'sessions', sessionId);
  const grillDir = path.join(workDir, '01-grill');

  fs.mkdirSync(grillDir, { recursive: true });

  // Create .session-config.json
  const config = {
    session_id: sessionId,
    feature_name: featureName,
    created_at: new Date().toISOString(),
    phases_completed: [],
    tickets: [],
    status: 'grill-in-progress'
  };

  fs.writeFileSync(
    path.join(workDir, '.session-config.json'),
    JSON.stringify(config, null, 2)
  );

  // Create resume.md template
  const resumeTemplate = \`# Session: \${featureName}

**Date:** \${new Date().toISOString()}
**Status:** Grill in progress

## Problem Statement

(To be filled by Claude after brainstorming)

## Context & Constraints

(To be filled)

## Success Metrics

(To be filled)

## Architecture & Approach

(To be filled)
\`;

  fs.writeFileSync(path.join(grillDir, 'resume.md'), resumeTemplate);
  fs.writeFileSync(path.join(grillDir, 'notes.md'), '# Brainstorm Transcript\n\n(To be filled)\n');

  // Create initial INDEX.md
  fs.writeFileSync(
    path.join(workDir, 'INDEX.md'),
    \`# Session: \${featureName}\n\nPhase: Grill (in progress)\n\`
  );

  console.log(\`✅ Session initialized: \${sessionId}\`);
  console.log(\`📁 Path: \${workDir}\`);
  console.log(\`\n📝 Next steps:\`);
  console.log(\`1. Run /brainstorming to clarify the spec\`);
  console.log(\`2. Save output to \${path.join(grillDir, 'resume.md')}\`);
  console.log(\`3. Then run /gps plan\`);
}

// Main
const featureName = process.argv[2];
if (!featureName) {
  console.error('Usage: /gps start <feature-name>');
  process.exit(1);
}

startSession(featureName);
"@

$handler1 | Set-Content -Path 'scripts/start-session.js' -Encoding UTF8

# Make executable (PowerShell note: Unix-like permissions don't apply, but keep for GitHub compatibility)
```

### Handler 2: `scripts/plan.js`

```powershell
$handler2 = @"
#!/usr/bin/env node

/**
 * /gps plan
 *
 * Reads resume.md, creates 02-plan/ + ticket templates
 */

const fs = require('fs');
const path = require('path');

function createPlan() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');

  // Find current session (most recent)
  if (!fs.existsSync(sessionsDir)) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const sessions = fs.readdirSync(sessionsDir).sort().reverse();
  const currentSession = sessions[0];
  const sessionDir = path.join(sessionsDir, currentSession);
  const resumePath = path.join(sessionDir, '01-grill', 'resume.md');

  if (!fs.existsSync(resumePath)) {
    console.error(\`resume.md not found. Run /gps start first.\`);
    process.exit(1);
  }

  // Create 02-plan structure
  const planDir = path.join(sessionDir, '02-plan');
  const ticketsDir = path.join(planDir, 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });

  // Create plan.md template
  const planTemplate = \`# Implementation Plan

**Session:** \${currentSession}
**Date:** \${new Date().toISOString()}

## Strategy

(Run /writing-plans to generate this)

## Tickets

- Ticket 1: (To be filled)
- Ticket 2: (To be filled)
- Ticket 3: (To be filled)
- Ticket 4: (To be filled)
\`;

  fs.writeFileSync(path.join(planDir, 'plan.md'), planTemplate);

  // Create 4 ticket templates
  for (let i = 1; i <= 4; i++) {
    const ticketTemplate = \`# Ticket \${i.toString().padStart(2, '0')}: [slug]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

**Files to Touch:**
- src/...

**Verification:**

Run:
\\\`\\\`\\\`bash
npm test
\\\`\\\`\\\`

Expected: All tests pass
\`;

    const ticketPath = path.join(
      ticketsDir,
      \`\${i.toString().padStart(2, '0')}-[slug].md\`
    );
    fs.writeFileSync(ticketPath, ticketTemplate);
  }

  // Update .session-config.json
  const configPath = path.join(sessionDir, '.session-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  config.phases_completed.push('grill');
  config.status = 'plan-in-progress';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(\`✅ Plan directory created\`);
  console.log(\`📁 Path: \${planDir}\`);
  console.log(\`\n📝 Next steps:\`);
  console.log(\`1. Run /writing-plans to generate your tickets\`);
  console.log(\`2. Copy ticket content into 02-plan/tickets/\`);
  console.log(\`3. Run /unslop rewrite on each ticket for crisp language\`);
  console.log(\`4. Then run /gps ticket 01 to start implementing\`);
}

createPlan();
"@

$handler2 | Set-Content -Path 'scripts/plan.js' -Encoding UTF8
```

### Handler 3: `scripts/ticket.js`

```powershell
$handler3 = @"
#!/usr/bin/env node

/**
 * /gps ticket <number>
 *
 * Reads ticket spec, creates implementation directory, prints spec
 */

const fs = require('fs');
const path = require('path');

function getTicket(ticketNum) {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');

  const sessions = fs.readdirSync(sessionsDir).sort().reverse();
  const currentSession = sessions[0];
  const ticketsDir = path.join(sessionsDir, currentSession, '02-plan', 'tickets');

  const ticketFiles = fs.readdirSync(ticketsDir)
    .filter(f => f.startsWith(ticketNum.toString().padStart(2, '0') + '-'))
    .sort();

  if (ticketFiles.length === 0) {
    console.error(\`Ticket \${ticketNum} not found.\`);
    process.exit(1);
  }

  const ticketPath = path.join(ticketsDir, ticketFiles[0]);
  const ticketContent = fs.readFileSync(ticketPath, 'utf-8');
  const slug = ticketFiles[0].replace(/^\d+-/, '').replace(/\.md\$/, '');

  return { ticketContent, slug, currentSession };
}

function implementTicket(ticketNum) {
  const projectRoot = process.cwd();
  const { ticketContent, slug, currentSession } = getTicket(ticketNum);

  const sessionsDir = path.join(projectRoot, '.work', 'sessions', currentSession);
  const implDir = path.join(
    sessionsDir,
    '03-implement',
    \`\${ticketNum.toString().padStart(2, '0')}-\${slug}\`
  );

  // Create implementation directory
  fs.mkdirSync(implDir, { recursive: true });

  // Create log file
  const logTemplate = \`# Ticket \${ticketNum.toString().padStart(2, '0')} Implementation

**Status:** In Progress

## Commits

(To be filled)

## Test Results

(To be filled)
\`;

  fs.writeFileSync(path.join(implDir, 'commit-log.md'), logTemplate);

  // Print spec
  console.log('\n' + '='.repeat(70));
  console.log(\`TICKET SPEC - \${ticketNum.toString().padStart(2, '0')}\`);
  console.log('='.repeat(70) + '\n');
  console.log(ticketContent);
  console.log('\n' + '='.repeat(70));
  console.log(\`📝 Working directory: \${implDir}\`);
  console.log(\`📄 Log file: \${path.join(implDir, 'commit-log.md')}\`);
  console.log('\nImplement in Claude Code, test locally, save results to commit-log.md');
  console.log('='.repeat(70) + '\n');
}

const ticketNum = process.argv[2];
if (!ticketNum) {
  console.error('Usage: /gps ticket <number>');
  process.exit(1);
}

implementTicket(ticketNum);
"@

$handler3 | Set-Content -Path 'scripts/ticket.js' -Encoding UTF8
```

### Handler 4: `scripts/finish.js`

```powershell
$handler4 = @"
#!/usr/bin/env node

/**
 * /gps finish
 *
 * Generates INDEX.md, marks session complete
 */

const fs = require('fs');
const path = require('path');

function finishSession() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');

  const sessions = fs.readdirSync(sessionsDir).sort().reverse();
  const currentSession = sessions[0];
  const sessionDir = path.join(sessionsDir, currentSession);
  const configPath = path.join(sessionDir, '.session-config.json');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Generate INDEX.md
  const indexContent = \`# Session Summary: \${config.feature_name}

**Session ID:** \${config.session_id}
**Created:** \${config.created_at}
**Status:** ✅ Complete

## Phases

- [x] Phase 1: Grill
  - Resume: [01-grill/resume.md](01-grill/resume.md)

- [x] Phase 2: Plan
  - Plan: [02-plan/plan.md](02-plan/plan.md)
  - Tickets: [02-plan/tickets/](02-plan/tickets/)

- [x] Phase 3: Implement
  - Implementation logs: [03-implement/](03-implement/)

## All Done!

Next: Start a new feature with /gps start <next-feature>
\`;

  fs.writeFileSync(path.join(sessionDir, 'INDEX.md'), indexContent);

  // Update config
  config.status = 'completed';
  config.phases_completed.push('implement');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(\`✅ Session complete: \${config.session_id}\`);
  console.log(\`📋 Summary: \${path.join(sessionDir, 'INDEX.md')}\`);
  console.log(\`\n✨ Ready for next feature. Run: /gps start <new-feature>\`);
}

finishSession();
"@

$handler4 | Set-Content -Path 'scripts/finish.js' -Encoding UTF8
```

### Test Handlers

```powershell
# Test start-session handler
node scripts/start-session.js "test-feature"

# Verify it created the directory
Get-ChildItem -Path '.work/sessions' -Recurse -Directory

# Clean up test
Remove-Item -Path '.work' -Recurse -Force
```

### Commit

```powershell
git add scripts/
git commit -m "feat: add 4 JavaScript handlers for /gps commands"
git push origin main
```

---

## STEP 5: Create Markdown Templates (30 min)

### Template 1: `templates/01-grill-resume.md`

```powershell
$template1 = @"
# Session: {{ feature-name }}

**Date:** {{ timestamp }}
**Status:** Grill phase complete

## Problem Statement

{{ What are we solving? What's broken or missing? }}

## Context & Constraints

- **Current behavior:** {{ How does it work now? }}
- **Pain point:** {{ What's the issue? }}
- **Dependencies:** {{ What must we keep/change? }}
- **Tech stack:** {{ Relevant libraries, frameworks }}

## Success Metrics

- {{ Clear, testable criterion 1 }}
- {{ Criterion 2 }}
- {{ Criterion 3 }}

## Architecture & Approach

{{ Proposed solution at a high level }}

## Assumptions & Trade-offs

{{ What are we assuming? What are we NOT doing? }}
"@

$template1 | Set-Content -Path 'templates/01-grill-resume.md' -Encoding UTF8
```

### Template 2: `templates/02-plan.md`

```powershell
$template2 = @"
# Implementation Plan

**Session:** {{ feature-name }}
**Date:** {{ timestamp }}
**Estimated effort:** {{ N hours/days }}

## Strategy

{{ High-level approach: what's the sequence? Why this order? Any blockers? }}

## Tickets Overview

- **Ticket 1:** {{ What does it accomplish? }}
- **Ticket 2:** {{ }}
- **Ticket 3:** {{ }}
- **Ticket 4:** {{ }}

## Sequencing Rationale

{{ Why this order? Dependencies? }}

## Risks & Mitigation

- **Risk:** {{ }} → **Mitigation:** {{ }}

## Assumptions

- {{ }}
"@

$template2 | Set-Content -Path 'templates/02-plan.md' -Encoding UTF8
```

### Template 3: `templates/02-ticket.md`

```powershell
$template3 = @"
# Ticket {{ N }}: {{ slug }}

**Acceptance Criteria:**
- [ ] {{ Criterion 1 (testable) }}
- [ ] {{ Criterion 2 (testable) }}
- [ ] {{ Criterion 3 (testable) }}

**Files to Touch:**
- \`{{ path }}\`
- \`{{ path }}\`

**Verification Step:**

Run:
\`\`\`bash
{{ command }}
\`\`\`

Expected:
{{ output }}

**Notes:**

{{ Anything Claude Code should know before implementing }}
"@

$template3 | Set-Content -Path 'templates/02-ticket.md' -Encoding UTF8
```

### Template 4: `templates/03-implement-log.md`

```powershell
$template4 = @"
# Ticket {{ N }} Implementation

**Status:** In Progress / ✅ Done

## Commits

- {{ commit hash }} {{ message }}

## Local Test Result

\`\`\`
{{ test output }}
\`\`\`

## Review Notes

{{ Any findings during self-review }}

## Time Spent

{{ ~X hours }}
"@

$template4 | Set-Content -Path 'templates/03-implement-log.md' -Encoding UTF8
```

### Commit

```powershell
git add templates/
git commit -m "docs: add markdown templates for session phases"
git push origin main
```

---

## STEP 6: Write README.md (1 hour)

```powershell
$readmeContent = @"
# grill-plan-ship

A structured workflow plugin for any code project.

**Workflow:** brainstorm (grill) → plan → implement (ship)

**Commands:**
- \`/gps start <feature>\` — Begin a feature
- \`/gps plan\` — Create tickets
- \`/gps ticket <N>\` — Implement ticket
- \`/gps finish\` — Archive session

## Installation

\`\`\`powershell
gh repo clone yourusername/grill-plan-ship \`\$HOME\.claude\skills\grill-plan-ship

# Restart Claude Code
\`\`\`

## Quick Start

\`\`\`
# In any project:
/gps start add-dark-mode

# Brainstorm (run /brainstorming)
# Save output to 01-grill/resume.md

# Plan tickets
/gps plan

# Implement tickets (repeat)
/gps ticket 01
/gps ticket 02
# ... etc

# Finish
/gps finish
\`\`\`

## Session Structure

\`\`\`
.work/sessions/YYYYMMDD__<feature>/
├── 01-grill/           ← Brainstorm output
├── 02-plan/            ← Plan + tickets
├── 03-implement/       ← Implementation logs
├── .session-config.json
└── INDEX.md
\`\`\`

## Features

✅ Language-agnostic (works with any tech stack)
✅ Composable (uses superpowers + unslop)
✅ Documented (every session has INDEX.md)
✅ Versionable (.session-config.json tracks state)

## Example Session

See \`examples/\` for real-world sessions:
- \`geant4-chemistry-refactor/\` — Scientific project
- \`react-form-validation/\` — Frontend project
- \`python-etl-pipeline/\` — Data project

## License

MIT
"@

$readmeContent | Set-Content -Path 'README.md' -Encoding UTF8
```

### Commit

```powershell
git add README.md
git commit -m "docs: add user-facing README"
git push origin main
```

---

## STEP 7: Test with Real Geant4 Session (3–4 hours)

### In your Geant4-DNA Project

```powershell
# Navigate to your Geant4 project
cd C:\path\to\geant4-dna-min

# Start a session
/gps start chemistry-root-to-csv

# Verify the session was created
Get-ChildItem -Path '.work/sessions' -Recurse

# Should show: 2026-09-16__chemistry-root-to-csv/
```

### Phase 1: Grill

```powershell
# In Claude Code, run:
# /brainstorming

# Answer Claude's questions about:
# - What's the problem?
# - What's success?
# - Constraints?
# - Current architecture?

# After brainstorming, copy the output into the resume file:
# .work/sessions/2026-09-16__chemistry-root-to-csv/01-grill/resume.md
```

### Phase 2: Plan

```powershell
# In Claude Code, run:
# /gps plan

# Then run:
# /writing-plans

# Claude generates your actual tickets
# Copy them into: .work/sessions/2026-09-16__chemistry-root-to-csv/02-plan/tickets/

# Then run:
# /unslop /unslop rewrite

# On each ticket to make language crisp
```

### Phase 3: Implement Tickets

```powershell
# Ticket 1
# /gps ticket 01

# Claude Code writes the implementation
# Test locally:
ctest --verbose

# Save results to:
# .work/sessions/2026-09-16__chemistry-root-to-csv/03-implement/01-csv-writer/commit-log.md

# Ticket 2
# /gps ticket 02
# ... repeat
```

### Phase 4: Finish

```powershell
# In Claude Code:
# /gps finish

# Generates INDEX.md
# Session complete!
```

### Verify Everything Worked

```powershell
# Check the final structure
Get-ChildItem -Path '.work/sessions/2026-09-16__chemistry-root-to-csv' -Recurse -File

# Should show all phases with files:
# 01-grill/resume.md
# 02-plan/plan.md
# 02-plan/tickets/*.md
# 03-implement/*/commit-log.md
# INDEX.md
# .session-config.json
```

---

## Quick PowerShell Reference

### Useful Commands

```powershell
# Navigate directories
Set-Location C:\path\to\project
cd C:\path\to\project  # Short form

# Create files and directories
New-Item -ItemType File -Path 'filename.txt'
New-Item -ItemType Directory -Path 'folder-name'

# Write content to files
$content | Set-Content -Path 'file.txt' -Encoding UTF8
Get-Content -Path 'file.txt'

# Work with Git
git add .
git commit -m "message"
git push origin main
git log --oneline

# List contents
Get-ChildItem
ls  # Short form
Get-ChildItem -Recurse  # Recursive

# Remove items
Remove-Item -Path 'path' -Recurse -Force
```

---

## Troubleshooting

### "Node.js not found"
```powershell
# Check if Node.js is installed
node --version
npm --version

# If not, install from nodejs.org
```

### "GitHub CLI not found"
```powershell
# Check if GitHub CLI is installed
gh --version

# If not, install from cli.github.com or:
winget install GitHub.cli
```

### "Permission denied on script execution"
```powershell
# PowerShell may block script execution
# Run this once:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Then retry your command
```

### "Files not created"
```powershell
# Verify you're in the right directory
Get-Location

# Verify the directory exists
Test-Path '.\.work\sessions'

# Create it manually if needed:
New-Item -ItemType Directory -Path '.work/sessions' -Force
```

---

## Summary

**Total Build Time:** ~8 hours (doable in 1–2 weeks)

✅ Step 1: GitHub repo created (15 min)
✅ Step 2: Directory structure (10 min)
✅ Step 3: SKILL.md written (1.5 hours)
✅ Step 4: 4 handlers created (2 hours)
✅ Step 5: Templates created (30 min)
✅ Step 6: README written (1 hour)
✅ Step 7: Real session tested (3–4 hours)

**Next:** Follow these steps in order. After Step 2, you can test handlers. After Step 6, test with Geant4.

Let me know which step you're on! 🚀
