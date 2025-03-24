import url from '../url.js'

const observerMap = {
  scroll: 'IntersectionObserver',
  resize: 'ResizeObserver',
}
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow poorly performing event listeners',
      url: url(import.meta.url),
      recommended: false,
    },
    schema: [],
    messages: {
      avoid: 'Avoid using "{{name}}" event listener. Consider using {{observer}} instead',
    },
  },

  create(context) {
    return {
      ['CallExpression[callee.property.name="addEventListener"]']: function (node) {
        const [name] = node.arguments
        if (name.type !== 'Literal') return
        if (!(name.value in observerMap)) return
        context.report({
          node,
          messageId: 'avoid',
          data: {name: name.value, observer: observerMap[name.value]},
        })
      },
    }
  },
}
