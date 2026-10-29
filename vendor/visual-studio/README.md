# Sorting source

Source: https://github.com/theron-wang/Tailwind-CSS-for-Visual-Studio
Revision: aa54a514bef318b20483eeb958ba8188afd9a6d9
Retrieved: 2026-10-29
License: MIT, copyright 2023-2026 Theron Wang. See LICENSE in this directory.

The files in V4/ are unmodified copies of src/Resources/V4/order.json,
variantorder.json and the corresponding V4_1, V4_2 and V4_3 diffs. Apply each
minor version diff directly to the V4 base, removing entries before inserting
the additions at their specified indices, as ResourcesLoader.cs does.

sorter.mjs adapts src/ClassOperations/Sorters/Sorter.cs and ClassSortUtilities.cs
to JavaScript. It preserves stable ordering by variant count, maximum variant
rank and utility rank, including group variants and unknown utilities.
Tailmend supports Tailwind 4 only. Other minor versions use the V4 base order.

Adaptations use the target project's Tailwind parser/theme for custom values,
imports and prefixes. Variant delimiters are parsed outside arbitrary values.
Named containers use the bracket placeholder ranks from the data and their
configured sizes. Unprefixed utilities in a prefixed project remain unknown.
These adaptations avoid the upstream sorter's naive colon
splitting and missing container placeholder mappings; this is not a bit-for-bit
port of those edge cases. Stable equal ranks retain their original input order.

To update, record a new source revision, copy the data and license, review any
algorithm and diff-format changes, and run the sorter, CLI and package checks.
