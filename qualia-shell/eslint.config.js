// eslint.config.js — Dwellium flat config (ESLint 9, ESM).
//
// Composes:
//   - typescript-eslint "recommended" (NON type-checked → fast, no tsconfig project graph)
//   - eslint-plugin-react-hooks "recommended"
//   - eslint-plugin-jsx-a11y "recommended"
//
// Posture: introduced as a NON-BLOCKING signal (see Scripts/gate.sh). Initially-noisy
// rules are set to "warn" so the first run does not fail anything; the genuine-bug
// rule `react-hooks/rules-of-hooks` stays "error". Once the warning backlog is
// triaged, ratchet `exhaustive-deps` / `no-unused-vars` to "error" (follow-up plan).
//
// Targets src/** and app/**. Build output, vendored bundles, electron, scratch dirs,
// CommonJS scripts, and Playwright e2e baselines are ignored.

import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default tseslint.config(
  // Global ignores — keep this BEFORE other config objects so it applies everywhere.
  {
    ignores: [
      'build/**',
      'dist/**',
      'dist-external/**',
      'node_modules/**',
      '**/*.cjs',
      'scratch/**',
      'blast/**',
      'electron/**',
      'e2e/**',
    ],
  },

  // typescript-eslint recommended (non-type-checked variant — no `project` wiring).
  ...tseslint.configs.recommended,

  // Project source: src/** + app/**.
  {
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // React Hooks: rules-of-hooks are genuine bugs → keep as error.
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',

      // jsx-a11y recommended ruleset.
      ...jsxA11y.flatConfigs.recommended.rules,

      // Initially-noisy TS rules dialed to warn so the first run is advisory only.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
    },
  },
);
