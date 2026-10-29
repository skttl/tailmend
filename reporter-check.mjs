import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { formatReports, useColor } from './reporter.mjs';

const reports = [
  { file: 'Views/Card.cshtml', events: [
    { position: 30, line: 126, message: 'cssConflict: block removed' },
    { position: 10, line: 54, message: 'changed md:w-[28px] to md:w-7' },
    { position: 40, line: 128, message: 'classes sorted' },
    { position: 50, line: 130, message: 'duplicate: p-4 removed' },
    { position: 60, line: 140, message: 'cssConflict: manual review required' },
  ] },
  { file: 'Views/Footer.cshtml', events: [{ position: 1, line: 21, message: 'changed mr-[10px] to mr-2.5' }] },
];
const options = { fix: true, files: 60, changes: 2, findings: 1, skipped: 216 };
const plain = formatReports(reports, { ...options, color: false });
assert.match(plain, /^Tailmend v\d+\.\d+\.\d+(?:-[\w.-]+)?\s+fix/);
assert.match(plain, /Views\/Card.cshtml\n\s+54\s+replace\s+md:w-\[28px\] -> md:w-7/);
assert.match(plain, /126\s+remove\s+block \(overridden\)/);
assert.match(plain, /128\s+sort\s+classes/);
assert.match(plain, /130\s+remove\s+p-4 \(duplicate\)/);
assert.match(plain, /140\s+review\s+cssConflict: manual review required/);
assert.match(plain, /\n\nViews\/Footer.cshtml/);
assert.match(plain, /2 files fixed.*60 checked/);
assert.match(plain, /1 manual finding/);
assert.match(plain, /216 dynamic\/unsupported tags skipped/);
assert.equal(stripVTControlCharacters(plain), plain, 'plain logs contain no terminal controls');
const colored = formatReports(reports, { ...options, color: true });
assert.notEqual(colored, plain);
assert.equal(stripVTControlCharacters(colored), plain, 'color never changes the report content');
assert.match(formatReports([], { ...options, fix: false, changes: 0, findings: 0, color: false }), /No changes needed.*60 files checked/);
assert.match(formatReports(reports, { ...options, fix: false, color: false }), /2 files need changes.*60 checked/);
assert.equal(useColor({ isTTY: false }, {}), false);
assert.equal(useColor({ isTTY: true }, { NO_COLOR: '' }), false);
assert.equal(useColor({ isTTY: false }, { FORCE_COLOR: '1' }), true);
const grouped = formatReports([{ file: 'Views/Banners.cshtml', events: [
  { position: 1, line: 52, message: 'classes sorted' },
  { position: 2, line: 54, message: 'changed md:w-[28px] to md:w-7' },
  { position: 3, line: 55, message: 'classes sorted' },
  { position: 4, line: 55, message: 'classes sorted' },
  { position: 5, line: 74, message: 'classes sorted' },
] }], { ...options, color: false });
assert.match(grouped, /sort\s+classes on lines 52, 55, 74\n\s+54\s+replace/);
assert.equal((grouped.match(/\bsort\s+classes/g) ?? []).length, 1, 'one sort row with unique lines per file');
const longReport = formatReports([{ file: 'Views/Topbanner.cshtml', events: [
  ...Array.from({ length: 30 }, (_, n) => ({ position: n, line: 8 + n * 7, message: 'classes sorted' })),
  { position: 50, line: 69, message: 'changed h-[40px] to h-10' },
] }], { ...options, color: false, columns: 70 });
const sortRow = longReport.split('\n').find(line => line.includes('sort '));
const replaceRow = longReport.split('\n').find(line => line.includes('replace '));
assert.equal(sortRow.indexOf('sort'), replaceRow.indexOf('replace'), 'action column stays fixed');
assert(longReport.split('\n').every(line => line.length <= 70), 'long sorting lists wrap to terminal width');
const numberList = longReport.slice(longReport.indexOf('classes on lines ') + 'classes on lines '.length, longReport.indexOf('  69  replace'));
assert.deepEqual(numberList.match(/\d+/g).map(Number), Array.from({ length: 30 }, (_, n) => 8 + n * 7), 'wrapped list retains every source line');
console.log('PASS: readable reports, original lines, retained findings, mode summaries and plain/colored terminal output.');
