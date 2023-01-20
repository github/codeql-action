module.exports = {
  parserOptions: {
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: ['github', 'jsx-a11y'],
  extends: ['plugin:jsx-a11y/recommended'],
  rules: {
    'github/a11y-no-generic-link-text': 'error'
  }
}
