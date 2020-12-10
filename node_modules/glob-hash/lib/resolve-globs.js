'use strict'

var async = require('async');
var filterPaths = require('./filter-paths');
var glob = require('glob');
var normalise = require('./normalise');
var q = require('q');

/**
 * Resolves an array of globs to
 * a sorted array of file paths.
 *
 * @param {Array} globs An array of globs.
 * @return {Promise} A promise to resolve the globs.
 */
module.exports = function(globs) {
    var deferred = q.defer();
    var funcs = globs.map(function(g) {
        return function(callback) {
            glob(g, function(error, paths) {
                if (error) {
                    callback(error);
                } else {
                    filterPaths(
                        paths.map(normalise),
                        callback
                    );
                }
            });
        }
    });
    async.parallel(funcs, function(error, files) {
        if (error) {
            deferred.reject(error);
        } else {
            deferred.resolve(
                Array.prototype.concat.apply([], files)
            );
        }
    });
    return deferred.promise;
};