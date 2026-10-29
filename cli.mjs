#!/usr/bin/env node
// Experimental lexical scanner; see docs/usage.md for supported syntax.
import { readFile, writeFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { glob } from 'tinyglobby';
import { startServer } from './server.mjs';
import { createSorter } from './sorter.mjs';
import { staticAttributes, replaceAttributes } from './razor.mjs';

const prefix = '<div class="';
const virtualText = values => values.map(value => prefix + value + '"></div>').join('\n');
const normalized = value => (value.match(/\S+/g) ?? []).join(' ');
const unique = value => [...new Set(value.split(' ').filter(Boolean))].join(' ');

async function run() {
  const { values: options, positionals } = parseArgs({ options: {
    cwd: { type: 'string' }, config: { type: 'string' },
    check: { type: 'boolean' }, fix: { type: 'boolean' },
    'root-font-size': { type: 'string', default: '16' }, help: { type: 'boolean', short: 'h' },
  }, allowPositionals: true });
  if (options.help) {
    console.log('Tailmend: tailmend --config <tailwind.css> [--cwd <project>] [--check | --fix] ["**/*.{razor,cshtml}"]\nExit codes: 0 clean, 1 changes/manual findings, 2 operational failure.\nRazor-containing tags are skipped; distinct conflicting classes require manual review.');
    return 0;
  }
  if (!options.config || (options.check && options.fix)) throw new Error('Specify --config and at most one of --check / --fix.');
  const rootFontSize = Number(options['root-font-size']);
  if (!Number.isFinite(rootFontSize) || rootFontSize <= 0) throw new Error('--root-font-size must be a positive number.');
  const cwd = path.resolve(options.cwd ?? '.');
  const config = path.resolve(cwd, options.config);
  await access(config);
  const projectRequire = createRequire(path.join(cwd, 'package.json'));
  const tailwind = projectRequire('tailwindcss/package.json');
  if (!tailwind.version.startsWith('4.')) throw new Error('Tailmend requires project Tailwind 4.');
  const files = await glob(positionals.length ? positionals : ['**/*.{razor,cshtml}'], {
    cwd, absolute: true, ignore: ['**/node_modules/**', '**/.git/**', '**/bin/**', '**/obj/**'],
  });
  if (!files.length) throw new Error('No matching files. Nothing was checked.');
  const sources = [];
  let skipped = 0;
  for (const file of files.sort()) {
    const source = await readFile(file, 'utf8');
    try {
      const extraction = staticAttributes(source);
      skipped += extraction.skipped;
      sources.push({ file, source, ...extraction });
    } catch (error) { throw new Error(path.relative(cwd, file) + ': ' + error.message); }
  }
  let server;
  let changes = 0;
  let findings = 0;
  const staged = [];
  if (!sources.some(source => source.attributes.length)) throw new Error('No supported static class attributes. ' + skipped + ' tags skipped; nothing was checked.');
  try {
    const sortClasses = await createSorter(cwd, config, tailwind.version);
    server = await startServer(cwd, config, rootFontSize);
    for (const { file, source, attributes } of sources) {
      if (!attributes.length) continue;
      const report = (attribute, code, message) => {
        if (!attribute) throw new Error('Diagnostic outside static class attribute');
        const before = source.slice(0, attribute.start);
        const line = before.split('\n').length;
        const column = attribute.start - before.lastIndexOf('\n');
        console.log(path.relative(cwd, file) + ':' + line + ':' + column + ' ' + code + ': ' + message);
      };
      let values = attributes.map(attribute => unique(normalized(attribute.value)));
      let diagnostics;
      let initialCanonical = [];
      for (let pass = 0; pass < 10; pass++) {
        const uri = pathToFileURL(file + '.tailmend-' + pass + '.html').href;
        const text = virtualText(values);
        // Opening the document initializes the explicitly selected Tailwind project.
        diagnostics = await server.diagnostics(uri, text);
        const active = await server.request('@/tailwindCSS/getProject', { uri });
        if (!active?.version?.startsWith('4.')) throw new Error('No active Tailwind 4 project for ' + file);
        const canonical = diagnostics.filter(item => item.code === 'suggestCanonicalClasses');
        if (pass === 0) initialCanonical = canonical;
        if (!canonical.length) {
          values = values.map(sortClasses);
          await server.closeDocument(uri);
          break;
        }
        const actions = await server.request('textDocument/codeAction', {
          textDocument: { uri }, range: { start: { line: 0, character: 0 }, end: { line: values.length, character: 0 } },
          context: { diagnostics: canonical, only: ['quickfix'] },
        });
        const edits = [];
        for (const action of actions ?? []) {
          if (!action.diagnostics?.every(item => item.code === 'suggestCanonicalClasses')) continue;
          for (const [target, changes] of Object.entries(action.edit?.changes ?? {})) {
            if (target !== uri) throw new Error('Unexpected cross-file quickfix');
            for (const edit of changes) {
              const { start, end } = edit.range;
              if (start.line !== end.line || !values[start.line] || start.character < prefix.length || end.character > prefix.length + values[start.line].length) throw new Error('Quickfix outside static class attribute');
              if (!edits.some(existing => JSON.stringify(existing) === JSON.stringify(edit))) edits.push(edit);
            }
          }
        }
        edits.sort((a, b) => b.range.start.line - a.range.start.line || b.range.start.character - a.range.start.character);
        for (let n = 1; n < edits.length; n++) {
          if (edits[n].range.end.line === edits[n - 1].range.start.line && edits[n].range.end.character > edits[n - 1].range.start.character) throw new Error('Overlapping canonical fixes');
        }
        if (!edits.length) throw new Error('Canonical diagnostic has no supported fix');
        for (const edit of edits) {
          const line = edit.range.start.line;
          values[line] = values[line].slice(0, edit.range.start.character - prefix.length) + edit.newText + values[line].slice(edit.range.end.character - prefix.length);
        }
        values = values.map(unique);
        await server.closeDocument(uri);
        if (pass === 9) throw new Error('Normalization did not converge');
      }
      for (const diagnostic of options.fix ? diagnostics : [...initialCanonical, ...diagnostics]) {
        report(attributes[diagnostic.range.start.line], diagnostic.code, diagnostic.message);
      }
      findings += diagnostics.length;
      const output = replaceAttributes(source, attributes, values);
      if (output !== source) {
        if (!options.fix) {
          for (const [index, attribute] of attributes.entries()) {
            const original = normalized(attribute.value);
            if (original !== values[index]) report(attribute, 'classList', JSON.stringify(original) + ' -> ' + JSON.stringify(values[index]));
          }
        }
        changes++;
        console.log((options.fix ? 'FIX ' : 'CHANGE ') + path.relative(cwd, file));
        staged.push({ file, source, output });
      }
    }
    // Validate every file before writing any, and refuse to overwrite concurrent user edits.
    if (options.fix) {
      for (const item of staged) if (await readFile(item.file, 'utf8') !== item.source) throw new Error('File changed during scan: ' + item.file);
      for (const item of staged) await writeFile(item.file, item.output, 'utf8');
    }
  } finally { server?.close(); }
  console.log(files.length + ' files; ' + changes + (options.fix ? ' fixed' : ' need changes') + '; ' + findings + ' manual findings; ' + skipped + ' dynamic/unsupported tags skipped.');
  return findings || (!options.fix && changes) ? 1 : 0;
}

try { process.exitCode = await run(); }
catch (error) { console.error(error.message); process.exitCode = 2; }
