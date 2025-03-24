import url from '../url.js'

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow creating dynamic script tags',
      url: url(import.meta.url),
      recommended: true,
    },
    schema: [],
    messages: {
      noDynamicScriptTag: "Don't create dynamic script tags, add them in the server template instead.",
    },
  },

  create(context) {
    return {
      'CallExpression[callee.property.name="createElement"][arguments.length > 0]': function (node) {
        if (node.arguments[0].value !== 'script') return

        context.report({
          node: node.arguments[0],
          messageId: 'noDynamicScriptTag',
        })
      },
      'AssignmentExpression[left.property.name="type"][right.value="text/javascript"]': function (node) {
        context.report({
          node: node.right,
          messageId: 'noDynamicScriptTag',
        })
      },
    }
  },
}
