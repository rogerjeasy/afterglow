// Bundles the Lambda into dist/index.mjs with the core and simulator inlined. The AWS
// SDK v3 ships with the Node.js Lambda runtime, so it stays external.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/lambda.ts'],
  outfile: 'dist/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  legalComments: 'none',
  external: ['@aws-sdk/*'],
  banner: { js: '// Afterglow crowd service. Source: services/crowd/src.' },
});
console.log('built dist/index.mjs');
