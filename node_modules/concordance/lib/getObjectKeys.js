'use strict'

function getObjectKeys (obj, excludeListItemAccessorsBelowLength) {
  const keys = []
  let size = 0

  // Sort property names, they should never be order-sensitive
  const nameCandidates = Object.getOwnPropertyNames(obj).sort()
  // Comparators should verify symbols in an order-insensitive manner if
  // possible.
  const symbolCandidates = Object.getOwnPropertySymbols(obj)

  for (let i = 0; i < nameCandidates.length; i++) {
    const name = nameCandidates[i]

    let accept = true
    if (excludeListItemAccessorsBelowLength > 0) {
      const index = Number(name)
      accept = (index % 1 !== 0) || index >= excludeListItemAccessorsBelowLength
    }

    if (accept && Object.getOwnPropertyDescriptor(obj, name).enumerable) {
      keys[size++] = name
    }
  }

  for (let i = 0; i < symbolCandidates.length; i++) {
    const symbol = symbolCandidates[i]
    if (Object.getOwnPropertyDescriptor(obj, symbol).enumerable) {
      keys[size++] = symbol
    }
  }

  return { keys, size }
}
module.exports = getObjectKeys
