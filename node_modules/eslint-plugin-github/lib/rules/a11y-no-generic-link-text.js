import jsxAstUtils from 'jsx-ast-utils'
import {getElementType} from '../utils/get-element-type.js'
import url from '../url.js'

const {getProp, getPropValue} = jsxAstUtils
const bannedLinkText = ['read more', 'here', 'click here', 'learn more', 'more']

/* Downcase and strip extra whitespaces and punctuation */
const stripAndDowncaseText = text => {
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow generic link text',
      url: url(import.meta.url),
      recommended: false,
    },
    deprecated: true,
    replacedBy: ['jsx-a11y/anchor-ambiguous-text'],
    schema: [],
    messages: {
      avoidGenericLinkText:
        'Avoid setting generic link text like `Here`, `Click here`, `Read more`. Make sure that your link text is both descriptive and concise.',
      ariaLabelDescriptive: 'When using ARIA to set a more descriptive text, it must fully contain the visible label.',
    },
  },

  create(context) {
    return {
      JSXOpeningElement: node => {
        const elementType = getElementType(context, node)

        if (elementType !== 'a') return
        if (getProp(node.attributes, 'aria-labelledby')) return

        let cleanTextContent // text content we can reliably fetch

        const parent = node.parent
        let jsxTextNode
        if (parent.children && parent.children.length > 0 && parent.children[0].type === 'JSXText') {
          jsxTextNode = parent.children[0]
          cleanTextContent = stripAndDowncaseText(parent.children[0].value)
        }

        const ariaLabel = getPropValue(getProp(node.attributes, 'aria-label'))
        const cleanAriaLabelValue = ariaLabel && stripAndDowncaseText(ariaLabel)

        if (ariaLabel) {
          if (bannedLinkText.includes(cleanAriaLabelValue)) {
            context.report({
              node,
              messageId: 'avoidGenericLinkText',
            })
          }
          if (cleanTextContent && !cleanAriaLabelValue.includes(cleanTextContent)) {
            context.report({
              node,
              messageId: 'ariaLabelDescriptive',
            })
          }
        } else {
          if (cleanTextContent) {
            if (!bannedLinkText.includes(cleanTextContent)) return
            context.report({
              node: jsxTextNode,
              messageId: 'avoidGenericLinkText',
            })
          }
        }
      },
    }
  },
}
