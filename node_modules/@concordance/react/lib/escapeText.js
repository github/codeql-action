'use strict'

function escapeText (text) {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // TODO: Escape characters that Concordance would otherwise replace with \u
    // sequences.
}
module.exports = escapeText
