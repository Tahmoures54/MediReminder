/// <reference types="vite/client" />

// Custom env vars consumed by src/constants.ts. Add entries here whenever
// you introduce a new import.meta.env.VITE_* usage.
interface ImportMetaEnv {
  /** Injected from package.json version by vite.config.ts. */
  readonly VITE_APP_VERSION: string;
  /** ISO timestamp of the build, injected by vite.config.ts. */
  readonly VITE_BUILD_DATE: string;
  /** Release channel: 'dev' | 'beta' | 'final'. */
  readonly VITE_RELEASE_CHANNEL: 'dev' | 'beta' | 'final';
}

// Augment the ImportMeta interface so `import.meta.env.X` is typed globally.
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
