module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow `Element.prototype.innerText` in favor of `Element.prototype.textContent`',
      url: require('../url')(module)
    },
    fixable: 'code',
    schema: []
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (node.property && node.property.name === 'innerText') {
          context.report({
            meta: {
              fixable: 'code'
            },
            node: node.property,
            message: 'Prefer textContent to innerText',
            fix(fixer) {
              return fixer.replaceText(node.property, 'textContent')
            }
          })
        }
      }
    }
  }
}
