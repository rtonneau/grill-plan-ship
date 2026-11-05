# 0013: The size of the work sets the process

## Context

Every change went through a grill, and the planned path added gates for design approval, ticket approval, ship mode and hints. The small-change path existed but sat at the end of the grill reference, behind its own "Ready for me to implement this?". In a live run a one-line comment stopped there, with no code written.

## Decision

- `/gps start` sizes the work and says so in one line; the user can overrule it.
- **Small** (one clear, low-risk change with nothing to decide) skips the grill: a short resume, implement, verify, commit, finish.
- **Standard** has one design gate, then runs. Typing `/gps ship` is the go-ahead for the tickets.
- **High-risk** (data migration, security, public API, hard to undo) also settles rollback and asks for ticket approval.
- Facts, implementation choices and recovery are the agent's. Product decisions, ambiguous scope, and irreversible or outward actions not already requested stay with the user.

## Alternatives rejected

- A `--size` flag or stored size: the agent can judge it, and the user can correct it in a sentence.
- A separate "quick" command: one more thing to learn, and the session records would differ for no gain.
- Removing the design gate: it is where the user's product control lives.

## Consequences

A wrong "small" call could skip a conversation the user wanted, so the size is stated up front, and small work escalates when it grows a decision. A full `/gps ship` still pushes through its chained finish (decision 0011).
