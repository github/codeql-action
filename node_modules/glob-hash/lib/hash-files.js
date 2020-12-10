'use strict'

var async = require('async');
var crypto = require('crypto');
var fs = require('fs');
var q = require('q');
var path = require('path');

/**
 * Hashes the contents of an array of file paths.
 *
 * @param {Array} files An array of file paths.
 * @param {String} algorithm The desired algorithm.
 * @return {Promise} A promise to hash the input.
 */
module.exports = function(files, options) {
    var deferred = q.defer();
    var hash = crypto.createHash(options.algorithm);
    var funcs = files.map(function(file) {
        return function(callback) {
            fs.readFile(file, function(error, data) {
                if (error) {
                    callback(error);
                } else {
                    if (options.filenames) {
                        if (options.jail) {
                            options.jail = path.resolve(options.jail);
                            file = file.substr(options.jail.length + 1);
                        }
                        hash.update(file);
                    }
                    hash.update(data);
                    callback();
                }
            });
        }
    });
    async.series(funcs, function(error) {
        if (error) {
            deferred.reject(error);
        } else {
            deferred.resolve(hash.digest("hex"));
        }
    });
    return deferred.promise;
};