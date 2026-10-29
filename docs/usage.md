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

Tailmend applies the official language server's canonical suggestions, deduplicates exact tokens, removes fully overridden utilities and sorts the survivors locally using a JavaScript adaptation of Theron Wang's Visual Studio sorter. With default Tailwind CSS, both `flex grid` and `grid flex` become `grid`; `flex md:grid` retains both utilities.

Override analysis compiles CSS in memory with the target project's Tailwind and selected entrypoint. A class is removed only when every supported declaration loses to retained utilities in the same selector, media/supports/container and layer context. Actual generated CSS order and `!important` determine precedence. Class-list order and the presentation sorter do not determine which utility wins. Partial overlap such as `p-4 px-2` is retained, as are different responsive or interaction states.

The analysis retains unknown utilities, unsupported declaration syntax, custom-property writes, duplicate fallback declarations and remaining arbitrary-value utilities. It also protects class names referenced by other selectors in the generated stylesheet, including utilities from other extracted attributes in the selected files. Stylesheets containing CSS scopes or class attribute selectors conservatively disable removal; anonymous-layer and unsupported at-rule contexts are excluded. It compares exact property names and does not expand shorthands or prove equivalence across different conditions. Other stylesheets, unselected/dynamic templates, JavaScript hooks and browser-specific value support are outside its scope. The existing assumption that class names are utility tokens still applies. No output CSS file is needed.

Sorting groups surviving classes by variant count, then the highest-ranked variant, then utility order. Upstream's special grouping for leading `group-` variants is retained. Unknown utilities come first within an otherwise equal variant group. Equal ranks preserve input order. This differs from the language server's sorting; an overridden utility such as `p-4` in `p-8 p-4` is removed before sorting.

The sorter loads the target project's Tailwind 4 design system for CSS imports, JS/TS configuration, prefixes, custom colors, spacing, breakpoints and containers. Colons inside arbitrary CSS values do not count as variant separators. Named container variants use configured sizes. The bundled order tables cover Tailwind 4.0–4.3; other Tailwind 4 minor versions use the 4.0 base tables. New utilities absent from those tables sort as unknown. Source revision and adaptations are recorded in `vendor/visual-studio/README.md`.

Output is grouped under each source path, relative to `--cwd`. Line numbers point to the start of the original extracted class value, including for multiline attributes. The final summary reports selected files, changed files, manual findings and skipped dynamic/unsupported tags.

Both `--check` and `--fix` explain every transformation in aligned rows. `replace` shows a canonical replacement, `remove` identifies the class and whether it was overridden or duplicated, `sort` indicates reordered classes, and `review` marks a remaining diagnostic. Conflict diagnostics are refreshed after removal so resolved conflicts do not count as manual findings. In check mode these are proposed changes; fix prints them after all writes succeed. The file's formatting is preserved when fixing.

```text
Tailmend v0.3.0  fix

Views/Card.cshtml
   26  sort     classes
   28  remove   block (overridden)
   32  replace  pb-[.75rem] -> pb-3
   35  remove   p-4 (duplicate)

1 file fixed / 1 checked
0 manual findings
```

File headings are bold in a terminal, with subtle colors for actions and replacements.
Redirected output is plain text. Set `NO_COLOR=1` to disable colors or `FORCE_COLOR=1`
to explicitly enable them. Blank lines separate files, and the summary keeps changed
files, manual findings and skipped tags on separate lines.

Multiple sorting changes are combined into one `sort` entry per file, with unique
line numbers in ascending order to the right: `sort  classes on lines 52, 55, 74`.
The action column stays aligned with replacements and removals. Long number lists
wrap at the terminal width with hanging indentation; plain logs use 100 columns.
The entry appears at the first sorting change. Other changes remain individual rows.

Automatically fixable changes do not count as manual findings. Remaining conflicts still produce exit 1 after fixing, alongside explanations of changes that were applied.

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
- **CSS does not generate Tailwind utilities:** select the full input stylesheet containing `@import "tailwindcss"` or `@tailwind utilities`. A partial file containing only `@theme` cannot establish generated utility precedence. For a setup with `main.css` importing `_theme.css`, use `--config path/to/main.css`.
- **Exit 1 after fixing:** review the printed diagnostics. Conflicts that cannot be proved fully overridden require manual resolution.
