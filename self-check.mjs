// Executable integration checks use isolated fixtures.
import './attribute-check.mjs';
import './sorter-check.mjs';
import './conflict-check.mjs';
import './reporter-check.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { staticAttributes } from './razor.mjs';

const scratch = path.join(import.meta.dirname, 'node_modules', '.cache');
await mkdir(scratch, { recursive: true });
const cwd = await mkdtemp(path.join(scratch, 'tailmend-'));
const source = [
  '<div class="text-white mb-[12px] flex-shrink-0 p-4 bg-red-500"></div>',
  '<div class="p-4 p-4"></div>',
  '<div className="p-4 p-4"></div>',
  '<div :class="\'p-4 p-4\'" x-bind:class="\'mb-[12px]\'"></div>',
  '<div class="[display:flex] flex"></div>',
  '<div class="flex md:grid"></div>',
  '<div class="@(isGrid ? "grid" : "flex") p-4"></div>',
  '<div class="text-white @GetClasses() mb-[12px]"></div>',
  '<div class=@($"{(isGrid ? "grid" : "flex")} mb-[12px]")></div>',
  '@* <div class="mb-[12px]"></div> *@',
  '@code { string Example = "<div class=\'mb-[12px]\'></div>"; }',
  '<div title=\' class="mb-[12px]"\' class="p-4"></div>',
  '<div class="\r\n  text-white\r\n  p-4 bg-red-500\r\n"></div>',
  '<div class="md:hover:p-4 sm:p-4 hover:focus:p-4"></div>',
  '<div class="block flex"></div>',
  '<div class="pb-[.75rem]"></div>',
  '<div class="  flex   items-center "></div>',
  '',
].join('\r\n');
await writeFile(path.join(cwd, 'package.json'), '{"name":"tailmend-self-check","private":true}');
await writeFile(path.join(cwd, 'tailwind.css'), '@import "tailwindcss";');
for (const ext of ['razor', 'cshtml']) await writeFile(path.join(cwd, 'View.' + ext), source);
const call = (...args) => spawnSync(process.execPath, [path.join(import.meta.dirname, 'cli.mjs'), '--cwd', cwd, '--config', 'tailwind.css', ...args], { encoding: 'utf8', timeout: 60000, windowsHide: true });
const before = call('--check');
assert.equal(before.status, 1, before.stdout + before.stderr);
assert.match(before.stdout, /View\.razor\r?\n\s+1\s/);
assert.equal((before.stdout.match(/^View\.razor$/gm) ?? []).length, 1, 'one heading per file');
assert.match(before.stdout, /2\s+remove\s+p-4 \(duplicate\)/);
assert.match(before.stdout, /sort\s+classes on lines 1, 13, 17/);
assert.match(before.stdout, /18\s+remove\s+block \(overridden\)/);
assert.match(before.stdout, /0 manual findings/);
assert.equal(await readFile(path.join(cwd, 'View.razor'), 'utf8'), source);
const fixed = call('--fix');
assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
assert.doesNotMatch(fixed.stdout, /suggestCanonicalClasses:|classList:/);
for (const message of [/1\s+replace\s+mb-\[12px\] -> mb-3/, /2\s+remove\s+p-4 \(duplicate\)/, /sort\s+classes on lines 1, 13, 17/, /18\s+remove\s+block \(overridden\)/, /19\s+replace\s+pb-\[.75rem\] -> pb-3/]) {
  assert.match(before.stdout, message, 'check explains ' + message);
  assert.match(fixed.stdout, message, 'fix explains ' + message);
}
for (const ext of ['razor', 'cshtml']) {
  const output = await readFile(path.join(cwd, 'View.' + ext), 'utf8');
  assert.match(output, /class="mb-3 shrink-0 bg-red-500 p-4 text-white"/);
  assert(output.includes('class="sm:p-4 hover:focus:p-4 md:hover:p-4"'), 'Visual Studio variant-count order');
  assert(output.includes('class="  flex   items-center "'), 'unchanged class whitespace preserved');
  assert.match(output, /class="p-4"/);
  assert(output.includes('className="p-4"'));
  assert(output.includes(':class="\'p-4\'" x-bind:class="\'mb-3\'"'));
  assert.match(output, /class="flex"/);
  assert(!output.includes('[display:flex]'));
  assert(!output.includes('p-4 p-4'));
  assert(output.includes('class="@(isGrid ? "grid" : "flex") p-4"'));
  assert(output.includes('class="text-white @GetClasses() mb-[12px]"'));
  assert(output.includes('class=@($"{(isGrid ? "grid" : "flex")} mb-[12px]")'));
  assert(output.includes('@* <div class="mb-[12px]"></div> *@'));
  assert(output.includes('@code { string Example = "<div class=\'mb-[12px]\'></div>"; }'));
  assert(output.includes('title=\' class="mb-[12px]"\''));
  assert(output.includes('\r\n'));
  assert(!/(?<!\r)\n/.test(output), 'CRLF preserved');
}
const again = call('--check');
assert.equal(again.status, 0, again.stdout + again.stderr);
assert.doesNotMatch(again.stdout, /suggestCanonicalClasses:|classList:|CHANGE /);
assert.doesNotMatch(again.stdout, /^\s+\d+\s+(replace|remove|sort|review)\b/m);
assert.equal(call('--fix').status, 0);
const beforeConflict = '<div class="flex grid"></div>\n<div class="grid flex"></div>\n';
await writeFile(path.join(cwd, 'Conflict.razor'), beforeConflict);
const conflict = call('--fix');
assert.equal(conflict.status, 0, conflict.stdout + conflict.stderr);
const afterConflict = await readFile(path.join(cwd, 'Conflict.razor'), 'utf8');
assert.equal(afterConflict, '<div class="grid"></div>\n<div class="grid"></div>\n');
assert.match(conflict.stdout, /1\s+remove\s+flex \(overridden\)/);
assert.match(conflict.stdout, /0 manual findings/);
assert.doesNotMatch(conflict.stdout, /applies the same CSS properties/);
await writeFile(path.join(cwd, 'Manual.razor'), '<div class="shadow-md shadow-none"></div>\n');
const manual = call('--fix');
assert.equal(manual.status, 1, manual.stdout + manual.stderr);
assert.match(manual.stdout, /cssConflict/);
const remaining = await readFile(path.join(cwd, 'Manual.razor'), 'utf8');
assert.match(remaining, /shadow-md/);
assert.match(remaining, /shadow-none/);
await writeFile(path.join(cwd, 'ReferenceParent.razor'), '<div class="block flex"></div>\n');
await writeFile(path.join(cwd, 'ReferenceChild.razor'), '<div class="in-[.block]:p-4"></div>\n');
const references = call('--fix', 'Reference*.razor');
assert.equal(references.status, 1, references.stdout + references.stderr);
assert.equal(await readFile(path.join(cwd, 'ReferenceParent.razor'), 'utf8'), '<div class="block flex"></div>\n');
assert.equal(call('--check', 'missing/**/*.razor').status, 2);
await writeFile(path.join(cwd, 'theme-only.css'), '@theme { --breakpoint-lg: 992px; }');
const beforeInvalidEntrypoint = await readFile(path.join(cwd, 'View.razor'), 'utf8');
const invalidEntrypoint = spawnSync(process.execPath, [path.join(import.meta.dirname, 'cli.mjs'), '--cwd', cwd, '--config', 'theme-only.css', '--fix', 'View.razor'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(invalidEntrypoint.status, 2, invalidEntrypoint.stdout + invalidEntrypoint.stderr);
assert.match(invalidEntrypoint.stderr, /does not generate Tailwind utilities.*entrypoint/);
assert.equal(await readFile(path.join(cwd, 'View.razor'), 'utf8'), beforeInvalidEntrypoint, 'invalid CSS entrypoint must not write');
const invalidConfig = spawnSync(process.execPath, [path.join(import.meta.dirname, 'cli.mjs'), '--cwd', cwd, '--config', 'missing.css'], { encoding: 'utf8', timeout: 30000 });
assert.equal(invalidConfig.status, 2);
assert.equal(staticAttributes('<div class="p-4"></div>\n<!-- <div class="bad"></div> -->').attributes.length, 1);
assert.throws(() => staticAttributes('@code { var text = """<div class=\'p-4\'>"""; }'), /full Razor parser/);
console.log('PASS: normalization, Visual Studio sorting, duplicates, overridden utilities, Razor/comments/C# exclusions, CRLF, idempotence, manual conflicts and class references.');
console.log('Fixture: ' + cwd);
