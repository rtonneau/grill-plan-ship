---
bump: patch
floor: patch
---
- **The Jev tests no longer open a local port**, so running `npm test` on Windows no longer triggers the firewall prompt for node.js. The `GPS_JEV_BASE_URL` override is removed: the Jev endpoint is fixed.
