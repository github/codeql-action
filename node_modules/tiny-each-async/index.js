/* eslint-disable no-use-before-define */
'use strict';

module.exports = function eachAsync(arr, parallelLimit, iteratorFn, cb) {
  var pending = 0;
  var index = 0;
  var lastIndex = arr.length - 1;
  var called = false;
  var limit;
  var callback;
  var iterate;

  if (typeof parallelLimit === 'number') {
    limit = parallelLimit;
    iterate = iteratorFn;
    callback = cb || function noop() {};
  } else {
    iterate = parallelLimit;
    callback = iteratorFn || function noop() {};
    limit = arr.length;
  }

  if (!arr.length) { return callback(); }

  var iteratorLength = iterate.length;

  var shouldCallNextIterator = function shouldCallNextIterator() {
    return (!called && (pending < limit) && (index < lastIndex));
  };

  var iteratorCallback = function iteratorCallback(err) {
    if (called) { return; }

    pending--;

    if (err || (index === lastIndex && !pending)) {
      called = true;

      callback(err);
    } else if (shouldCallNextIterator()) {
      processIterator(++index);
    }
  };

  var processIterator = function processIterator() {
    pending++;

    var args = (iteratorLength === 2) ? [arr[index], iteratorCallback]
                                      : [arr[index], index, iteratorCallback];

    iterate.apply(null, args);

    if (shouldCallNextIterator()) {
      processIterator(++index);
    }
  };

  processIterator();
};
