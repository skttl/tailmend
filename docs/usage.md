# CLI reference

```sh
tailmend --config <tailwind.css> [--cwd <project>] [--check | --fix] [globs...]
```

Run a locally installed CLI with `npx tailmend` or from an npm script. Node.js 22+ and a target project with Tailwind CSS 4 installed are required.

| Option | Meaning |
| --- | --- |
| `--config <file>` | Required Tailwind CSS entrypoint, relative to `--cwd`. |
| `--cwd <directory>` | Target project directory. Defaults to the current directory. |
| `--check` | Report required changes without writing. This is also the default. |
| `--fix` | Apply supported changes and report any remaining diagnostics. |
| `--root-font-size <number>` | Positive, finite root font size in pixels used for canonicalization. Defaults to `16`. |
| `--help`, `-h` | Print usage. |
| `[globs...]` | Quoted patterns relative to `--cwd`. Defaults to `**/*.{razor,cshtml}`. |

`--check` and `--fix` cannot be combined. Quote paths containing spaces. `node_modules`, `.git`, `bin` and `obj` directories are excluded.

## Examples

Check a different project:

```sh
npx tailmend --cwd ../my-app --config wwwroot/css/tailwind.css --check "Views/**/*.cshtml"
```

Check several directories:

```sh
npx tailmend --config styles/tailwind.css --check "Views/**/*.cshtml" "Components/**/*.razor"
```

Use a project root font size of 20px:

```sh
npx tailmend --config styles/tailwind.css --root-font-size 20 --check
```

Select simple HTML explicitly:

```sh
npx tailmend --config styles/tailwind.css --check "public/**/*.html"
```

Selecting a file extension does not add a parser for that language. HTML uses the same Razor-aware scanner; other template languages have no support guarantee.

For multiple CSS entrypoints, run separate commands over the corresponding file sets. A single invocation uses one entrypoint and does not determine which stylesheet a view loads.

## Extraction boundaries

Attributes named exactly `class` or `className`, with single- or double-quoted values, are extracted. The binding aliases `:class`, `v-bind:class`, `x-bind:class`, `[class]`, `[ngClass]` and `class:list` accept only a whole string literal inside the quoted attribute. The inner literal may use single quotes, double quotes or backticks, but escapes, concatenation and interpolated template literals are excluded. Tailmend sends their values to the language server as virtual HTML documents. Those virtual files are never written to disk.

- A tag containing `@` is skipped in full, including static attributes on that tag.
- HTML comments, Razor comments, dedicated `@code`, `@functions` and `@{...}` blocks, and script/style contents are excluded.
- Attribute values containing `&`, `<` or double quotes are skipped because they cannot be copied safely into the virtual attributes.
- Unquoted attributes and computed class lists are not supported. JSX expression containers, object/array bindings and conditional bindings are not evaluated. Recognizing an attribute alias does not provide a complete parser for its framework.
- Ordinary interpolated C# strings are traversed only to find expression boundaries. Their contents are not checked.
- Unsupported raw C# strings inside scanned expressions and malformed scanned structures cause exit 2 before writing.

The scanner does not execute Razor, resolve components or Tag Helpers, or inspect runtime values. It is not a complete Razor grammar. Review proposed edits for unfamiliar syntax.

## Changes and diagnostics

Tailmend applies the official language server's canonical suggestions, deduplicates exact tokens and sorts them locally using a JavaScript adaptation of Theron Wang's Visual Studio sorter. Distinct conflicting classes remain present. `flex grid` therefore remains a manual finding, even after `--fix`; `flex md:grid` retains both utilities.

Sorting groups classes by variant count, then the highest-ranked variant, then utility order. Upstream's special grouping for leading `group-` variants is retained. Unknown utilities come first within an otherwise equal variant group. Equal ranks preserve input order, so `p-8 p-4` stays in that order. This differs from the language server's sorting.

The sorter loads the target project's Tailwind 4 design system for CSS imports, JS/TS configuration, prefixes, custom colors, spacing, breakpoints and containers. Colons inside arbitrary CSS values do not count as variant separators. Named container variants use configured sizes. The bundled order tables cover Tailwind 4.0–4.3; other Tailwind 4 minor versions use the 4.0 base tables. New utilities absent from those tables sort as unknown. Source revision and adaptations are recorded in `vendor/visual-studio/README.md`.

Diagnostics point to the start of the original class attribute. `CHANGE` identifies a file that would change; `FIX` identifies a prepared change in fix mode. The final summary reports selected files, changed files, manual findings and skipped dynamic/unsupported tags. A `FIX` line alone does not confirm a successful write; check the exit status.

Read-only checks print the language server's original canonical suggestions, followed by a `classList` before/after for each changed attribute. The before/after also covers duplicate removal and sorting, which are separate from server diagnostics. Whitespace is normalized in this preview; the file's formatting is preserved when fixing.

```text
View.cshtml:2:13 classList: "p-4 p-4" -> "p-4"
CHANGE View.cshtml
```

Automatically fixable suggestions do not count as manual findings. `--fix` prints only remaining diagnostics and file summaries, rather than suggestions it has already applied.

Canonicalization assumes utility tokens can be replaced without affecting application hooks or custom selectors. Root font size is a configured assumption, not a browser measurement.

## Writes

Tailmend computes all changes before writing and re-reads every file to be changed to detect edits made during the scan. If validation or scanning fails, writing does not start. A filesystem error during writes can leave earlier files written; there is no multi-file transaction. Keep changes under version control and review the diff.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Extracted attributes need no changes and have no remaining diagnostics, or fixes completed without remaining diagnostics. |
| `1` | A read-only check found changes, or manual diagnostics remain after checking/fixing. |
| `2` | Invalid arguments, missing files/configuration/dependencies, unsupported syntax, server failure, write failure or no supported attributes. |

## Troubleshooting

- **No matching files:** check your quoted globs and `--cwd`. Patterns are relative to that directory.
- **No supported static class attributes:** selected files contain no extractable attributes. Check the skipped-tag count and extraction boundaries above.
- **Tailwind cannot be found:** install Tailwind CSS 4 in the target project. Tailmend resolves that project's installation, not a global one.
- **No active Tailwind project / no diagnostics:** verify the CSS entrypoint exists, imports Tailwind and belongs to the target project.
- **Exit 1 after fixing:** review the printed diagnostics. Distinct conflicting classes require manual resolution.
