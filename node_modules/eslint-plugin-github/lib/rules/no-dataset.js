import url from '../url.js'

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'enforce usage of `Element.prototype.getAttribute` instead of `Element.prototype.datalist`',
      url: url(import.meta.url),
      recommended: false,
    },
    schema: [],
    messages: {
      useGetAttribute: "Use getAttribute('data-your-attribute') instead of dataset",
    },
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (node.property && node.property.name === 'dataset') {
          context.report({node, messageId: 'useGetAttribute'})
        }
      },
    }
  },
}
