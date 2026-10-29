import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import enhancedResolve from 'enhanced-resolve';
import { createJiti } from 'jiti';

const resolveCss = enhancedResolve.create.sync({
  extensions: ['.css'], mainFields: ['style'], conditionNames: ['style'],
});

export async function loadTailwindProject(cwd, config) {
  const projectRequire = createRequire(path.join(cwd, 'package.json'));
  const tailwind = projectRequire('tailwindcss');
  if (typeof tailwind.__unstable__loadDesignSystem !== 'function') throw new Error('Project Tailwind does not expose its design system.');
  const css = await readFile(config, 'utf8');
  const options = {
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
  };
  const design = await tailwind.__unstable__loadDesignSystem(css, options);
  let compiler;
  return {
    design,
    async buildCss(tokens) {
      compiler ??= tailwind.compile(css, options).then(result => {
        if (!(result.features & tailwind.Features.Utilities)) {
          throw new Error('CSS does not generate Tailwind utilities. Use the full CSS entrypoint importing "tailwindcss" or containing "@tailwind utilities", not a theme-only file: ' + config);
        }
        return result;
      });
      return (await compiler).build(tokens);
    },
  };
}
