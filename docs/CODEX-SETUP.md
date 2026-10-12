# GPS on Windows Codex

Scope: Windows CLI and desktop. CLI installation below passed on 2026-10-12 with Codex CLI 0.162.1, Node 22.14.0 and Git 2.39.0.windows.2. This is a tested client version, not a proven minimum. CLI skill discovery/help/status also passed. Desktop discovery and execution remain unverified; see [smoke results](CODEX-SMOKE-TEST.md).

Install Node.js 20+ and Git. Authenticated `gh` is needed only for GitHub features. Use the reviewed local checkout to include uncommitted changes; a remote install cannot include them. Keep the portable root `plugin.json` and existing `.claude-plugin/marketplace.json` together.

## CLI installation

Replace paths below. Run each command separately and stop on a nonzero exit.

```powershell
codex --version
node --version
git --version
codex plugin marketplace add 'C:\path\to\grill-plan-ship' --json
codex plugin marketplace list --json
codex plugin list --marketplace grill-plan-ship --available --json
codex plugin add 'grill-plan-ship@grill-plan-ship' --json
codex plugin list --marketplace grill-plan-ship --json
codex -C 'C:\path\to\gps-smoke-project'
```

Verify the marketplace root is your checkout; the available plugin is GPS before installation; then the installed plugin is enabled and its version matches `plugin.json`. The tested install returned `C:\Users\rtonneau\.codex\plugins\cache\grill-plan-ship\grill-plan-ship\2.7.1`. Compare installed script/skill hashes with the checkout, since version equality alone cannot identify dirty changes.

Inside the Codex conversation, enter `$gps help`, then `$gps status`. These are conversation commands, not PowerShell commands. They should discover the skill and run its scripts against the selected project without creating a session. Scripts use absolute installed paths; quote paths containing spaces, for example `node 'C:\path with spaces\skills\gps\scripts\help.js' --help`, from the target project's root.

Local installs use a cached copy. On the tested CLI, rerun `codex plugin add 'grill-plan-ship@grill-plan-ship' --json` after editing the checkout: this refreshed the installed files at the same version, verified by comparing all skill/agent resources. Reopen the client and compare hashes again. For other versions inspect the supported installer help before refreshing. Do not delete cache directories manually. `codex plugin marketplace upgrade grill-plan-ship --json` refreshes Git marketplace snapshots; it is not a local-cache refresh command. Refresh/reinstall behavior is separately recorded in the smoke results.

## Desktop discovery (verification pending)

Reopen the desktop client, select the smoke project, and inspect the Plugins Directory for the `grill-plan-ship` source and plugin. Enable it if required, then enter `$gps help`. Confirm its installed files match the CLI checkout. CLI installation does not prove desktop visibility or shared configuration. Record the actual desktop application/version and route before claiming support.

The [official packaging guide](https://developers.openai.com/plugins/build/plugins) documents legacy `.claude-plugin/marketplace.json` discovery as well as repo-scoped `.agents/plugins/marketplace.json`. If the existing source is not visible, use the latter in the smoke project, pointing at an actual copy under `plugins/grill-plan-ship`:

```json
{
  "name": "gps-local",
  "interface": { "displayName": "GPS local" },
  "plugins": [{
    "name": "grill-plan-ship",
    "source": { "source": "local", "path": "./plugins/grill-plan-ship" },
    "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
    "category": "Productivity"
  }]
}
```

`source.path` is relative to the marketplace root, not `.agents/plugins/`. Copy the reviewed plugin files there, register that project root with `codex plugin marketplace add 'C:\path\to\gps-smoke-project' --json`, inspect availability with `--marketplace gps-local`, and install `grill-plan-ship@gps-local`. Reopen and verify discovery. This fallback has not been exercised here; do not mix its selector with the original route or add a guessed `.codex-plugin/marketplace.json`.

## Delegation setup

Use `/gps config` (as `$gps config` in Codex) to inspect declared delegation settings. README mappings contain placeholders, not recommended production model IDs. Inspect the current client's actual model and effort support before supplying mappings. Queue preflight validates those declarations; the host must separately verify tool/account capabilities before starting a ticket.

For a mapped model requesting inherited effort, supply `--parent-effort` only from authoritative current runtime context. Unknown effort requires an explicit supported effort choice. Native `inherit/inherit` requires no mapping and omits both overrides, leaving resolution to the host. Inline execution requires no mappings. These are explicit user choices; GPS never silently falls back to either.

Command syntax was checked against local help and the [official CLI reference](https://learn.chatgpt.com/docs/cli/reference). Successful installation alone does not establish skill discovery or live delegation.
