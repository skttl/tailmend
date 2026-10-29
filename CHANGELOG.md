# Changelog

## 0.3.0 - 2026-10-29

- Make terminal reports easier to scan with spaced file sections, aligned line numbers, action labels, mode-specific summaries and optional terminal colors.
- Group sorting changes per file, wrap long source-line lists and show the package version in the report heading.
- Reject theme-only CSS configuration with an actionable entrypoint error instead of silently skipping conflict removal.
- Remove fully overridden utilities using generated project CSS, respecting important modifiers and identical conditional contexts while retaining partial overlaps and unsupported cases.
- Refresh conflict diagnostics after automatic removal.
- Explain replacements, duplicate and conflict removals, sorting and remaining diagnostics by file and original line in both check and fix output.

## 0.2.0 - 2026-10-29

- Replace language-server class sorting with a JavaScript adaptation of Theron Wang's Visual Studio sorter, including project theme metadata and stable equal ranks.
- Show original language-server canonical suggestions and per-attribute class-list previews in read-only checks, including sorting and duplicate removal.

## 0.1.0

Initial experimental release.

- Check and fix static `class` attributes in `.cshtml` and `.razor` files.
- Apply official Tailwind CSS 4 canonical suggestions and class sorting.
- Remove duplicate utilities while retaining distinct conflicts for manual review.
- Skip dynamic Razor tags and preserve surrounding markup and line endings.
- Support explicit CSS entrypoints, target directories, file globs and root font sizes.
