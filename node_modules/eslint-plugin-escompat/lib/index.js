const path = require('path')
const browserslist = require('browserslist')
const {findConfig} = require('browserslist/node')
const {version,homepage} = require('../package.json')
const createRule = (name, browserstring, description, {ts = null} = {}) => {
  const rule = require(`./rules/${name}`)
  module.exports.rules[name] = {
    meta: Object.assign({
      type: 'problem',
      docs: {
        description,
        recommended: true,
        url: `${homepage}/blob/v${version}/docs/${name}.md`
      },
      fixable: false,
      schema: [],
      deprecated: false,
      replacedBy: null,
    }, rule.meta || {}),
    create(context) {
      let browsers = browserslist(browserstring)
      const config = findConfig(path.dirname(context.getFilename())) || { defaults: 'defaults' }
      const desiredBrowsers = browserslist(config.defaults)
      const badBrowsers = desiredBrowsers.filter(browser => browsers.indexOf(browser) !== -1).join(', ')
      if (badBrowsers) {
        const create = typeof rule === 'function' ? rule : rule.create
        return create(context, badBrowsers)
      }
      return {}
    }
  }

  const configName = `typescript-${ts || 'base'}`
  if (!module.exports.configs[configName]) {
    let config = {rules: {}}
    if (ts === 2016) {
      config.extends = [`plugin:escompat/typescript-base`]
    } else if (ts) {
      let previous = ts - 1
      while (!module.exports.configs[`typescript-${previous}`]) previous -= 1
      
      config.extends = [`plugin:escompat/typescript-${previous}`]
    }
    module.exports.configs[configName] = config
  }
  module.exports.configs[`typescript-base`].rules[`escompat/${name}`] = 'off'
  module.exports.configs[configName].rules[`escompat/${name}`] = 'error'
}

module.exports = { rules: {}, configs: {} }
// ES2015
createRule('no-edge-destructure-bug', 'edge < 18', 'disallow the use of specific destructuring patterns that cause bugs in old Edge')

// ES2016
createRule('no-exponentiation-operator', 'chrome < 52, edge < 14, firefox < 52, safari < 10.1', 'disallow use of exponentiation operator (**)', {ts: 2016})

// ES2018
createRule('no-async-iteration', 'edge < 79, safari < 12, firefox < 57, chrome < 63', 'disallow the use of `for await of` style loops', {ts: 2018})
createRule('no-async-generator', 'edge < 79, safari < 12, firefox < 57, chrome < 63', 'disallow the use of async generator functions', {ts: 2018})
createRule('no-object-rest-spread', 'edge < 79, safari < 11.1, firefox < 55, chrome < 60', 'disallow object rest/spread patterns', {ts: 2018})
createRule('no-regexp-s-flag', 'edge < 79, safari < 11.1, firefox < 78, chrome < 62', 'disallow the use of the RegExp `s` flag')
createRule('no-regexp-lookbehind', 'edge < 79, safari > 0, firefox < 78, chrome < 62', 'disallow the use of RegExp lookbehinds')
createRule('no-regexp-named-group', 'edge < 79, safari 11.1, firefox < 78, chrome < 64', 'disallow the use of RegExp named groups')

// ES2019
createRule('no-optional-catch', 'edge < 79, safari < 11.1, firefox < 58, chrome < 66', 'always require catch() to have an argument', {ts: 2019})

// ES2020
createRule('no-dynamic-imports', 'edge < 79, safari < 11, firefox < 67, chrome < 63', 'disallow dynamic import statements')
createRule('no-optional-chaining', 'edge < 80, safari < 13.1, firefox < 72, chrome < 80', 'disallow the .? optional chaning operator', {ts: 2020})
createRule('no-nullish-coalescing', 'edge < 80, safari < 13.1, firefox < 72, chrome < 80', 'disallow the ?? nullish coalescing operator', {ts: 2020})
createRule('no-bigint', 'edge < 79, safari < 14, firefox < 68, chrome < 67', 'disallow bigints')

// ES2021
createRule('no-numeric-separators', 'edge < 79, safari < 13, firefox < 68, chrome < 75', 'disallow use of numeric seperators like 1_000_000', {ts:2021})

// ES2022
createRule('no-public-static-class-fields', 'edge < 79, safari < 14.5, firefox < 75, chrome < 72', 'disallow public static class fields like foo = 1', {ts: 2022})
createRule('no-public-instance-class-fields', 'edge < 79, safari < 14.5, firefox < 69, chrome < 72', 'disallow public class fields like foo = 1', {ts: 2022})
createRule('no-computed-public-class-fields', 'edge < 79, safari < 14.5, firefox < 69, chrome < 74', 'disallow computed public static or instance class fields like [foo] = 1', {ts: 2022})
createRule('no-private-class-fields', 'edge < 79, safari < 14.5, firefox < 90, chrome < 74', 'disallow private class fields like #foo = 1', {ts: 2022})

// Proposals...
createRule('no-do-expression', 'edge > 0, safari > 0, firefox > 0, chrome > 0', 'disallow "do" expressions')
createRule('no-bind-operator', 'edge > 0, safari > 0, firefox > 0, chrome > 0', 'disallow the :: bind operator')
createRule('no-pipeline-operator', 'edge > 0, safari > 0, firefox > 0, chrome > 0', 'disallow the > pipeline operator')

module.exports.configs.recommended = {
  plugins: ['escompat'],
  parserOptions: { ecmaVersion: 2020 },
  rules: Object.keys(module.exports.rules).reduce((o, r) => (o['escompat/' + r] = ['error'], o), {})
}

module.exports.configs.typescript = {
  extends: ['plugin:escompat/typescript-2016']
}

if (require.main === module) {
  console.log(require('util').inspect(module.exports, {depth: Infinity}))
}
