import babelParser from '@babel/eslint-parser';
import playwright from 'eslint-plugin-playwright';

export default [
  {
    ...playwright.configs['flat/recommended'],
    files: ['tests/**/*.spec.ts', 'tests/api/**/*.ts'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ['typescript'] },
        },
      },
    },
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/expect-expect': ['error', { assertFunctionNames: ['expect', 'expectQuote', 'expectErrors'] }],
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-element-handle': 'error',
      'playwright/no-page-pause': 'error',
    },
  },
];
