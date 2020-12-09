'use strict'

var normalise = require('./normalise');

/**
 * A utility to deny access to files outside
 * a given base path. Works by checking if all
 * the filenames start with the base path.
 *
 * @param {Array} files A list of absolute paths.
 * @param {String} jail The jail path.
 * @return {String} An error message, undefined otherwise.
 */
module.exports = function(files, jail) {
    if (jail) {
        if (typeof jail !== 'string') {
            return 'Invalid jail path.';
        }
        // files array is already normalised
        // jail path also needs to be absolute
        jail = normalise(jail);
        for (var i = 0; i < files.length; i++) {
            if (files[i].substr(0, jail.length) !== jail) {
                return 'Attemp to read outside the permitted path.';
            }
        }
    }
};