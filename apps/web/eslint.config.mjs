// Vendoora — apps/web ESLint flat config.
//
// Composes:
//   1. @vendoora/config/eslint  — repo-wide rules (Build_Prompt §9.4).
//      Scoped to TS/TSX files because some rules
//      (e.g. @typescript-eslint/consistent-type-imports) require
//      TypeScript's parser + parserOptions.projectService.
//   2. eslint-config-next via FlatCompat — Next.js 15 ships a legacy
//      `.eslintrc`-style config that requires the @eslint/eslintrc
//      compat shim to load under ESLint 9 flat config.
//      See: https://nextjs.org/docs/app/api-reference/config/eslint
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import sharedConfig from '@vendoora/config/eslint';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

// Scope every block in the shared config to TS/TSX files only, and
// attach parserOptions.projectService so type-aware rules work.
const scopedSharedConfig = sharedConfig.map((block) => {
  if (block.ignores && Object.keys(block).length === 1) return block;
  return {
    ...block,
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ...(block.languageOptions ?? {}),
      parserOptions: {
        ...(block.languageOptions?.parserOptions ?? {}),
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  };
});

const eslintConfig = [
  ...scopedSharedConfig,
  ...compat.config({
    extends: ['next'],
  }),
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
