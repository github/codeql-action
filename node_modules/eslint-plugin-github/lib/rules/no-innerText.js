import url from '../url.js'

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow `Element.prototype.innerText` in favor of `Element.prototype.textContent`',
      url: url(import.meta.url),
      recommended: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferTextContent: 'Prefer textContent to innerText',
    },
  },

  create(context) {
    return {
      MemberExpression(node) {
        // If the member expression is part of a call expression like `.innerText()` then it is not the same
        // as the `Element.innerText` property, and should not trigger a warning
        if (node.parent.type === 'CallExpression') return

        if (node.property && node.property.name === 'innerText') {
          context.report({
            meta: {
              fixable: 'code',
            },
            node: node.property,
            messageId: 'preferTextContent',
            fix(fixer) {
              return fixer.replaceText(node.property, 'textContent')
            },
          })
        }
      },
    }
  },
}
