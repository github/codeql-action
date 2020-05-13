'use strict'

const arrify = require('arrify')

function factory (api, element) {
  const tag = Symbol('@concordance/react.TestJsonValue')

  function describe (props) {
    const obj = props.value

    const name = obj.type
    const children = arrify(obj.children)
    const properties = Object.assign({}, obj.props)
    const hasProperties = Object.keys(properties).length > 0

    return new DescribedTestJsonValue(Object.assign({
      children,
      hasProperties,
      hasTypeFn: false,
      name,
      properties,
      typeFn: null,
      isList: children.length > 0
    }, props))
  }

  function deserialize (state, recursor) {
    return new DeserializedTestJsonValue(state, recursor)
  }

  class TestJsonValue extends element.ElementValue {
    compare (expected) {
      // Allow expected value to be a React element.
      return (this.tag === expected.tag || expected.tag === element.tag) && this.name === expected.name
        ? api.SHALLOW_EQUAL
        : api.UNEQUAL
    }

    prepareDiff (expected) {
      return {
        // Allow expected value to be a React element.
        compareResult: this.tag === expected.tag || expected.tag === element.tag
          ? api.SHALLOW_EQUAL
          : api.UNEQUAL
      }
    }
  }
  Object.defineProperty(TestJsonValue.prototype, 'tag', {value: tag})

  const DescribedTestJsonValue = element.DescribedMixin(TestJsonValue)
  const DeserializedTestJsonValue = element.DeserializedMixin(TestJsonValue)

  return {
    describe,
    deserialize,
    tag
  }
}
module.exports = factory
