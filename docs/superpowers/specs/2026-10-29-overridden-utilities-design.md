# Remove fully overridden utilities

The user approved extending Tailmend to remove utility classes whose entire CSS
effect is overridden. Use the target project's installed Tailwind and selected
CSS entrypoint to generate current CSS in memory; do not require a built output
file or use the presentation sorter's ordering to determine CSS precedence.

Compare declarations only in identical selector/conditional/layer contexts.
Respect important declarations and actual compiler output order. Remove a class
only if every declaration it contributes loses to retained classes. Keep different
responsive/state contexts and partial overlaps such as `p-4 px-2`. Unsupported
selectors, declarations and variable side effects stay unchanged for manual review.
Existing assumptions about utility class names as application hooks still apply;
this is not a whole-application browser cascade analysis.

Share project loading between sorting and conflict resolution. Keep the current
normalization and static extraction boundaries. Recompute diagnostics after
removal, preserve read-only behavior, exit codes, staged writes and idempotence.
Ship the new runtime modules in the npm package and test installed behavior.

The user additionally requested explanations for every change in both check and
fix output. Group by relative source path, with original attribute line numbers
and specific messages for sorting, overridden and duplicate removals, canonical
replacements and remaining diagnostics. Check proposes changes without writing;
fix reports them after writes succeed. Replace the former classList previews and
CHANGE/FIX file markers with these grouped explanations.

Presentation refinement requested after the user tried the output: use a compact
mode heading, bold file paths with blank lines between files, aligned source lines
and action columns (replace/remove/sort/review), and a short multi-line summary.
Terminal colors are optional, respecting NO_COLOR/FORCE_COLOR; redirected output
is plain. Keep every transformation and remaining diagnostic visible.

Implementation choices are delegated to the current session by the user's
instruction to add the proposed feature. No release or push is requested here.
