const eslint = require('@eslint/js')
const tseslint = require('typescript-eslint')
const escompatPlugin = require('eslint-plugin-escompat')
const github = require('../../plugin')
const {fixupPluginRules} = require('@eslint/compat')

module.exports = tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended, {
  languageOptions: {
    parser: tseslint.parser,
  },
  plugins: {'@typescript-eslint': tseslint.plugin, escompatPlugin, github: fixupPluginRules(github)},
  rules: {
    camelcase: 'off',
    'no-unused-vars': 'off',
    'no-shadow': 'off',
    'no-invalid-this': 'off',
    '@typescript-eslint/no-invalid-this': ['error'],
    '@typescript-eslint/no-shadow': ['error'],
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/array-type': ['error', {default: 'array-simple'}],
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/explicit-member-accessibility': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
})
