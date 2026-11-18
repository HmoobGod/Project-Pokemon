// Relative base so the built game loads from local files (e.g. bundled in an Android WebView) with no server.
export default {
  base: './',
  // 'mpa' = no SPA fallback: a missing ./private-sprites/sprites.js must be a real 404, not index.html.
  appType: 'mpa',
  // modulePreload polyfill disabled: it is unneeded for one entry chunk and would add a fetch() call.
  build: { outDir: 'dist', assetsInlineLimit: 0, sourcemap: false, target: 'es2020', modulePreload: { polyfill: false }, chunkSizeWarningLimit: 700 },
};
