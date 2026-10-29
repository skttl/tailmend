// Adapted from Theron Wang's MIT-licensed Visual Studio sorter. See vendor/visual-studio/README.md.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import enhancedResolve from 'enhanced-resolve';
import { createJiti } from 'jiti';

const dataRoot = new URL('./vendor/visual-studio/V4/', import.meta.url);
const resolveCss = enhancedResolve.create.sync({
  extensions: ['.css'], mainFields: ['style'], conditionNames: ['style'],
});

async function orderFor(version, name) {
  const order = JSON.parse(await readFile(new URL(name + '.json', dataRoot), 'utf8'));
  const minor = Number(version.split('.')[1]);
  if (minor >= 1 && minor <= 3) {
    const diff = JSON.parse(await readFile(new URL('V4_' + minor + '/' + name + '.json', dataRoot), 'utf8'));
    for (const item of diff.remove ?? []) {
      const index = order.indexOf(item);
      if (index !== -1) order.splice(index, 1);
    }
    for (const addition of diff.add ?? []) {
      for (const [item, index] of Object.entries(addition)) order.splice(index, 0, item);
    }
  }
  return new Map(order.map((item, index) => [item, index]));
}

// Colons inside arbitrary CSS values/selectors are not variant separators.
function splitVariants(token) {
  const parts = [];
  let start = 0, depth = 0, quote;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === '\\') { i++; continue; }
    if (quote) { if (char === quote) quote = undefined; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
    else if (char === ':' && depth === 0) { parts.push(token.slice(start, i)); start = i + 1; }
  }
  parts.push(token.slice(start));
  return parts;
}

function pixels(value) {
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em)?$/.exec(value);
  // Tailwind interprets em/rem in media queries relative to the initial 16px font.
  return match ? Number(match[1]) * (match[2] === 'rem' || match[2] === 'em' ? 16 : 1) : undefined;
}

export async function createSorter(cwd, config, version) {
  if (!version.startsWith('4.')) throw new Error('Class sorting requires Tailwind 4.');
  const projectRequire = createRequire(path.join(cwd, 'package.json'));
  const { __unstable__loadDesignSystem: load } = projectRequire('tailwindcss');
  if (typeof load !== 'function') throw new Error('Project Tailwind does not expose its design system.');
  const design = await load(await readFile(config, 'utf8'), {
    base: path.dirname(config),
    async loadStylesheet(id, base) {
      const file = resolveCss(base, id);
      if (!file) throw new Error('Cannot resolve CSS import: ' + id);
      return { path: file, base: path.dirname(file), content: await readFile(file, 'utf8') };
    },
    async loadModule(id, base) {
      const jiti = createJiti(path.join(base, 'tailmend-loader.mjs'), { fsCache: false });
      const file = jiti.resolve(id);
      return { path: file, base: path.dirname(file), module: await jiti.import(file, { default: true }) };
    },
  });
  const [classes, variants] = await Promise.all([orderFor(version, 'order'), orderFor(version, 'variantorder')]);
  const theme = design.theme;
  const colors = new Set(['inherit', 'current', 'transparent', ...theme.keysInNamespaces(['--color'])]);
  const spacing = new Set(theme.keysInNamespaces(['--spacing']));
  const sizes = namespace => new Map(theme.keysInNamespaces([namespace]).map(key => [
    key, pixels(theme.get([namespace + '-' + key])),
  ]));
  const breakpoints = sizes('--breakpoint');
  const containers = sizes('--container');

  function variantRank(variant) {
    // Named group/peer modifiers do not change the variant category.
    const name = splitVariants(variant)[0].replace(/\/[^\[\]()]+$/, '');
    if (variants.has(name)) return variants.get(name) * 100;
    const breakpoint = /^(not-)?([\w-]+)$/.exec(name);
    if (breakpoint && breakpoints.has(breakpoint[2])) {
      const size = breakpoints.get(breakpoint[2]);
      const rank = variants.get((breakpoint[1] ?? '') + '{b}');
      if (rank !== undefined && size !== undefined) {
        return rank * 100 + [...breakpoints.values()].filter(value => value < size).length;
      }
    }
    // Upstream uses bracket placeholders for functional and container variants.
    const container = /^@(min-|max-)?([\w-]+)$/.exec(name);
    if (container && containers.has(container[2])) {
      const size = containers.get(container[2]);
      const rank = variants.get('@' + (container[1] ?? '') + '[]');
      if (rank !== undefined && size !== undefined) {
        const earlier = [...containers.values()].filter(value => container[1] === 'max-' ? value > size : value < size).length;
        return rank * 100 + earlier;
      }
    }
    const arbitrary = name.replace(/\[.*\]/, '[]');
    if (arbitrary !== name && variants.has(arbitrary)) return variants.get(arbitrary) * 100;
    return -1;
  }

  function utilityRank(token, utility) {
    if (theme.prefix && !token.startsWith(theme.prefix + ':')) return -1;
    const bare = utility.replace(/^!|!$/g, '');
    if (classes.has(bare)) return classes.get(bare);
    // The project's parser resolves utility roots without guessing where hyphens
    // in custom colors, negatives or arbitrary values belong.
    for (const candidate of design.parseCandidate(token)) {
      if (candidate.kind !== 'functional' || !candidate.value) continue;
      const { root, value } = candidate;
      let key;
      if (value.kind === 'arbitrary') {
        const square = bare.includes('[');
        key = square && classes.has(root + '-{s}') ? root + '-{s}'
          : square && classes.has(root + '-{c}') ? root + '-{c}' : root + '-{a}';
      } else {
        const exact = root + '-' + value.value;
        if (classes.has(exact)) return classes.get(exact);
        if (colors.has(value.value)) key = root + '-{c}';
        else if (spacing.has(value.value) || value.value === 'px') key = root + '-{s}';
        else if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.value)) {
          key = root + (classes.has(root + '-{s}') ? '-{s}' : '-{n}');
          if (value.fraction && /^\d+\/\d+$/.test(value.fraction)) key = root + '-{f}';
        } else if (/^\d+%$/.test(value.value)) key = root + '-{%}';
      }
      if (classes.has(key)) return classes.get(key);
    }
    return -1;
  }

  const cache = new Map();
  function sortKey(token) {
    if (cache.has(token)) return cache.get(token);
    const parts = splitVariants(token);
    if (theme.prefix && parts[0] === theme.prefix) parts.shift();
    const utility = parts.pop();
    const highestVariant = Math.max(-1, ...parts.map(variantRank));
    const key = [
      parts[0]?.startsWith('group-') ? 0 : parts.length,
      parts.length ? highestVariant === -1 ? Infinity : highestVariant : 0,
      utilityRank(token, utility),
    ];
    cache.set(token, key);
    return key;
  }
  return value => (value.match(/\S+/g) ?? []).map(token => ({ token, key: sortKey(token) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      return 0;
    }).map(item => item.token).join(' ');
}
