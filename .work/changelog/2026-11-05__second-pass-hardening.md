---
bump: patch
floor: patch
---
### Fixed

- Refuse unrelated tracked changes at finish, preserve partial staging, treat ticket paths literally, and block GPS publication after a commit escapes its reviewed scope.
- Recover interrupted finish operations through a local journal, distinguish failed PR lookup from no PR, and reconcile issue comments before retrying.
- Preserve phase and completion records when writes fail; reject malformed session objects and incomplete verification records before committing.
- Require explicit Jev consent even when credentials or legacy enablement exist, and apply request timeouts through response parsing.
- Preserve explicit model and effort requirements, stop parent and child recovery after permission denial, require actual high-risk ticket approval under auto, and inspect saved scope when resuming Small work.

### Changed

- Record the second-pass audit, installed-plugin host evidence, migration behavior and remaining recovery limitations.
