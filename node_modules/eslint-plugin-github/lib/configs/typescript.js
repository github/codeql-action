module.exports = {
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'github'],
  rules: {
    camelcase: 'off',
    'no-unused-vars': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': ['error'],
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/array-type': ['error', {default: 'array-simple'}],
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/explicit-member-accessibility': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off'
  }
}
