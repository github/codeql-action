module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow implicit global variables',
      url: require('../url')(module),
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()
    return {
      Program(node) {
        const scope = sourceCode.getScope(node) ? sourceCode.getScope(node) : context.getScope()

        for (const variable of scope.variables) {
          if (variable.writeable) {
            return
          }

          for (const def of variable.defs) {
            if (
              def.type === 'FunctionName' ||
              def.type === 'ClassName' ||
              (def.type === 'Variable' && def.parent.kind === 'const') ||
              (def.type === 'Variable' && def.parent.kind === 'let')
            ) {
              context.report({node: def.node, message: 'Implicit global variable, assign as global property instead.'})
            }
          }
        }
      },
    }
  },
}
