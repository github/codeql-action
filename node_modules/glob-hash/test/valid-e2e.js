'use strict'

var normalise = require('../lib/normalise');
var tap = require('tap');
var globHash = require('../');

var tests = [{
    name: 'Should hash text files',
    result: '88ecde925da3c6f8ec3d140683da9d2a422f26c1ae1d9212da1e5a53416dcc88',
    options: {
        include: ['test/**/*.tst']
    }
}, {
    name: 'Should ignore duplicates',
    result: '88ecde925da3c6f8ec3d140683da9d2a422f26c1ae1d9212da1e5a53416dcc88',
    options: {
        include: ['test/**/*.tst', 'test/**/foo.tst', 'test/**/bar.tst']
    }
}, {
    name: 'Should find text files',
    result: [
        normalise('test/samples/bar.tst'),
        normalise('test/samples/foo.tst')
    ],
    options: {
        include: ['test/**/*.tst'],
        files: true
    }
}, {
    name: 'Should exclude bar.tst from hash',
    result: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    options: {
        include: ['test/**/*.tst'],
        exclude: ['test/**/bar.tst']
    }
}, {
    name: 'Should exclude bar.tst from list of files',
    result: [
        normalise('test/samples/foo.tst')
    ],
    options: {
        include: ['test/**/*.tst'],
        exclude: ['test/**/bar.tst'],
        files: true
    }
}, {
    name: 'Should use MD5 for hashing',
    result: '96948aad3fcae80c08a35c9b5958cd89',
    options: {
        include: ['test/**/*.tst'],
        algorithm: 'md5'
    }
}, {
    name: 'Should work with a jail path',
    result: '96948aad3fcae80c08a35c9b5958cd89',
    options: {
        include: ['test/**/*.tst'],
        algorithm: 'md5',
        jail: '.'
    }
}, {
    name: 'Should find text files with relative path to jail',
    result: [
        'samples/bar.tst',
        'samples/foo.tst'
    ],
    options: {
        include: ['test/**/*.tst'],
        algorithm: 'md5',
        files: true,
        jail: './test'
    }
}, {
    name: 'Should hash text files including filenames with jail path',
    result: '2aaea5813468828d7bb64d9c9a83f4ec4fae6cabccba6c733201fd2fa6e85b25',
    options: {
        include: ['test/**/*.tst'],
        filenames: true,
        jail: '.'
    }
}, {
    name: 'Should exclude paths that are not files',
    result: [
        'samples/bar.tst',
        'samples/foo.tst',
        'samples/subfolder/empty.txt'
    ],
    options: {
        include: ['test/samples/**/*'],
        files: true,
        jail: './test'
    }
}];

for (var i = 0; i < tests.length; i++) {
    (function(test) {
        tap.test(test.name, function(childTest) {
          globHash(test.options)
          .then(function(result) {
            childTest.deepEqual(result, test.result);
            childTest.end();
          }, function(error) {
            childTest.fail(error);
            childTest.end();
          });
        });
    }(tests[i]));
}