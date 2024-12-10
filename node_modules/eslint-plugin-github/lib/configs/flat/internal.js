const github = require('../../plugin')
const {fixupPluginRules} = require('@eslint/compat')

module.exports = {
  plugins: {github: fixupPluginRules(github)},
  rules: {
    'github/authenticity-token': 'error',
    'github/js-class-name': 'error',
    'github/no-d-none': 'error',
  },
}
