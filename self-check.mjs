// Small, executable spike checks. No EC-Billing views are modified.
import './attribute-check.mjs';
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
  '',
].join('\r\n');
await writeFile(path.join(cwd, 'package.json'), '{"name":"tailmend-self-check","private":true}');
await writeFile(path.join(cwd, 'tailwind.css'), '@import "tailwindcss";');
for (const ext of ['razor', 'cshtml']) await writeFile(path.join(cwd, 'View.' + ext), source);
const call = (...args) => spawnSync(process.execPath, [path.join(import.meta.dirname, 'cli.mjs'), '--cwd', cwd, '--config', 'tailwind.css', ...args], { encoding: 'utf8', timeout: 60000, windowsHide: true });
const before = call('--check');
assert.equal(before.status, 1, before.stdout + before.stderr);
assert.equal(await readFile(path.join(cwd, 'View.razor'), 'utf8'), source);
const fixed = call('--fix');
assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
for (const ext of ['razor', 'cshtml']) {
  const output = await readFile(path.join(cwd, 'View.' + ext), 'utf8');
  assert.match(output, /class="mb-3 shrink-0 bg-red-500 p-4 text-white"/);
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
assert.equal(call('--fix').status, 0);
const beforeConflict = '<div class="flex grid"></div>\n<div class="grid flex"></div>\n';
await writeFile(path.join(cwd, 'Conflict.razor'), beforeConflict);
const conflict = call('--fix');
assert.equal(conflict.status, 1, conflict.stdout + conflict.stderr);
const afterConflict = await readFile(path.join(cwd, 'Conflict.razor'), 'utf8');
assert.equal((afterConflict.match(/flex/g) ?? []).length, 2);
assert.equal((afterConflict.match(/grid/g) ?? []).length, 2);
assert.match(conflict.stdout, /cssConflict/);
assert.equal(call('--check', 'missing/**/*.razor').status, 2);
const invalidConfig = spawnSync(process.execPath, [path.join(import.meta.dirname, 'cli.mjs'), '--cwd', cwd, '--config', 'missing.css'], { encoding: 'utf8', timeout: 30000 });
assert.equal(invalidConfig.status, 2);
assert.equal(staticAttributes('<div class="p-4"></div>\n<!-- <div class="bad"></div> -->').attributes.length, 1);
assert.throws(() => staticAttributes('@code { var text = """<div class=\'p-4\'>"""; }'), /full Razor parser/);
console.log('PASS: normalization, official sorting, duplicates, Razor/comments/C# exclusions, CRLF, idempotence, manual conflicts, missing files/config.');
console.log('Fixture: ' + cwd);
