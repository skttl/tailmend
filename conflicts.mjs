import postcss from 'postcss';
import { parse, walk, lexer, ident } from 'css-tree';

function supportedDeclaration(declaration) {
  const { prop, value } = declaration;
  if (prop.startsWith('--') || !lexer.getProperty(prop) || /\brevert(?:-layer)?\b/.test(value)) return false;
  try {
    const ast = parse(value, { context: 'value' });
    let variable = false, valid = true;
    walk(ast, node => {
      if (node.type === 'Raw') valid = false;
      if (node.type !== 'Function' || node.name !== 'var') return;
      variable = true;
      const args = [...node.children];
      if (args[0]?.type !== 'Identifier' || !/^--[\w-]+$/.test(args[0].name)
          || (args.length > 1 && !(args[1].type === 'Operator' && args[1].value === ','))) valid = false;
    });
    // Valid var() declarations participate in the cascade even if substitution
    // later fails. css-tree deliberately cannot grammar-match those values.
    return valid && (variable || Boolean(lexer.matchProperty(prop, ast).matched));
  } catch { return false; }
}

function declarations(rule) {
  const result = [];
  let supported = true;
  rule.walk(node => {
    if (node.type === 'atrule' && (!['media', 'supports', 'container', 'layer'].includes(node.name)
        || (node.name === 'layer' && !node.params))) supported = false;
    if (node.type !== 'decl') return;
    if (!supportedDeclaration(node)) supported = false;
    const context = [];
    for (let parent = node.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent === rule) continue;
      if (parent.type === 'rule') context.unshift(['selector', parent.selector]);
      else if (parent.type === 'atrule') {
        if (!['media', 'supports', 'container', 'layer'].includes(parent.name)
            || (parent.name === 'layer' && !parent.params)) supported = false;
        context.unshift([parent.name, parent.params]);
      }
    }
    result.push({ node, key: JSON.stringify([context, node.prop]), important: Boolean(node.important) });
  });
  if (new Set(result.map(item => item.key)).size !== result.length) supported = false;
  return supported && result.length ? result : null;
}

function ownClassSelector(selector, token) {
  try {
    const list = parse(selector, { context: 'selectorList' });
    const selectors = [...list.children];
    const nodes = selectors.length === 1 ? [...selectors[0].children] : [];
    return nodes.length === 1 && nodes[0].type === 'ClassSelector' && ident.decode(nodes[0].name) === token;
  } catch { return false; }
}

export async function createConflictResolver(project, knownClasses = []) {
  const { design } = project;
  // Include references from other extracted attributes before deleting anything.
  if (knownClasses.length) await project.buildCss(knownClasses);
  const profiles = new Map();
  function profile(token) {
    if (profiles.has(token)) return profiles.get(token);
    const candidates = design.parseCandidate(token);
    let result = null;
    if (candidates.length && candidates.every(candidate => candidate.kind !== 'arbitrary'
        && candidate.value?.kind !== 'arbitrary' && candidate.variants.every(variant => variant.kind !== 'arbitrary'))) {
      const css = design.candidatesToCss([token])[0];
      if (css) {
        const nodes = postcss.parse(css).nodes.filter(node => node.type !== 'comment');
        if (nodes.length === 1 && nodes[0].type === 'rule' && ownClassSelector(nodes[0].selector, token) && declarations(nodes[0])) {
          result = { selector: nodes[0].selector };
        }
      }
    }
    profiles.set(token, result);
    return result;
  }

  let lastCss, output;
  return async value => {
    const tokens = value.match(/\S+/g) ?? [];
    if (tokens.length < 2) return value;
    const selectors = new Map();
    for (const token of tokens) {
      const info = profile(token);
      if (info) selectors.set(info.selector, token);
    }
    if (selectors.size < 2) return value;
    const css = await project.buildCss(tokens);
    if (css !== lastCss) { output = postcss.parse(css); lastCss = css; }
    const entries = new Map(), blocked = new Set();
    const tokenSet = new Set(tokens);
    output.walkAtRules('scope', () => { for (const token of tokens) blocked.add(token); });
    output.walkRules(rule => {
      const token = selectors.get(rule.selector);
      if (token) {
        const list = declarations(rule);
        // Multiple rules for the same class may be project overrides. Leave it.
        if (!list || entries.has(token)) blocked.add(token);
        else entries.set(token, list);
      }
      // Class-dependent custom selectors can make a seemingly losing class
      // meaningful elsewhere in the configured stylesheet.
      try {
        walk(parse(rule.selector, { context: 'selectorList' }), node => {
          if (node.type === 'AttributeSelector' && ident.decode(node.name.name).toLowerCase().split('|').at(-1) === 'class') {
            for (const item of tokens) blocked.add(item);
          }
          if (node.type !== 'ClassSelector') return;
          const referenced = ident.decode(node.name);
          if (referenced !== token && tokenSet.has(referenced)) blocked.add(referenced);
        });
      } catch {
        // An unparsed selector cannot prove independence from these class names.
        for (const item of tokens) blocked.add(item);
      }
    });
    const order = new Map();
    let index = 0;
    output.walkDecls(node => order.set(node, index++));
    const winners = new Map();
    for (const [token, list] of entries) {
      if (blocked.has(token)) continue;
      for (const item of list) {
        const winner = winners.get(item.key);
        if (!winner || Number(item.important) > Number(winner.important)
            || (item.important === winner.important && order.get(item.node) > order.get(winner.node))) {
          winners.set(item.key, { ...item, token });
        }
      }
    }
    return tokens.filter(token => blocked.has(token) || !entries.has(token)
      || entries.get(token).some(item => winners.get(item.key)?.token === token)).join(' ');
  };
}
