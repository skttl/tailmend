// PROTOTYPE: lexical extraction, not a complete Razor parser.
function stringEnd(source, start) {
  const quote = source[start];
  const prefix = source.slice(Math.max(0, start - 2), start);
  const verbatim = prefix.endsWith('@') || prefix.endsWith('@$');
  const interpolated = /\$@?$|@\$$/.test(prefix);
  if (source.startsWith('"""', start)) throw new Error('Raw C# strings require a full Razor parser');
  for (let i = start + 1; i < source.length; i++) {
    if (!verbatim && source[i] === '\\') i++;
    else if (source[i] === quote) {
      if (verbatim && source[i + 1] === quote) i++;
      else return i + 1;
    } else if (interpolated && source[i] === '{') {
      if (source[i + 1] === '{') i++;
      else i = balancedEnd(source, i) - 1;
    }
  }
  throw new Error('Unterminated C# string');
}

function balancedEnd(source, start) {
  const closing = { '(': ')', '{': '}', '[': ']' };
  const stack = [closing[source[start]]];
  for (let i = start + 1; i < source.length; i++) {
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new Error('Unterminated C# comment');
      i = end + 1;
    } else if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i + 2);
      if (end < 0) throw new Error('Unterminated Razor expression');
      i = end;
    } else if (source[i] === '"' || source[i] === "'") {
      i = stringEnd(source, i) - 1;
    } else if (closing[source[i]]) stack.push(closing[source[i]]);
    else if (source[i] === stack.at(-1)) {
      stack.pop();
      if (!stack.length) return i + 1;
    }
  }
  throw new Error('Unterminated Razor expression');
}

function razorEnd(source, start) {
  const tail = source.slice(start);
  if (tail.startsWith('@*')) {
    const end = source.indexOf('*@', start + 2);
    if (end < 0) throw new Error('Unterminated Razor comment');
    return end + 2;
  }
  const block = /^@(?:code\s*|functions\s*)?(?=[{(])/.exec(tail);
  if (block) return balancedEnd(source, start + block[0].length);
  const expression = /^@[\w.]+\s*(?=\()/.exec(tail);
  if (expression) return balancedEnd(source, start + expression[0].length);
  return start + 1;
}

export function staticAttributes(source) {
  const attributes = [];
  let skipped = 0;
  for (let i = 0; i < source.length;) {
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      if (end < 0) throw new Error('Unterminated HTML comment');
      i = end + 3;
    } else if (source[i] === '@') i = razorEnd(source, i);
    else if (source[i] === '<' && /^[A-Za-z]/.test(source[i + 1] ?? '')) {
      const tagStart = i++;
      let quote = null;
      for (; i < source.length; i++) {
        if (source[i] === '@') { i = razorEnd(source, i) - 1; continue; }
        if (quote) { if (source[i] === quote) quote = null; }
        else if (source[i] === '"' || source[i] === "'") quote = source[i];
        else if (source[i] === '>') break;
      }
      if (i === source.length) throw new Error('Unterminated HTML tag');
      const tag = source.slice(tagStart, ++i);
      if (/^<(script|style)\b/i.test(tag)) {
        const close = /<\/(?:script|style)\s*>/ig;
        close.lastIndex = i;
        const end = close.exec(source);
        if (!end) throw new Error('Unterminated script/style element');
        i = close.lastIndex;
        continue;
      }
      // shortcut: skip the entire tag when it contains Razor, until extraction uses a Razor parser.
      if (tag.includes('@')) { skipped++; continue; }
      const pattern = /([^\s=<>]+)\s*=\s*(["'])(.*?)\2/gs;
      for (const match of tag.matchAll(pattern)) {
        const name = match[1];
        const bound = [':class', 'v-bind:class', 'x-bind:class', '[class]', '[ngClass]', 'class:list'].includes(name);
        if (name !== 'class' && name !== 'className' && !bound) continue;
        let start = tagStart + match.index + match[0].indexOf(match[2]) + 1;
        let value = match[3];
        if (bound) {
          // shortcut: only whole string literals, until bindings use a framework expression parser.
          const literal = /^\s*(['"`])([^\\]*?)\1\s*$/s.exec(value);
          if (!literal || literal[2].includes(literal[1]) || (literal[1] === '`' && literal[2].includes('${'))) { skipped++; continue; }
          start += value.indexOf(literal[1]) + 1;
          value = literal[2];
        }
        if (/[&<"]/.test(value)) { skipped++; continue; }
        attributes.push({ start, end: start + value.length, value });
      }
    } else i++;
  }
  return { attributes, skipped };
}

export function replaceAttributes(source, attributes, values) {
  for (let i = attributes.length - 1; i >= 0; i--) {
    const attribute = attributes[i];
    const originalTokens = attribute.value.match(/\S+/g) ?? [];
    const tokens = values[i].match(/\S+/g) ?? [];
    if (originalTokens.join(' ') === tokens.join(' ')) continue;
    const gaps = attribute.value.trim().match(/\s+/g) ?? [];
    const leading = /^\s*/.exec(attribute.value)[0];
    const trailing = /\s*$/.exec(attribute.value)[0];
    const replacement = leading + tokens.map((token, n) => (n ? gaps[n - 1] ?? ' ' : '') + token).join('') + trailing;
    source = source.slice(0, attribute.start) + replacement + source.slice(attribute.end);
  }
  return source;
}
