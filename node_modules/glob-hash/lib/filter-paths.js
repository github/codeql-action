'use strict'

var async = require('async');
var fs = require('fs');

/**
 * Filters out non-files from a list of paths.
 *
 * @param {Array} paths An array of paths.
 * @param {Function} callback Called with the filtered list of files.
 */
module.exports = function(paths, callback) {
    async.filter(paths, function(path, cb) {
        fs.lstat(path, function(error, stats) {
            if (error) {
                cb(error);
            } else {
                cb(null, stats.isFile());
            }
        });
    }, function (err, files) {
        callback(err, files);
    });
};