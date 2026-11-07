// bundles each action into one file that the runner executes with node24
import { build } from 'esbuild';

for (const name of ['check', 'report']) {
  await build({
    entryPoints: [`src/${name}/index.ts`],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    outfile: `${name}/dist/index.cjs`,
    legalComments: 'external',
    // tinyglobby calls createRequire(import.meta.url), which is undefined in cjs
    banner: { js: "const __rgMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
    define: { 'import.meta.url': '__rgMetaUrl' },
    logLevel: 'warning',
  });
  console.log(`built ${name}/dist/index.cjs`);
}
