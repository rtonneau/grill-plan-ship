# /gps help [command | question]

**When:** you don't know what to do next, what a command does, or how the workflow fits together. Read-only.

1. Bare `/gps help`, or a command name (`/gps help ship`): `help.js [command]`. Relay it as is, ending with its `Next:` line.
2. Anything else is a question (`/gps help how do I resume tomorrow?`): run `help.js` for the current phase and next command, read the references file of each command the question touches, then answer in a few lines. Name the exact command(s) to run and why; end with a `Next:` line taken from `help.js` unless the answer points elsewhere. For "why did X fail", run `status.js` too.
3. Answer from those files and the scripts' output, not from memory: steps and flags change between versions. If they don't cover it, say so.
4. Never run a command that changes state here: help only explains. The user runs the command you name.

**Examples:** `/gps help` · `/gps help ship` · `/gps help what does auto skip?`
