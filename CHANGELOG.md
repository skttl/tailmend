# Changelog

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
