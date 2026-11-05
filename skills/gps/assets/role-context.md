# GPS {{ role }}: ticket {{ number }} ({{ slug }})

- Repository: {{ projectRoot }}
- Spec: {{ ticketPath }}
- Commit log: {{ commitLogPath }}
- Scratch dir: {{ scratchDir }} (build/run/test artifacts belong here; preserve cited output in evidence/)

Read the ticket and applicable project conventions (AGENTS.md, CLAUDE.md and scoped instructions). The repository and these paths are your context; do not assume access to the parent's conversation.
Do not commit, stage, change session state, run ticket/delivery scripts, or delegate further. The parent owns coordination, acceptance, Git writes and state transitions.
On a permission or sandbox denial, stop and report BLOCKED with the exact denied action; never retry it through another shell, tool or agent.
