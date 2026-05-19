module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  rules: {
    // Project does not use prop-types — types are not enforced here.
    'react/prop-types': 'off',
    // HMR-only hint, no runtime impact.
    'react-refresh/only-export-components': 'off',
    // Reviewed manually; auto-adding deps risks behavior changes pre-launch.
    'react-hooks/exhaustive-deps': 'off',
    // Literal quotes/apostrophes in JSX text are valid — not a bug.
    'react/no-unescaped-entities': 'off',
  },
}
