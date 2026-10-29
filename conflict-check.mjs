import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadTailwindProject } from './tailwind.mjs';
import { createConflictResolver } from './conflicts.mjs';

const scratch = path.join(import.meta.dirname, 'node_modules', '.cache');
await mkdir(scratch, { recursive: true });
const cwd = await mkdtemp(path.join(scratch, 'tailmend-conflicts-'));
const config = path.join(cwd, 'tailwind.css');
await writeFile(config, '@import "tailwindcss";');
const resolve = await createConflictResolver(await loadTailwindProject(cwd, config));
for (const [input, expected] of [
  ['', ''],
  ['block flex', 'flex'],
  ['flex block', 'flex'],
  ['flex grid block', 'grid'],
  ['custom block flex', 'custom flex'],
  ['p-4 px-2', 'p-4 px-2'],
  ['block md:flex', 'block md:flex'],
  ['md:block md:flex', 'md:flex'],
  ['hover:block hover:flex', 'hover:flex'],
  ['block hover:flex', 'block hover:flex'],
  ['hover:block focus:flex', 'hover:block focus:flex'],
  ['md:block lg:flex', 'md:block lg:flex'],
  ['block! flex', 'block!'],
  ['block flex!', 'flex!'],
  ['flex! block!', 'flex!'],
  ['p-8 p-4', 'p-8'],
  ['text-red-500 text-blue-500', 'text-red-500'],
  ['size-4 w-8', 'size-4 w-8'],
  ['size-4 w-8 h-8', 'w-8 h-8'],
  ['shadow shadow-none', 'shadow shadow-none'],
  ['flex [display:banana]', 'flex [display:banana]'],
  ['flex [display:block]', 'flex [display:block]'],
  ['block flex in-[.block]:p-4', 'block flex in-[.block]:p-4'],
  ['unknown-a unknown-b', 'unknown-a unknown-b'],
]) {
  assert.equal(await resolve(input), expected, input);
  assert.equal(await resolve(expected), expected, 'idempotence: ' + input);
}

// Existing custom selectors and declaration fallbacks prevent class deletion.
for (const [css, input] of [
  ['.block { color: red; }', 'block flex'],
  ['.block .child { color: red; }', 'block flex'],
  ['[class~="block"] { color: red; }', 'block flex'],
  [String.raw`[cl\61ss~="block"] { color: red; }`, 'block flex'],
  ['[class="block flex"] { color: red; }', 'block flex'],
  ['@scope (.block) { .child { color: red; } }', 'block flex'],
  ['@utility invalid { display: banana; }', 'flex invalid'],
  ['@utility fallback { display: block; display: banana; }', 'flex fallback'],
  ['@utility variables { --display-mode: block; display: block; }', 'variables flex'],
]) {
  await writeFile(config, '@import "tailwindcss"; ' + css);
  const custom = await createConflictResolver(await loadTailwindProject(cwd, config));
  assert.equal(await custom(input), input, css);
}

await writeFile(config, '@import "tailwindcss";');
const referenced = await createConflictResolver(await loadTailwindProject(cwd, config), ['in-[.block]:p-4']);
assert.equal(await referenced('block flex'), 'block flex', 'class referenced by a utility in another attribute');

await writeFile(config, '@import "tailwindcss/theme.css"; @scope (.block) { @tailwind utilities; }');
const scoped = await createConflictResolver(await loadTailwindProject(cwd, config));
assert.equal(await scoped('block flex'), 'block flex', 'scope selectors can depend on a losing class');

await writeFile(config, '@tailwind utilities; @utility aaa { @layer { display: block !important; } } @utility zzz { @layer { display: flex !important; } }');
const layers = await createConflictResolver(await loadTailwindProject(cwd, config));
assert.equal(await layers('aaa zzz'), 'aaa zzz', 'anonymous layers have distinct cascade identities');

await writeFile(config, '@theme { --breakpoint-lg: 992px; }');
await assert.rejects(
  createConflictResolver(await loadTailwindProject(cwd, config), ['block', 'flex']),
  /does not generate Tailwind utilities.*entrypoint/i,
  'theme-only input must not silently skip conflict analysis',
);

await writeFile(path.join(cwd, 'theme.css'), '@theme { --breakpoint-phone: 30rem; --color-brand: #123456; }');
await writeFile(config, '@import "tailwindcss" prefix(tw); @import "./theme.css";');
const prefixed = await createConflictResolver(await loadTailwindProject(cwd, config));
assert.equal(await prefixed('tw:block tw:flex'), 'tw:flex');
assert.equal(await prefixed('tw:phone:block tw:phone:flex'), 'tw:phone:flex');
assert.equal(await prefixed('block tw:flex'), 'block tw:flex');
console.log('PASS: generated CSS precedence, important, conditional contexts, complete declaration coverage and conservative exclusions.');
