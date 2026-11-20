---
bump: patch
floor: patch
---
- When merging a stacked session's branch into its open base session deletes `.current-session`, the next gps command in that checkout restores the pointer to the one unfinished session on the checked-out branch, with a warning, instead of failing with "No current session is selected" (#62).
