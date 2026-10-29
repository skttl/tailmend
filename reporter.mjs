import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export function useColor(stream = process.stdout, env = process.env) {
  if ('NO_COLOR' in env || env.FORCE_COLOR === '0') return false;
  if ('FORCE_COLOR' in env) return true;
  return Boolean(stream.isTTY && env.TERM !== 'dumb');
}

function describe(message) {
  const replacement = /^changed (.+) to (.+)$/.exec(message);
  if (replacement) return { action: 'replace', before: replacement[1], after: replacement[2] };
  if (message === 'classes sorted') return { action: 'sort', detail: 'classes' };
  const removal = /^(cssConflict|duplicate|canonical): (.+) removed(.*)$/.exec(message);
  if (removal) {
    const reason = { cssConflict: 'overridden', duplicate: 'duplicate', canonical: 'redundant' }[removal[1]];
    return { action: 'remove', detail: removal[2] + ' (' + reason + ')' + removal[3] };
  }
  return { action: 'review', detail: message };
}

export function formatReports(reports, { fix, files, changes, findings, skipped, color = useColor(), columns = process.stdout.columns ?? 100 }) {
  const paint = (code, text) => color ? '\x1b[' + code + 'm' + text + '\x1b[0m' : text;
  const plural = (count, noun) => count + ' ' + noun + (count === 1 ? '' : 's');
  const lines = [paint('1;36', 'Tailmend') + ' ' + paint('2', 'v' + version) + '  ' + paint('2', fix ? 'fix' : 'check'), ''];
  for (const { file, events } of reports) {
    if (!events.length) continue;
    lines.push(paint('1', file));
    const width = Math.max(3, ...events.map(event => String(event.line).length));
    const sortLines = [...new Set(events.filter(event => event.message === 'classes sorted').map(event => event.line))].sort((a, b) => a - b);
    let sortedReported = false;
    for (const event of [...events].sort((a, b) => a.position - b.position)) {
      const item = describe(event.message);
      if (item.action === 'sort' && sortedReported) continue;
      const groupedSort = item.action === 'sort' && sortLines.length > 1;
      const sourceLines = groupedSort ? '' : String(event.line);
      if (item.action === 'sort') sortedReported = true;
      const label = paint(item.action === 'review' || item.action === 'remove' ? '33' : '36', item.action.padEnd(7));
      if (groupedSort) {
        const lead = 'classes on lines ';
        const indent = 2 + width + 2 + 7 + 2 + lead.length;
        const available = Math.max(10, columns - indent);
        const chunks = [];
        let chunk = '';
        for (const [index, line] of sortLines.entries()) {
          const token = String(line) + (index < sortLines.length - 1 ? ',' : '');
          if (chunk && chunk.length + 1 + token.length > available) { chunks.push(chunk); chunk = ''; }
          chunk += (chunk ? ' ' : '') + token;
        }
        if (chunk) chunks.push(chunk);
        lines.push('  ' + ' '.repeat(width) + '  ' + label + '  ' + lead + paint('2', chunks[0]));
        for (const continuation of chunks.slice(1)) lines.push(' '.repeat(indent) + paint('2', continuation));
        continue;
      }
      const detail = item.before !== undefined
        ? paint('2', item.before) + ' -> ' + paint('32', item.after) : item.detail;
      lines.push('  ' + paint('2', sourceLines.padStart(width)) + '  ' + label + '  ' + detail);
    }
    lines.push('');
  }
  const summary = changes
    ? plural(changes, 'file') + (fix ? ' fixed' : changes === 1 ? ' needs changes' : ' need changes') + ' / ' + files + ' checked'
    : (findings ? 'No automatic changes' : 'No changes needed') + ' / ' + plural(files, 'file') + ' checked';
  lines.push(paint(findings || (!fix && changes) ? '33' : '32', summary));
  lines.push(paint(findings ? '33' : '2', plural(findings, 'manual finding')));
  if (skipped) lines.push(paint('2', skipped + ' dynamic/unsupported tags skipped'));
  return lines.join('\n');
}
