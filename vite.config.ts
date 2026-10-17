import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/* ==========================================================================
 * vite.config.ts — build, dev server, and test configuration
 *
 * Loaded by:
 *   - `vite` (dev server)
 *   - `vite build` (production build → dist/)
 *   - `vitest` (test runner — uses the `test` field below)
 *
 * Critical invariants
 * ==================
 *   1. `resolve.alias['@']` MUST mirror `compilerOptions.paths['@/*']` in
 *      tsconfig.json. If they drift, type-check passes but runtime imports
 *      break.
 *
 *   2. `build.target` MUST stay `es2020` to match `tsconfig.json` target
 *      and keep Android 8+ (Chrome 80+) compatibility. Raising it without
 *      bumping the tsconfig target produces inconsistent output.
 *
 *   3. `publicDir: 'public'` MUST stay — Capacitor copies `dist/` into the
 *      native shell, and the manifest + icons must end up in the bundle
 *      root. Removing it would silently break PWA install + icon loading.
 *
 *   4. `server.hmr.clientPort: 443` is intentional for the Arena preview
 *      environment where the dev server is tunneled over HTTPS. Do NOT
 *      change it to 5173 — that breaks HMR in production-preview setups.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Path resolution (ESM equivalent of __dirname)
 * -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* --------------------------------------------------------------------------
 * Constants
 * -------------------------------------------------------------------------- */

/** Source directory — MUST match `paths['@/*']` in tsconfig.json. */
const SRC_DIR = 'src';
/** Public assets directory — files here are copied verbatim to dist/. */
const PUBLIC_DIR = 'public';
/** Build output directory — MUST match `webDir` in capacitor.config.ts. */

/** Dev server port. */
const DEV_PORT = 5173;
/** Preview server port (for `vite preview` after build). */
const PREVIEW_PORT = 4173;
/** HMR client port — 443 for HTTPS-tunneled preview environments. */
const HMR_CLIENT_PORT = 443;

/** Build target — MUST match tsconfig.json `target`. */
const BUILD_TARGET = 'es2020';
/** Chunk size warning limit (KB). Mobile builds should stay small. */
const CHUNK_SIZE_WARNING_LIMIT_KB = 600;

/* --------------------------------------------------------------------------
 * Vendor chunk definitions
 *
 * Splitting vendor code into separate chunks improves caching: when app
 * code changes, the vendor chunks stay cached and only the app chunk
 * re-downloads. Keep these groupings stable — changing them busts the
 * cache for every user on the next deploy.
 * -------------------------------------------------------------------------- */

const REACT_VENDOR = ['react', 'react-dom'];

const CAPACITOR_VENDOR = [
  '@capacitor/core',
  '@capacitor/local-notifications',
  '@capacitor/haptics',
  '@capacitor/share',
];

/* --------------------------------------------------------------------------
 * Config
 * -------------------------------------------------------------------------- */

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      // Mirror of `compilerOptions.paths['@/*']` in tsconfig.json.
      // Keep them in sync — see invariant #1 in the file header.
      '@': path.resolve(__dirname, SRC_DIR),
    },
  },

  /* ---------------------------- dev server ---------------------------- */
  server: {
    // Bind to all interfaces so the dev server is reachable from the
    // Arena preview tunnel and from a local Android emulator.
    host: '0.0.0.0',
    port: DEV_PORT,
    // strictPort: false lets Vite fall back to 5174/5175/... if 5173 is
    // taken. Set to true only in CI where a port conflict should fail
    // loudly.
    strictPort: false,
    hmr: {
      // Force HMR client to connect on 443 so it works through the
      // HTTPS reverse proxy used by Arena preview. See invariant #4.
      clientPort: HMR_CLIENT_PORT,
    },
  },

  /* --------------------------- preview server -------------------------- */
  preview: {
    host: '0.0.0.0',
    port: PREVIEW_PORT,
  },

  /* ------------------------------ build ------------------------------- */
  build: {
    // MUST match tsconfig.json target. See invariant #2.
    target: BUILD_TARGET,

    // Split CSS by chunk — pairs with JS code-splitting so route-level
    // CSS loads lazily.
    cssCodeSplit: true,

    // Source maps disabled for production — they leak source paths and
    // add ~30% to bundle size. Enable temporarily when debugging a
    // production-only issue.
    sourcemap: false,

    // esbuild is faster than terser and produces comparable output for
    // this app's size. Switch to 'terser' only if you need advanced
    // transforms (e.g. variable name mangling beyond esbuild's defaults).
    minify: 'esbuild',
    cssMinify: true,

    rollupOptions: {
      output: {
        manualChunks: {
          // React runtime — changes rarely, caches well.
          vendor: REACT_VENDOR,
          // Capacitor native bridge — changes only on plugin upgrades.
          capacitor: CAPACITOR_VENDOR,
        },
        // Deterministic file names with content hashes — required for
        // long-term SW caching. The hash changes only when content
        // changes, so users download only the diff.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },

    // Warn if any single chunk exceeds this size — mobile users on 3G
    // should not download >600KB of JS in one go.
    chunkSizeWarningLimit: CHUNK_SIZE_WARNING_LIMIT_KB,
  },

  /* ------------------------------- test ------------------------------- */
  test: {
    // node environment is sufficient for the contract tests (which read
    // source files and assert on strings). Switch to 'jsdom' or 'happy-dom'
    // only if a test needs DOM APIs (e.g. rendering React components).
    environment: 'node',

    // Only pick up *.test.ts — keeps *.test.tsx (if added later) out of
    // the node-environment run. Add a second glob if you want jsdom-based
    // component tests in a separate run.
    include: ['src/**/*.test.ts'],

    // Exclude e2e and build artifacts from test discovery.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
  },

  /* ----------------------------- public dir --------------------------- */
  // Files in public/ are copied verbatim to dist/. The manifest, icons,
  // and service worker MUST land here for the PWA + Capacitor shell to
  // find them. See invariant #3.
  publicDir: PUBLIC_DIR,
});
