import github from '../../plugin.js'
import {fixupPluginRules} from '@eslint/compat'

export default {
  plugins: {github: fixupPluginRules(github)},
  rules: {
    'github/authenticity-token': 'error',
    'github/js-class-name': 'error',
    'github/no-d-none': 'error',
  },
}
