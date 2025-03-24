import url from '../url.js'

const passiveEventListenerNames = new Set([
  'touchstart',
  'touchmove',
  'touchenter',
  'touchend',
  'touchleave',
  'wheel',
  'mousewheel',
])

const propIsPassiveTrue = prop => prop.key && prop.key.name === 'passive' && prop.value && prop.value.value === true

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'enforce marking high frequency event handlers as passive',
      url: url(import.meta.url),
      recommended: false,
    },
    schema: [],
    messages: {
      passive: 'High Frequency Events like "{{name}}" should be `passive: true`',
    },
  },

  create(context) {
    return {
      ['CallExpression[callee.property.name="addEventListener"]']: function (node) {
        const [name, listener, options] = node.arguments
        if (!listener) return
        if (name.type !== 'Literal') return
        if (!passiveEventListenerNames.has(name.value)) return
        if (options && options.type === 'ObjectExpression' && options.properties.some(propIsPassiveTrue)) return
        context.report({node, messageId: 'passive', data: {name: name.value}})
      },
    }
  },
}
