const {elementType, getProp, getPropValue} = require('jsx-ast-utils')

/*
Allows custom component to be mapped to an element type.
When a default is set, all instances of the component will be mapped to the default.
If a prop determines the type, it can be specified with `props`.

For now, we only support the mapping of one prop type to an element type, rather than combinations of props.
*/
function getElementType(context, node) {
  const {settings} = context
  const rawElement = elementType(node)
  if (!settings) return rawElement

  const componentMap = settings.github && settings.github.components
  if (!componentMap) return rawElement
  const component = componentMap[rawElement]
  if (!component) return rawElement
  let element = component.default ? component.default : rawElement

  if (component.props) {
    const props = Object.entries(component.props)
    for (const [key, value] of props) {
      const propMap = value
      const propValue = getPropValue(getProp(node.attributes, key))
      const mapValue = propMap[propValue]

      if (mapValue) {
        element = mapValue
      }
    }
  }
  return element
}

module.exports = {getElementType}
