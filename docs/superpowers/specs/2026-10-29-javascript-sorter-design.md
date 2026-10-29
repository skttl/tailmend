# JavaScript class sorter

Replace the language server's sortSelection call with a JavaScript adaptation of
Theron Wang's Visual Studio sorter, as requested and selected by the user.
Keep language-server canonicalization, conflict diagnostics, extraction and writes.

The chosen approach vendors the MIT-licensed Tailwind 4 class/variant order data
and ports the stable ordering by variant count, highest variant rank and utility
rank. The alternative, invoking twsort, would require distributing another runtime
or platform-specific executable. Tailmend remains a Node.js 22+ CLI.

Load project metadata with the target project's Tailwind 4 design system, including
CSS imports, JS/TS configuration, prefix, theme colors, spacing and breakpoint and
container sizes. Resolve imports with enhanced-resolve and JS/TS modules with jiti.
Never use the design system's getClassOrder as the sorting engine.

Keep unknown utilities stable within their variant group. Parse variant separators
outside brackets, parentheses and quotes, so arbitrary CSS values stay intact.
Preserve duplicate removal as a separate existing step. Retain upstream attribution,
license and source revision. Use the matching upstream minor-version data when
available and document the base-data fallback for other Tailwind 4 versions.

Verify upstream ordering, stable ties, stacked and arbitrary variants, important
modifiers, negatives, fractions, custom themes, prefixes and breakpoint sizes.
Run CLI regressions and isolated npm package installation. Preserve existing
uncommitted changes. No release, push or commit is part of this request.
