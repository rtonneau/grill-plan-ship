---
bump: minor
floor: minor
---
- A full `/gps ship` now runs `/gps finish` by itself once every ticket is done. Set `ship.autoFinish` to `false` in `.work/gps-config.json` to stop after the last ticket instead; `/gps config` shows the setting.
- A finish run by `/gps ship` or `/gps auto` asks nothing: it keeps the issue open and offers no session switch. A typed `/gps finish` still asks both questions.
- `/gps auto ship` now finishes the session too while `ship.autoFinish` is on.
