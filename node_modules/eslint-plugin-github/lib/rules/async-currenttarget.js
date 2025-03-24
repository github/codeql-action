import url from '../url.js'

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow `event.currentTarget` calls inside of async functions',
      url: url(import.meta.url),
      recommended: false,
    },
    schema: [],
    messages: {
      asyncCurrentTarget: 'event.currentTarget inside an async function is error prone',
    },
  },

  create(context) {
    const scopeDidWait = new WeakSet()
    const sourceCode = context.sourceCode ?? context.getSourceCode()

    return {
      AwaitExpression(node) {
        scopeDidWait.add(sourceCode.getScope ? sourceCode.getScope(node) : context.getScope())
      },
      MemberExpression(node) {
        if (node.property && node.property.name === 'currentTarget') {
          let scope = sourceCode.getScope ? sourceCode.getScope(node) : context.getScope()
          while (scope) {
            if (scopeDidWait.has(scope)) {
              context.report({
                node,
                messageId: 'asyncCurrentTarget',
              })
              break
            }
            scope = scope.upper
          }
        }
      },
    }
  },
}
