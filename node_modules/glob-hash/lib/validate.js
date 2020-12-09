'use strict'

var crypto = require('crypto');

/**
 * Validates the options.
 *
 * @param {Object} options An array of globs.
 * @return {mixed} The error message, if validation fails.
 *                 undefined, if validation succeeds.
 */
module.exports = function(options) {
    if (!options) {
        return 'No options provided.';
    }
    options.exclude = options.exclude || [];
    options.algorithm = options.algorithm || 'sha256';
    var algorithms = crypto.getHashes();
    if (algorithms.indexOf(options.algorithm) < 0) {
        return 'Invalid algorithm. Available: ' + algorithms.join(', ');
    } else if (!Array.isArray(options.include)) {
        return 'List of files to include is not an array.';
    } else if (!Array.isArray(options.exclude)) {
        return 'List of files to excludes is not an array.';
    } else if (options.include.length === 0) {
        return 'No files to include provided.';
    }
};