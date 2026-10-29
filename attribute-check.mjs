import assert from 'node:assert/strict';
import { staticAttributes, replaceAttributes } from './razor.mjs';

for (const name of ['class', 'className', ':class', 'v-bind:class', 'x-bind:class', '[class]', '[ngClass]', 'class:list']) {
  const bound = !['class', 'className'].includes(name);
  const source = bound ? `<div ${name}="'p-4 p-4'"></div>` : `<div ${name}="p-4 p-4"></div>`;
  const { attributes } = staticAttributes(source);
  assert.deepEqual(attributes.map(item => item.value), ['p-4 p-4'], name);
  assert.equal(replaceAttributes(source, attributes, ['p-4']), source.replace('p-4 p-4', 'p-4'), name);
}
for (const source of [
  '<div :class="classes"></div>',
  '<div x-bind:class="{ hidden: !open }"></div>',
  '<div :class="open ? \'p-4\' : \'p-8\'"></div>',
  '<div :class="`p-${size}`"></div>',
  '<div :class="\'p-4\\np-8\'"></div>',
  '<div data-class="p-4"></div>',
  '<div title=\' className="p-4"\'></div>',
]) assert.equal(staticAttributes(source).attributes.length, 0, source);
console.log('PASS: class attribute aliases, static binding literals, replacement boundaries, dynamic exclusions.');
