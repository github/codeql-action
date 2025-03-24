import github from './plugin.js'
import flatBrowserConfig from './configs/flat/browser.js'
import flatInternalConfig from './configs/flat/internal.js'
import flatRecommendedConfig from './configs/flat/recommended.js'
import flatTypescriptConfig from './configs/flat/typescript.js'
import flatReactConfig from './configs/flat/react.js'
import browserConfig from './configs/browser.js'
import internalConfig from './configs/internal.js'
import recommendedConfig from './configs/recommended.js'
import typescriptConfig from './configs/typescript.js'
import reactConfig from './configs/react.js'

const getFlatConfig = () => ({
  browser: flatBrowserConfig,
  internal: flatInternalConfig,
  recommended: flatRecommendedConfig,
  typescript: flatTypescriptConfig,
  react: flatReactConfig,
})

export default {
  rules: github.rules,
  configs: {
    browser: browserConfig,
    internal: internalConfig,
    recommended: recommendedConfig,
    typescript: typescriptConfig,
    react: reactConfig,
  },
  getFlatConfigs: getFlatConfig,
}
