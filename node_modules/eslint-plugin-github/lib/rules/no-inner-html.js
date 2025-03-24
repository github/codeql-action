import url from '../url.js'

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow `Element.prototype.innerHTML` in favor of `Element.prototype.textContent`',
      url: url(import.meta.url),
      recommended: false,
    },
    schema: [],
    messages: {
      noInnerHTML: 'Using innerHTML poses a potential security risk and should not be used. Prefer using textContent.',
    },
  },

  create(context) {
    return {
      'MemberExpression[property.name=innerHTML]': function (node) {
        context.report({
          node: node.property,
          messageId: 'noInnerHTML',
        })
      },
    }
  },
}
