'use strict'

var path = require('path');
var tap = require('tap');
var globHash = require('../');

var tests = [{
    name: 'Null options',
    error: 'No options provided.',
    options: null
}, {
    name: 'Empty options',
    error: 'List of files to include is not an array.',
    options: {}
}, {
    name: 'Empty include array',
    error: 'No files to include provided.',
    options: {
        include: []
    }
}, {
    name: 'Invalid exclude',
    error: 'List of files to excludes is not an array.',
    options: {
        include: ['test/samples/*'],
        exclude: 'foobar'
    }
}, {
    name: 'No files matched',
    error: 'No files were matched using the provided globs.',
    options: {
        include: ['foobar'],
        exclude: ['foobar']
    }
}, {
    name: 'Read outside jail',
    error: 'Attemp to read outside the permitted path.',
    options: {
        include: ['test/*'],
        jail: 'test/samples'
    }
}, {
    name: 'Invalid jail path.',
    error: 'Invalid jail path.',
    options: {
        include: ['test/*'],
        jail: true
    }
}];

for (var i = 0; i < tests.length; i++) {
    (function(test) {
        tap.test(test.name, function(childTest) {
          globHash(test.options)
          .then(function(result) {
            childTest.fail(result);
            childTest.end();
          }, function(error) {
            if (typeof error === 'string') {
                childTest.equal(test.error, error);
            } else {
                childTest.match(test.error, error);
            }
            childTest.end();
          });
        });
    }(tests[i]));
}