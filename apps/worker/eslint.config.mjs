// Vendoora — @vendoora/worker ESLint flat config.
// Re-exports the repo-wide rules, scoped to TS with parserOptions.projectService.
import sharedConfig from '@vendoora/config/eslint';

const scopedSharedConfig = sharedConfig.map((block) => {
  if (block.ignores && Object.keys(block).length === 1) return block;
  return {
    ...block,
    files: ['**/*.ts'],
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

export default [
  ...scopedSharedConfig,
  {
    ignores: ['node_modules/**'],
  },
];
