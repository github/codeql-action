import url from '../url.js'

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow usage of `Element.prototype.blur()`',
      url: url(import.meta.url),
      recommended: false,
    },
    schema: [],
    messages: {
      noBlur: 'Do not use element.blur(), instead restore the focus of a previous element.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.property && node.callee.property.name === 'blur') {
          context.report({node, messageId: 'noBlur'})
        }
      },
    }
  },
}
