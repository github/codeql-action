import url from '../url.js'

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow usage of CSRF tokens in JavaScript',
      url: url(import.meta.url),
      recommended: false,
    },
    schema: [],
    messages: {
      authenticityTokenUsage:
        'Form CSRF tokens (authenticity tokens) should not be created in JavaScript and their values should not be used directly for XHR requests.',
    },
  },

  create(context) {
    function checkAuthenticityTokenUsage(node, str) {
      if (str.includes('authenticity_token')) {
        context.report({
          node,
          messageId: 'authenticityTokenUsage',
        })
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          checkAuthenticityTokenUsage(node, node.value)
        }
      },
    }
  },
}
