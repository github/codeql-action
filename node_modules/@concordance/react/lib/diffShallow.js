'use strict'

function diffShallow (api, actual, expected, theme, indent) {
  const childBuffer = api.lineBuilder.buffer()
  const propertyBuffer = api.lineBuilder.buffer()

  return {
    append (formatted, origin) {
      if (origin.isItem === true) {
        childBuffer.append(formatted)
      } else {
        propertyBuffer.append(formatted)
      }
    },

    finalize: () => {
      const namesAreEqual = actual.compareNames(expected)
      const actualName = actual.formatName(theme)
      const expectedName = expected.formatName(theme)

      const openTag = theme.react.openTag
      const innerIndentation = indent.increase()

      const allChildren = childBuffer.withFirstPrefixed(innerIndentation)
      const children = allChildren.decompose()

      const allProperties = propertyBuffer.withFirstPrefixed(innerIndentation)
      const properties = allProperties.decompose()
      // If the first properties are also the last, and either side has no
      // children, ensure the properties are treated as being last. This
      // leads to a better balanced diff.
      if (properties.remaining.isEmpty && (!actual.hasChildren || !expected.hasChildren)) {
        properties.last = properties.first
        properties.first = {actual: api.lineBuilder.buffer(), expected: api.lineBuilder.buffer()}
      }

      const result = api.lineBuilder.buffer()

      // Create a custom diff that is as neat as possible. It's likely
      // there's a generic algorithm that can be used, but for expediency's
      // sake handles all possible diffs by brute force instead.
      if (actual.hasProperties && expected.hasProperties) {
        if (namesAreEqual) {
          result
            .append(api.lineBuilder.first(openTag.start + actualName))
            .append(properties.first.actual.stripFlags())
            .append(properties.first.expected.stripFlags())
        } else {
          result
            .append(api.lineBuilder.actual.first(openTag.start + actualName))
            .append(properties.first.actual.stripFlags())
            .append(api.lineBuilder.expected.first(openTag.start + expectedName))
            .append(properties.first.expected.stripFlags())
        }
        result.append(properties.remaining.stripFlags())

        if (actual.hasChildren && expected.hasChildren) {
          result
            .append(properties.last.actual.stripFlags())
            .append(properties.last.expected.stripFlags())
            .append(api.lineBuilder.line(indent + openTag.end))

          if (namesAreEqual) {
            result
              .append(allChildren.stripFlags())
              .append(api.lineBuilder.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
          } else {
            result
              .append(children.first.actual.stripFlags())
              .append(children.first.expected.stripFlags())
              .append(children.remaining.stripFlags())
              .append(children.last.actual.stripFlags())
              .append(api.lineBuilder.actual.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
              .append(children.last.expected.stripFlags())
              .append(api.lineBuilder.expected.last(indent + api.wrapFromTheme(theme.react.closeTag, expectedName)))
          }
        } else if (actual.hasChildren) {
          result
            .append(properties.last.actual.stripFlags())
            .append(api.lineBuilder.actual.line(indent + openTag.end))
            .append(allChildren.stripFlags())
            .append(api.lineBuilder.actual.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
            .append(properties.last.expected.stripFlags())
            .append(api.lineBuilder.expected.last(indent + openTag.selfClose + openTag.end))
        } else if (expected.hasChildren) {
          result
            .append(properties.last.actual.stripFlags())
            .append(api.lineBuilder.actual.last(indent + openTag.selfClose + openTag.end))
            .append(properties.last.expected.stripFlags())
            .append(api.lineBuilder.expected.line(indent + openTag.end))
            .append(allChildren.stripFlags())
            .append(api.lineBuilder.expected.last(indent + api.wrapFromTheme(theme.react.closeTag, expectedName)))
        } else {
          result
            .append(properties.last.actual.stripFlags())
            .append(properties.last.expected.stripFlags())
            .append(api.lineBuilder.last(indent + openTag.selfClose + openTag.end))
        }
      } else if (actual.hasProperties) {
        result
          .append(api.lineBuilder.actual.first(openTag.start + actualName))
          .append(allProperties.stripFlags())

        if (actual.hasChildren && expected.hasChildren) {
          result
            .append(api.lineBuilder.actual.line(indent + openTag.end))
            .append(children.first.actual.stripFlags())
            .append(api.lineBuilder.expected.first(openTag.start + expectedName + openTag.end))
            .append(children.first.expected.stripFlags())
            .append(children.remaining.stripFlags())

          if (namesAreEqual) {
            result
              .append(children.last.actual.stripFlags())
              .append(children.last.expected.stripFlags())
              .append(api.lineBuilder.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
          } else {
            result
              .append(children.last.actual.stripFlags())
              .append(api.lineBuilder.actual.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
              .append(children.last.expected.stripFlags())
              .append(api.lineBuilder.expected.last(indent + api.wrapFromTheme(theme.react.closeTag, expectedName)))
          }
        } else if (actual.hasChildren) {
          result
            .append(api.lineBuilder.actual.last(indent + openTag.selfClose + openTag.end))
            .append(allChildren.stripFlags())
            .append(api.lineBuilder.actual.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
            .append(api.lineBuilder.expected.single(openTag.start + expectedName + openTag.selfCloseVoid + openTag.end))
        } else if (expected.hasChildren) {
          result
            .append(api.lineBuilder.actual.last(indent + openTag.selfClose + openTag.end))
            .append(api.lineBuilder.expected.first(openTag.start + expectedName + openTag.end))
            .append(allChildren.stripFlags())
            .append(api.lineBuilder.expected.last(indent + api.wrapFromTheme(theme.react.closeTag, expectedName)))
        } else {
          result
            .append(api.lineBuilder.actual.last(indent + openTag.selfClose + openTag.end))
            .append(api.lineBuilder.expected.single(openTag.start + expectedName + openTag.selfCloseVoid + openTag.end))
        }
      } else if (expected.hasProperties) {
        if (actual.hasChildren && expected.hasChildren) {
          result
            .append(api.lineBuilder.actual.first(openTag.start + actualName + openTag.end))
            .append(children.first.actual.stripFlags())
            .append(api.lineBuilder.expected.first(openTag.start + expectedName))
            .append(allProperties.stripFlags())
            .append(api.lineBuilder.expected.line(indent + openTag.end))
            .append(children.first.expected.stripFlags())
            .append(children.remaining.stripFlags())

          if (namesAreEqual) {
            result
              .append(children.last.actual.stripFlags())
              .append(children.last.expected.stripFlags())
              .append(api.lineBuilder.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
          } else {
            result
              .append(children.last.actual.stripFlags())
              .append(api.lineBuilder.actual.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
              .append(children.last.expected.stripFlags())
              .append(api.lineBuilder.expected.last(indent + api.wrapFromTheme(theme.react.closeTag, expectedName)))
          }
        } else if (actual.hasChildren) {
          result
            .append(api.lineBuilder.actual.first(openTag.start + actualName + openTag.end))
            .append(allChildren.stripFlags())
            .append(api.lineBuilder.actual.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
            .append(api.lineBuilder.expected.first(openTag.start + expectedName))
            .append(allProperties.stripFlags())
            .append(api.lineBuilder.expected.last(indent + openTag.selfClose + openTag.end))
        } else if (expected.hasChildren) {
          result
            .append(api.lineBuilder.actual.single(openTag.start + actualName + openTag.selfCloseVoid + openTag.end))
            .append(api.lineBuilder.expected.first(openTag.start + expectedName))
            .append(allProperties.stripFlags())
            .append(api.lineBuilder.expected.line(indent + openTag.end))
            .append(allChildren.stripFlags())
            .append(api.lineBuilder.expected.last(indent + api.wrapFromTheme(theme.react.closeTag, expectedName)))
        } else {
          result
            .append(api.lineBuilder.actual.single(openTag.start + actualName + openTag.selfCloseVoid + openTag.end))
            .append(api.lineBuilder.expected.first(openTag.start + expectedName))
            .append(allProperties.stripFlags())
            .append(api.lineBuilder.expected.last(indent + openTag.selfCloseVoid + openTag.end))
        }
      } else {
        if (actual.hasChildren && expected.hasChildren) {
          if (namesAreEqual) {
            result
              .append(api.lineBuilder.first(openTag.start + actualName + openTag.end))
              .append(allChildren.stripFlags())
              .append(api.lineBuilder.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
          } else {
            result
              .append(api.lineBuilder.actual.first(openTag.start + actualName + openTag.end))
              .append(children.first.actual.stripFlags())
              .append(api.lineBuilder.expected.first(openTag.start + expectedName + openTag.end))
              .append(children.first.expected.stripFlags())
              .append(children.remaining.stripFlags())
              .append(children.last.actual.stripFlags())
              .append(api.lineBuilder.actual.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
              .append(children.last.expected.stripFlags())
              .append(api.lineBuilder.expected.last(indent + api.wrapFromTheme(theme.react.closeTag, expectedName)))
          }
        } else if (actual.hasChildren) {
          result
            .append(api.lineBuilder.actual.first(openTag.start + actualName + openTag.end))
            .append(allChildren.stripFlags())
            .append(api.lineBuilder.actual.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
            .append(api.lineBuilder.expected.single(openTag.start + expectedName + openTag.selfCloseVoid + openTag.end))
        } else if (expected.hasChildren) {
          result
            .append(api.lineBuilder.actual.single(openTag.start + actualName + openTag.selfCloseVoid + openTag.end))
            .append(api.lineBuilder.expected.first(openTag.start + expectedName + openTag.end))
            .append(allChildren.stripFlags())
            .append(api.lineBuilder.expected.last(indent + api.wrapFromTheme(theme.react.closeTag, actualName)))
        } else {
          if (namesAreEqual) {
            result.append(api.lineBuilder.single(openTag.start + actualName + openTag.selfCloseVoid + openTag.end))
          } else {
            result
              .append(api.lineBuilder.actual.single(openTag.start + actualName + openTag.selfCloseVoid + openTag.end))
              .append(api.lineBuilder.expected.single(openTag.start + expectedName + openTag.selfCloseVoid + openTag.end))
          }
        }
      }

      return result
    },

    shouldFormat (subject) {
      return subject.isItem === true || subject.isProperty === true
    },

    increaseIndent: true
  }
}
module.exports = diffShallow
