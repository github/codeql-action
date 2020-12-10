'use strict'

/**
 * Used by commander for collecting multiple arguments
 * of the same type from the command line.
 *
 * @param {String} value The string to add to the array.
 * @param {Array} memo The array to add to.
 * @return {Array} The resulting array.
 */
module.exports = function(value, memo) {
    return memo.concat(value);
};