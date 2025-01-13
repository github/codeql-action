module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow `event.currentTarget` calls inside of async functions',
      url: require('../url')(module),
    },
    schema: [],
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
                message: 'event.currentTarget inside an async function is error prone',
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
