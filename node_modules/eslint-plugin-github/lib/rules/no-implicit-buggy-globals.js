import url from '../url.js'

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow implicit global variables',
      url: url(import.meta.url),
      recommended: true,
    },
    schema: [],
    messages: {
      implicitGlobalVariable: 'Implicit global variable, assign as global property instead.',
    },
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
              context.report({
                node: def.node,
                messageId: 'implicitGlobalVariable',
              })
            }
          }
        }
      },
    }
  },
}
