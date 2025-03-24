import jsxAstUtils from 'jsx-ast-utils'
import url from '../url.js'

const {getProp} = jsxAstUtils

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'enforce [aria-label] text to be formatted as you would visual text.',
      url: url(import.meta.url),
      recommended: false,
    },
    schema: [],
    messages: {
      formatting: '[aria-label] text should be formatted the same as you would visual text. Use sentence case.',
    },
  },

  create(context) {
    return {
      JSXOpeningElement: node => {
        const prop = getProp(node.attributes, 'aria-label')
        if (!prop) return

        const propValue = prop.value
        if (propValue.type !== 'Literal') return

        const ariaLabel = propValue.value
        if (ariaLabel.match(/^[a-z]+.*$/)) {
          context.report({
            node,
            messageId: 'formatting',
          })
        }
      },
    }
  },
}
