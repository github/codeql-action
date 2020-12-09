'use strict';

var path = require('path');

/**
 * A utility normalise a path.
 *
 * The path is first converted to an absolute one,
 * then any Windows-style path separators
 * are converted to Unix-style ones.
 *
 * @param {String} p A path to normalise.
 * @return {String} The normalised path.
 */
module.exports = function(p) {
    return path.resolve(p).replace(/\\/g,'/');
};
