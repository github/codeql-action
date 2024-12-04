const github = require('./plugin')

const getFlatConfig = () => ({
  browser: require('./configs/flat/browser'),
  internal: require('./configs/flat/internal'),
  recommended: require('./configs/flat/recommended'),
  typescript: require('./configs/flat/typescript'),
  react: require('./configs/flat/react'),
})

module.exports = {
  rules: github.rules,
  configs: {
    browser: require('./configs/browser'),
    internal: require('./configs/internal'),
    recommended: require('./configs/recommended'),
    typescript: require('./configs/typescript'),
    react: require('./configs/react'),
  },
  getFlatConfigs: getFlatConfig,
}
