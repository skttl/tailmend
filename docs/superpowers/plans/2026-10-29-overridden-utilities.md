# Overridden utility removal implementation plan

**Goal:** Remove provably overridden utilities using generated project CSS.
**Spec:** ../specs/2026-10-29-overridden-utilities-design.md
**Execution:** In this session, on codex/remove-overridden-utilities.

## Tasks

- [x] Write failing real-compiler tests for block/flex in both input orders,
  equal responsive/state contexts, important modifiers, retained partial overlaps,
  unknown classes, unsafe CSS and custom theme/prefix configuration.
- [x] Extract project loading from sorter.mjs into tailwind.mjs. Add a focused
  conflicts.mjs resolver backed by generated CSS and a real CSS parser. Use
  conservative declaration coverage, ignoring unsupported classes.
- [x] Extend CLI tests, observe old behavior fail, integrate resolution after
  canonicalization and refresh diagnostics after removal.
- [x] Update published files, installed-package regression and user documentation.
- [x] Implement the user's added grouped change explanations for both check and
  fix. Verify every reason, original line numbers, read-only writes and clean reruns.
- [x] Run npm test and npm run check:package; request a separate code review,
  fix concrete findings and rerun affected checks.

## Review focus

Compiler ordering must win over markup/sorter order. Keep declarations contributing
only part of a class, important winners, conditionally applicable rules, variable
side effects, unsupported CSS and unresolved conflicts. Shared project loading must
retain CSS imports and TS configuration. Never report a resolved diagnostic as
remaining, and never write on a read-only check or before all files are validated.

## Verification and review

2026-10-29: `npm test`, `npm run check:package` and `git diff --check` passed.
The old CLI failed the conflict-removal and grouped-output regressions before
integration. Both modes now explain canonical, duplicate, conflict and sorting
changes; clean reruns have no change lines, and check preserves source files.

Separate review found selector dependencies through @scope and class attribute
selectors, and anonymous-layer cascade identities. Added failing regressions and
conservative exclusions. Final review found escaped class attribute names; that
case also failed before its fix and passes in the final suite. No unresolved
review findings. Changes remain local on codex/remove-overridden-utilities.

Follow-up verification: theme-only configuration now produces an actionable error
instead of silently omitting utility generation. Confirmed a real project's full
CSS entrypoint generates the expected flex/grid and lg:block/lg:grid winners; its
views were checked read-only. A subsequent presentation refinement adds reporter.mjs
with aligned actions, file spacing, terminal colors and plain redirected output.
Reporter checks, the full suite and installed-package checks passed. The final
minimum line-column width adjustment passed the focused reporter checks.
