const globals = require('globals')
const github = require('../../plugin')
const importPlugin = require('eslint-plugin-import')
const escompatPlugin = require('eslint-plugin-escompat')
const {fixupPluginRules} = require('@eslint/compat')

module.exports = {
  ...escompatPlugin.configs['flat/recommended'],
  languageOptions: {
    globals: {
      ...globals.browser,
    },
  },
  plugins: {importPlugin, escompatPlugin, github: fixupPluginRules(github)},
  rules: {
    'escompatPlugin/no-dynamic-imports': 'off',
    'github/async-currenttarget': 'error',
    'github/async-preventdefault': 'error',
    'github/get-attribute': 'error',
    'github/no-blur': 'error',
    'github/no-dataset': 'error',
    'github/no-innerText': 'error',
    'github/no-inner-html': 'error',
    'github/unescaped-html-literal': 'error',
    'github/no-useless-passive': 'error',
    'github/require-passive-events': 'error',
    'github/prefer-observers': 'error',
    'importPlugin/no-nodejs-modules': 'error',
    'no-restricted-syntax': [
      'error',
      {
        selector: "NewExpression[callee.name='URL'][arguments.length=1]",
        message: 'Please pass in `window.location.origin` as the 2nd argument to `new URL()`',
      },
    ],
  },
}
