## Status
DONE

## Commits
bee22c4b docs: vendor markdown templates used by gps scripts

## Verification
All four template files exist and match the brief exactly:

```
ls -la templates/
total 18
-rw-r--r-- 1 rtonneau 1049089 781 Sep 16 15:06 01-grill-resume.md
-rw-r--r-- 1 rtonneau 1049089 563 Sep 16 15:06 02-plan.md
-rw-r--r-- 1 rtonneau 1049089 363 Sep 16 15:06 02-ticket.md
-rw-r--r-- 1 rtonneau 1049089 325 Sep 16 15:06 03-implement-log.md
```

Spot-checked `01-grill-resume.md` — starts with `# Session: {{ feature-name }}` and contains all human-input placeholders (e.g., `{{ What are we solving? }}`) and framework placeholders (e.g., `{{ feature-name }}`, `{{ timestamp }}`), all intact and unsubstituted. All four files confirmed present in git index and on disk.

## Concerns
None. Templates are vendored and ready for Task 2 (template loader) and Task 3 (runtime substitution in handlers).
