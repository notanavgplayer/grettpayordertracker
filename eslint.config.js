import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const browserGlobals = {
  console: 'readonly',
  crypto: 'readonly',
  document: 'readonly',
  import: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  window: 'readonly',
}

export default [
  {
    ignores: ['.vite/**', 'dist/**', 'node_modules/**', 'functions/node_modules/**'],
  },
  {
    files: ['src/**/*.{js,jsx}', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        exports: 'writable',
        require: 'readonly',
      },
    },
  },
]
