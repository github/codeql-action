'use strict'

var hashFiles = require('./hash-files');
var jail = require('./jail');
var normalise = require('./normalise');
var q = require('q');
var resolveGlobs = require('./resolve-globs');
var validate = require('./validate');

/**
 * Entry point into the module.
 * Parses and validates the options,
 * then performs the desired operation.
 *
 * @param {Object} options The desired options.
 * @return {Promise} A promise to perform the desired operation.
 */
module.exports = function computeHash(options){
    var deferred = q.defer();
    var error = validate(options);
    if (error) {
        deferred.reject(error);
    } else {
        resolveGlobs(options.include)
        .then(function(includes) {
            options.include = includes;
            return resolveGlobs(options.exclude);
        })
        .then(function(excludes) {
            var files = options.include
            // Remove excluded files
            .filter(function(item) {
                return excludes.indexOf(item) === -1;
            })
            // Remove duplicate entries
            .reduce(function(memo, next){
                if (memo.indexOf(next) < 0) {
                    memo.push(next);
                }
                return memo;
            }, []);
            var error = jail(files, options.jail);
            if (error) {
                deferred.reject(error);
            } else if (files.length === 0) {
                deferred.reject(
                    'No files were matched using the provided globs.'
                );
            } else {
                files.sort();
                if (options.files) {
                    if (options.jail) {
                        options.jail = normalise(options.jail);
                        files = files.map(function(file) {
                            return file.substr(options.jail.length + 1);
                        });
                    }
                    deferred.resolve(files);
                } else {
                    deferred.resolve(
                        hashFiles(files, options)
                    );
                }
            }
        })
        .fail(function(error) {
            deferred.reject(error);
        });
    }
    return deferred.promise;
};