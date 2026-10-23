// skills/idea/scripts/lib/guard.js
//
// Shared helpers for every idea script: the error types the CLI contract
// maps to exit codes (see cli.js), and a text write that never silently
// corrupts state. Idea files are markdown, not JSON, so there is no
// writeJsonAtomic here — just writeTextAtomic.

const fs = require('fs');

// A failed precondition or validation: exit 1, "❌ message" + hint.
class IdeaError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'IdeaError';
    this.hint = hint || null;
  }
}

// Bad arguments: exit 2; the hint defaults to the script's usage line.
class UsageError extends IdeaError {
  constructor(message, hint) {
    super(message, hint);
    this.name = 'UsageError';
  }
}

// Replaces a file via a sibling temp file. Windows workspace sandboxes can
// allow writes while denying replacement-by-rename; only for that permission
// failure, fall back to writing the already-serialized content directly.
function replaceFile(filePath, content, io = fs) {
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tmpPath = `${filePath}.tmp-${nonce}`;
  io.writeFileSync(tmpPath, content);
  try {
    io.renameSync(tmpPath, filePath);
  } catch (err) {
    if (!err || !['EPERM', 'EACCES'].includes(err.code)) throw err;
    io.writeFileSync(filePath, content);
  } finally {
    if (io.existsSync(tmpPath)) io.unlinkSync(tmpPath);
  }
}

// Writes text through replaceFile; interrupted normal writes remain atomic.
function writeTextAtomic(filePath, text, io = fs) {
  replaceFile(filePath, text, io);
}

module.exports = {
  IdeaError,
  UsageError,
  replaceFile,
  writeTextAtomic,
};
