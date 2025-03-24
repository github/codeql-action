import jsxAstUtils from 'jsx-ast-utils'
import {getElementType} from '../utils/get-element-type.js'
import url from '../url.js'

const {getProp, getPropValue} = jsxAstUtils
const SEMANTIC_ELEMENTS = [
  'a',
  'button',
  'summary',
  'select',
  'option',
  'textarea',
  'input',
  'span',
  'div',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'details',
  'summary',
  'dialog',
  'tr',
  'th',
  'td',
  'label',
]

const ifSemanticElement = (context, node) => {
  const elementType = getElementType(context, node.openingElement, true)

  for (const semanticElement of SEMANTIC_ELEMENTS) {
    if (elementType === semanticElement) {
      return true
    }
  }
  return false
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow using the title attribute',
      url: url(import.meta.url),
      recommended: false,
    },
    schema: [],
    messages: {
      titleAttribute: 'The title attribute is not accessible and should never be used unless for an `<iframe>`.',
    },
  },

  create(context) {
    return {
      JSXElement: node => {
        const elementType = getElementType(context, node.openingElement, true)
        if (elementType !== `iframe` && ifSemanticElement(context, node)) {
          const titleProp = getPropValue(getProp(node.openingElement.attributes, `title`))
          if (titleProp) {
            context.report({
              node,
              messageId: 'titleAttribute',
            })
          }
        }
      },
    }
  },
}
