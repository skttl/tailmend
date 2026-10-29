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
import { loadTailwindProject } from './tailwind.mjs';
import { createConflictResolver } from './conflicts.mjs';
import { staticAttributes, replaceAttributes } from './razor.mjs';
import { formatReports } from './reporter.mjs';

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
    console.log('Tailmend: tailmend --config <tailwind.css> [--cwd <project>] [--check | --fix] ["**/*.{razor,cshtml}"]\nExit codes: 0 clean, 1 changes/manual findings, 2 operational failure.\nRazor-containing tags are skipped; fully overridden utilities are removed; remaining conflicts require manual review.');
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
  const reports = [];
  if (!sources.some(source => source.attributes.length)) throw new Error('No supported static class attributes. ' + skipped + ' tags skipped; nothing was checked.');
  try {
    const project = await loadTailwindProject(cwd, config);
    const sortClasses = await createSorter(cwd, config, tailwind.version, project.design);
    const knownClasses = sources.flatMap(source => source.attributes.flatMap(attribute => attribute.value.match(/\S+/g) ?? []));
    const resolveConflicts = await createConflictResolver(project, knownClasses);
    server = await startServer(cwd, config, rootFontSize);
    for (const { file, source, attributes } of sources) {
      if (!attributes.length) continue;
      const events = [];
      const report = (attribute, message) => {
        if (!attribute) throw new Error('Diagnostic outside static class attribute');
        events.push({ position: attribute.start, line: source.slice(0, attribute.start).split('\n').length, message });
      };
      const deduplicate = (value, index) => {
        const counts = new Map();
        for (const token of value.split(' ').filter(Boolean)) counts.set(token, (counts.get(token) ?? 0) + 1);
        for (const [token, count] of counts) if (count > 1) {
          report(attributes[index], 'duplicate: ' + token + ' removed' + (count > 2 ? ' (' + (count - 1) + ' copies)' : ''));
        }
        return unique(value);
      };
      let values = attributes.map((attribute, index) => deduplicate(normalized(attribute.value), index));
      let diagnostics;
      for (let pass = 0; pass < 10; pass++) {
        const uri = pathToFileURL(file + '.tailmend-' + pass + '.html').href;
        const text = virtualText(values);
        // Opening the document initializes the explicitly selected Tailwind project.
        diagnostics = await server.diagnostics(uri, text);
        const active = await server.request('@/tailwindCSS/getProject', { uri });
        if (!active?.version?.startsWith('4.')) throw new Error('No active Tailwind 4 project for ' + file);
        const canonical = diagnostics.filter(item => item.code === 'suggestCanonicalClasses');
        if (!canonical.length) {
          const resolved = await Promise.all(values.map(resolveConflicts));
          if (resolved.some((value, index) => value !== values[index])) {
            for (const [index, value] of values.entries()) {
              const retained = new Set(resolved[index].split(' '));
              for (const token of value.split(' ')) if (!retained.has(token)) report(attributes[index], 'cssConflict: ' + token + ' removed');
            }
            values = resolved;
            await server.closeDocument(uri);
            if (pass === 9) throw new Error('Normalization did not converge');
            continue;
          }
          values = values.map((value, index) => {
            const sorted = sortClasses(value);
            if (sorted !== value) report(attributes[index], 'classes sorted');
            return sorted;
          });
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
          const previous = values[line].slice(edit.range.start.character - prefix.length, edit.range.end.character - prefix.length);
          if (previous !== edit.newText) report(attributes[line], edit.newText ? 'changed ' + previous + ' to ' + edit.newText : 'canonical: ' + previous + ' removed');
          values[line] = values[line].slice(0, edit.range.start.character - prefix.length) + edit.newText + values[line].slice(edit.range.end.character - prefix.length);
        }
        values = values.map(deduplicate);
        await server.closeDocument(uri);
        if (pass === 9) throw new Error('Normalization did not converge');
      }
      for (const diagnostic of diagnostics) {
        report(attributes[diagnostic.range.start.line], diagnostic.code + ': ' + diagnostic.message);
      }
      findings += diagnostics.length;
      const output = replaceAttributes(source, attributes, values);
      if (output !== source) {
        changes++;
        staged.push({ file, source, output });
      }
      if (events.length) reports.push({ file: path.relative(cwd, file), events });
    }
    // Validate every file before writing any, and refuse to overwrite concurrent user edits.
    if (options.fix) {
      for (const item of staged) if (await readFile(item.file, 'utf8') !== item.source) throw new Error('File changed during scan: ' + item.file);
      for (const item of staged) await writeFile(item.file, item.output, 'utf8');
    }
  } finally { server?.close(); }
  console.log(formatReports(reports, { fix: options.fix, files: files.length, changes, findings, skipped }));
  return findings || (!options.fix && changes) ? 1 : 0;
}

try { process.exitCode = await run(); }
catch (error) { console.error(error.message); process.exitCode = 2; }
