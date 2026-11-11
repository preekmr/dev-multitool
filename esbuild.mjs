import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  // Telemetry is only enabled in release builds that set POSTHOG_KEY (see release.yml).
  define: {
    __POSTHOG_KEY__: JSON.stringify(process.env.POSTHOG_KEY ?? ''),
    __POSTHOG_HOST__: JSON.stringify(process.env.POSTHOG_HOST ?? ''),
  },
  // Keep function names so error stack traces stay readable in the minified bundle.
  keepNames: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
