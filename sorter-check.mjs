import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createSorter } from './sorter.mjs';

const scratch = path.join(import.meta.dirname, 'node_modules', '.cache');
await mkdir(scratch, { recursive: true });
const cwd = await mkdtemp(path.join(scratch, 'tailmend-sorter-'));
await writeFile(path.join(cwd, 'tailwind.css'), '@import "tailwindcss";');
const sort = await createSorter(cwd, path.join(cwd, 'tailwind.css'), '4.1.17');

// Catch falling back to compiler order, unstable ties or accidental deduplication.
for (const [input, expected] of [
  ['', ''],
  ['p-4', 'p-4'],
  ['text-white font-bold p-4 flex', 'flex p-4 font-bold text-white'],
  ['bg-transparent flex', 'flex bg-transparent'],
  ['text-current p-4', 'p-4 text-current'],
  ['border-inherit flex', 'flex border-inherit'],
  ['text-red-500 custom-z p-8 custom-a p-4 p-4', 'custom-z custom-a p-8 p-4 p-4 text-red-500'],
  ['p-4 grid flex', 'flex grid p-4'],
  ['text-white! !font-bold p-4 -m-4', '-m-4 p-4 !font-bold text-white!'],
  ['translate-x-(--offset) flex-2 w-1/2', 'w-1/2 flex-2 translate-x-(--offset)'],
  ['text-[#fff] p-[2rem] bg-red-500/50', 'bg-red-500/50 p-[2rem] text-[#fff]'],
  ['text-white p-[length:2rem] bg-(--color)', 'bg-(--color) p-[length:2rem] text-white'],
  ['text-white [color:red] p-4', '[color:red] p-4 text-white'],
  ['text-white p-4 h-lh', 'h-lh p-4 text-white'],
  ['focus:hover:font-bold focus:p-4 hover:font-bold hover:focus:p-4 hover:p-4 p-4',
    'p-4 hover:p-4 hover:font-bold focus:p-4 hover:focus:p-4 focus:hover:font-bold'],
  ['hover:p-4 group-hover:text-white flex', 'flex group-hover:text-white hover:p-4'],
  ['lg:p-4 sm:p-4 md:p-4', 'sm:p-4 md:p-4 lg:p-4'],
  ['hover:focus:p-4 [&:nth-child(2)]:p-4 hover:p-4 p-4', 'p-4 hover:p-4 [&:nth-child(2)]:p-4 hover:focus:p-4'],
  ['mystery:focus:p-4 hover:focus:p-4 hover:alien:p-4', 'hover:alien:p-4 mystery:focus:p-4 hover:focus:p-4'],
]) {
  assert.equal(sort(input), expected, input);
  assert.equal(sort(expected), expected, 'stable second pass: ' + input);
}

// Catch applying minor-version diffs cumulatively or ignoring their removals.
for (const [version, input, expected] of [
  ['4.0.0', 'h-lh flex p-4', 'h-lh flex p-4'],
  ['4.1.17', 'h-lh flex p-4', 'flex h-lh p-4'],
  ['4.2.0', 'start absolute block', 'absolute start block'],
  ['4.3.0', 'start absolute block', 'start absolute block'],
  ['4.99.0', 'h-lh flex p-4', 'h-lh flex p-4'],
]) {
  const versionSort = await createSorter(cwd, path.join(cwd, 'tailwind.css'), version);
  assert.equal(versionSort(input), expected, 'order data for ' + version);
}

// Catch ignoring imported theme, custom sizes, removed defaults or configuration.
await writeFile(path.join(cwd, 'theme.css'), `@theme {
  --breakpoint-sm: initial;
  --breakpoint-wide: 30rem;
  --breakpoint-narrow: 400px;
  --container-large: 30rem;
  --container-small: 400px;
  --color-brand-primary: #123456;
  --spacing-gutter: 1.5rem;
}`);
await writeFile(path.join(cwd, 'config.ts'), 'export default { theme: { extend: { colors: { legacy: "#abcdef" } } } };');
await writeFile(path.join(cwd, 'tailwind.css'), '@import "tailwindcss"; @import "./theme.css"; @config "./config.ts";');
const custom = await createSorter(cwd, path.join(cwd, 'tailwind.css'), '4.1.17');
assert.equal(custom('wide:p-4 narrow:p-4'), 'narrow:p-4 wide:p-4');
assert.equal(custom('@large:p-4 @small:p-4'), '@small:p-4 @large:p-4');
assert.equal(custom('text-brand-primary font-bold p-gutter'), 'p-gutter font-bold text-brand-primary');
assert.equal(custom('text-legacy font-bold p-4'), 'p-4 font-bold text-legacy');
assert.equal(custom('text-red-500 sm:p-4 narrow:p-4'), 'text-red-500 narrow:p-4 sm:p-4');
await writeFile(path.join(cwd, 'tailwind.css'), '@import "tailwindcss" prefix(tw); @import "./theme.css";');
const prefixed = await createSorter(cwd, path.join(cwd, 'tailwind.css'), '4.1.17');
assert.equal(prefixed('tw:text-white tw:p-4 tw:flex'), 'tw:flex tw:p-4 tw:text-white');
assert.equal(prefixed('tw:wide:p-4 tw:narrow:p-4'), 'tw:narrow:p-4 tw:wide:p-4');
assert.equal(prefixed('tw:text-white! tw:p-4'), 'tw:p-4 tw:text-white!');
assert.equal(prefixed('hidden tw:flex'), 'hidden tw:flex');
assert.equal(prefixed('tw:flex font-bold'), 'font-bold tw:flex');
console.log('PASS: Visual Studio ordering, stable ties, variants, arbitrary values, theme imports, TS config, containers and prefixes.');
