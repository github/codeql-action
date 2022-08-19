/* eslint-disable no-console, func-names */
'use strict';

var it = require('tape');
var eachAsync = require('./');
var lolex = require('lolex');

it('should call back even if the array is empty', function(t) {
  eachAsync([], function(item, next) {
    next();
  }, function() {
    t.end();
  });
});

it('should execute the final callback once all individual tasks are finished', function(t) {
  var counter = 0;

  eachAsync([1, 2, 3], function(item, next) {
    counter++;
    next();
  }, function() {
    t.equal(counter, 3);
    t.end();
  });
});

it('should provide index as an argument for the iterator if needed', function(t) {
  var items = [11, 22, 33];

  eachAsync(items, function(item, i, next) {
    t.equal(item, items[i]);

    next();
  }, function() {
    t.end();
  });
});

it('should treat iterator index as an optional param', function(t) {
  eachAsync([1, 2, 3], function(item, next) {
    next();
  }, function() {
    t.end();
  });
});

it('should treat limit as an optional param', function(t) {
  eachAsync([1, 2, 3], function(item, next) {
    next();
  }, function() {
    eachAsync([1, 2, 3], 2, function(item, next) {
      next();
    }, function() {
      t.end();
    });
  });
});

it('should return early in case there\'s an error', function(t) {
  var error = new Error('test');

  eachAsync([1, 2, 3], function(item, next) {
    if (item === 2) { return next(error); }

    t.ok(item === 1);

    next();
  }, function(err) {
    t.equal(err, error);
    t.end();
  });
});

it('should limit the concurrency', function(t) {
  var clock = lolex.install();
  var items = [];

  eachAsync([1, 2, 3, 4, 5], 2, function(item, next) {
    setTimeout(function() {
      items.push(item);
      next();
    }, 1000);
  }, function() {
    clock.uninstall();
    t.end();
  });

  clock.tick(1001);
  t.deepEqual([1, 2], items);
  clock.tick(1001);
  t.deepEqual([1, 2, 3, 4], items);
  clock.tick(1000);
  t.deepEqual([1, 2, 3, 4, 5], items);
});
