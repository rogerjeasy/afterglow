// Bundles the Lambda into dist/index.mjs. The AWS SDK v3 ships with the Node.js
// Lambda runtime, so it stays external and the bundle holds only our code.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/lambda.ts'],
  outfile: 'dist/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  external: ['@aws-sdk/*'],
  banner: { js: '// Afterglow vault service. Source: services/vault/src.' },
});
console.log('built dist/index.mjs');
