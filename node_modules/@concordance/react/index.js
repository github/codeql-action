'use strict'

const pkg = require('./package.json')
const elementFactory = require('./lib/elementFactory')
const testJsonFactory = require('./lib/testJsonFactory')

// Must be unique across all registered plugins.
exports.name = pkg.name

// Expected API version to be passed to register().
exports.apiVersion = 1

// Expected minimal version of Concordance. Concordance will increment its API
// version for breaking changes, this is useful if you rely on features or
// patches that were introduced in a specific version of Concordance.
exports.minimalConcordanceVersion = '1.0.0'

// Plugin-specific version of its serialization output.
exports.serializerVersion = 2

exports.theme = {
  react: {
    functionType: '\u235F',
    openTag: {
      start: '<',
      end: '>',
      selfClose: '/',
      selfCloseVoid: ' /'
    },
    closeTag: {
      open: '</',
      close: '>'
    },
    tagName: {open: '', close: ''},
    attribute: {
      separator: '=',
      value: {
        openBracket: '{',
        closeBracket: '}',
        string: {
          line: {open: '"', close: '"', escapeQuote: '"'}
        }
      }
    },
    child: {
      openBracket: '{',
      closeBracket: '}',
      string: {
        line: {open: '', close: '', escapeQuote: ''},
        multiline: {start: '', end: '', escapeQuote: ''}
      }
    }
  }
}

const ELEMENT = Symbol.for('react.element')
const TEST_JSON = Symbol.for('react.test.json')

function register (api) {
  const reactTags = new Set()
  const element = elementFactory(api, reactTags)
  const testJson = testJsonFactory(api, element)

  api.addDescriptor(0x01, element.tag, element.deserialize)
  api.addDescriptor(0x02, testJson.tag, testJson.deserialize)

  reactTags.add(element.tag).add(testJson.tag)

  return value => {
    if (value.$$typeof === ELEMENT) return element.describe
    if (value.$$typeof === TEST_JSON) return testJson.describe
    return null
  }
}
exports.register = register
