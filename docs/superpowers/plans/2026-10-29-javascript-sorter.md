# JavaScript sorter implementation plan

> Execute in this session with tests first, preserving existing local changes.

**Goal:** Use the Visual Studio sorter's ordering in Tailmend's Node.js CLI.

**Architecture:** Vendor upstream Tailwind 4 order data with provenance. A focused
sorter loads the project's design system for metadata and ranks classes locally.
The CLI retains the language server for normalization and diagnostics.

**Tech stack:** Node.js 22+ ES modules, project Tailwind 4, enhanced-resolve, jiti.

**Spec:** ../specs/2026-10-29-javascript-sorter-design.md

## Constraints and review focus

Keep the Razor scanner, diagnostics, preview and safe-write behavior intact.
Do not require .NET. Package all runtime data and attribution. Verify bracketed
colons, stable ties, custom CSS imports, prefixed classes and minor-version data.

## Task 1: Local sorting engine

- [x] Add sorter-check.mjs with literal order expectations, using the project CSS
  configuration and upstream-inspired examples. Run it and observe failure.
- [x] Add sorter.mjs exporting createSorter(cwd, config, version), returning a
  function from class-list string to sorted class-list string.
- [x] Vendor class and variant JSON files and the MIT license under vendor/.
- [x] Load project metadata, apply version data and stable sort ranks. Verify
  focused tests for utility, variant and theme behavior.

## Task 2: CLI and package integration

- [x] Update the end-to-end fixture with an ordering that differs from the old
  engine, observe failure, then replace sortSelection with the local sorter.
- [x] Include the sorter and vendor files in package.json and package checks.
- [x] Document the ordering source, maintenance and fallback behavior. Update
  changelog while preserving existing entries.
- [x] Run npm test and npm run check:package, inspect the full diff and report.

## Verification

2026-10-29: `npm test` and `npm run check:package` passed after review fixes.
A separate reviewer found missing special-color ranks and inconsistent prefix
handling for static utilities. Both were reproduced by failing tests and fixed.
The CLI regression failed against the original language-server sortSelection
implementation and passed with the JavaScript sorter. No commits or release made.
