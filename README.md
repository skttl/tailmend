# Tailmend

Normalize, deduplicate and sort static Tailwind CSS classes in `.cshtml` and `.razor` files, without formatting the rest of the view.

Tailmend uses the official Tailwind CSS language server for canonical class suggestions and conflict diagnostics. Class sorting uses a JavaScript adaptation of [Theron Wang's Visual Studio sorter](https://github.com/theron-wang/Tailwind-CSS-for-Visual-Studio). It leaves distinct conflicting classes in place and reports them for manual review.

```html
<!-- Before -->
<div class="text-white mb-[12px] flex-shrink-0 p-4 bg-red-500"></div>

<!-- After -->
<div class="mb-3 shrink-0 bg-red-500 p-4 text-white"></div>
```

Tailmend is experimental. It uses a conservative lexical scanner rather than a full Razor parser. Review changes before committing them.

## Requirements

- Node.js 22 or later.
- Tailwind CSS 4 installed in the project being checked.
- An explicit Tailwind CSS entrypoint, such as `styles/tailwind.css` containing `@import "tailwindcss";`.

Tailwind CSS 3 and automatic CSS entrypoint discovery are not supported.

## Install and run

Install it in your Tailwind project:

```sh
npm install --save-dev tailmend
npx tailmend --config styles/tailwind.css --check "**/*.{razor,cshtml}"
```

Use `--fix` to write changes:

```sh
npx tailmend --config styles/tailwind.css --fix "Views/**/*.cshtml"
```

With neither `--check` nor `--fix`, Tailmend performs a read-only check. Quote globs so Tailmend, rather than your shell, expands them.

Checks show the language server's canonical suggestions and a before/after preview for each changed class list, with the source file, line and column. This includes changes caused by sorting and duplicate removal.

For repeatable local and CI checks, add package scripts:

```json
{
  "scripts": {
    "lint:classes": "tailmend --config styles/tailwind.css --check \"**/*.{razor,cshtml}\"",
    "fix:classes": "tailmend --config styles/tailwind.css --fix \"**/*.{razor,cshtml}\""
  }
}
```

Run `npm run lint:classes` after `npm ci` in CI.

## What it changes

- Applies canonical class suggestions from the official language server.
- Removes duplicate class names, including duplicates exposed by canonicalization.
- Sorts classes by variant count, variant order and utility order using the Visual Studio sorter's data. Equal-ranked utilities retain their input order.
- Preserves surrounding markup, UTF-8 BOM and line endings. Existing whitespace separators in multiline class lists are preserved where possible.

For example, `[display:flex] flex` becomes `flex`. Both `flex grid` and `grid flex` retain both classes and produce a conflict diagnostic. Tailmend does not pick a winning class or apply conflict quickfixes.

For sorting, `md:hover:p-4 sm:p-4 hover:focus:p-4` becomes `sm:p-4 hover:focus:p-4 md:hover:p-4`. The single-variant class comes first. Project theme values, prefixes and custom breakpoint sizes are loaded from the selected CSS entrypoint. Bundled order data covers Tailwind 4.0–4.3; other Tailwind 4 minor versions use the 4.0 base data.

## Supported syntax and limits

The scanner recognizes static, quoted `class` and `className` attributes. It also recognizes whole string literals in `:class`, `v-bind:class`, `x-bind:class`, `[class]`, `[ngClass]` and `class:list` bindings. Tags containing `@` are skipped entirely, even when some of their classes are static. Razor and HTML comments, dedicated C# blocks, and script/style contents are excluded.

Custom globs can select other file extensions, including `.html`. Simple HTML class attributes can be extracted, but the scanner still follows Razor rules. These attribute aliases do not provide full React, Vue, Alpine, Angular or Astro parsing. Dynamic bindings, runtime class composition and classes returned by C# are not evaluated.

Pixel/rem normalization assumes a 16px root font size. Set `--root-font-size` to match your project. Canonicalization and duplicate removal assume class names are utility tokens; custom CSS selectors, exact-value attribute selectors or JavaScript hooks may depend on their original spelling or order.

A clean result covers only extracted attributes. Tailmend reports skipped tags and fails when the entire selection has no supported attributes. Writes are validated before they start, but a write failure can leave some files changed.

See the [CLI reference and parser limitations](docs/usage.md) for all options and error handling.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Extracted attributes are clean, or fixes completed without remaining diagnostics. |
| `1` | A check found changes, or manual diagnostics remain after checking/fixing. |
| `2` | The check could not complete, including invalid input or no supported attributes. |

## Development and releases

```sh
npm ci
npm test
npm run check:package
```

`npm test` exercises normalization, sorting, duplicate removal, Razor exclusions, CRLF preservation, idempotence, retained conflicts and failure exit codes. `check:package` installs the actual npm tarball into an isolated project and checks the installed CLI.

See [contributing](CONTRIBUTING.md), [release instructions](docs/releasing.md) and the [changelog](CHANGELOG.md).

## License

[MIT](LICENSE). Sorting includes code and data adapted from Theron Wang's MIT-licensed extension; see [source and license details](vendor/visual-studio/README.md). Tailmend is an independent project and is not affiliated with Tailwind Labs.
