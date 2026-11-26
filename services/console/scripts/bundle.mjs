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
  // web-push is CommonJS and requires Node built-ins at run time; give the ES module
  // bundle a real `require` for them.
  banner: {
    js: [
      '// Afterglow console service. Source: services/console/src.',
      "import { createRequire as __agCreateRequire } from 'node:module';",
      'const require = __agCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});
console.log('built dist/index.mjs');
