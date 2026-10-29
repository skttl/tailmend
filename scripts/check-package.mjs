import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(path.join(tmpdir(), 'tailmend-package-'));
const run = (args, cwd = scratch) => {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 180000, windowsHide: true });
  assert.equal(result.status, 0, result.error?.message ?? result.stdout + result.stderr);
  return result.stdout;
};

try {
  const [packed] = JSON.parse(run([process.env.npm_execpath, 'pack', '--json', '--pack-destination', scratch], root));
  assert.deepEqual(packed.files.map(file => file.path).sort(), [
    'LICENSE', 'README.md', 'cli.mjs', 'docs/usage.md', 'package.json', 'razor.mjs', 'server.mjs',
  ].sort());
  await writeFile(path.join(scratch, 'package.json'), JSON.stringify({ name: 'tailmend-package-check', private: true, type: 'module' }));
  run([process.env.npm_execpath, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev', path.join(scratch, packed.filename), 'tailwindcss@4.1.17']);
  const cli = path.join(scratch, 'node_modules', 'tailmend', 'cli.mjs');
  assert.match(run([cli, '--help']), /--config/);
  assert.ok(await readFile(path.join(scratch, 'node_modules', '.bin', process.platform === 'win32' ? 'tailmend.cmd' : 'tailmend'), 'utf8'));
  assert.match(run([process.env.npm_execpath, 'exec', '--offline', '--', 'tailmend', '--help']), /--config/);
  await writeFile(path.join(scratch, 'tailwind.css'), '@import "tailwindcss";');
  await writeFile(path.join(scratch, 'View.cshtml'), '<div class="p-4 p-4"></div>\n');
  run([cli, '--config', 'tailwind.css', '--fix']);
  assert.equal(await readFile(path.join(scratch, 'View.cshtml'), 'utf8'), '<div class="p-4"></div>\n');
  run([cli, '--config', 'tailwind.css', '--check']);
  console.log('PASS: package contents, isolated production install, CLI bin, fix and check.');
} finally {
  assert.equal(path.dirname(scratch), path.resolve(tmpdir()));
  assert.ok(path.basename(scratch).startsWith('tailmend-package-'));
  await rm(scratch, { recursive: true, force: true });
}
