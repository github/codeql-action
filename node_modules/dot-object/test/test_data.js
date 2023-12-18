'use strict'

require('should')
var Dot = require('../index')

var testData = require('./data')

function singleTest (dot, input, expected) {
  dot.object(input)
  JSON.stringify(input).should.eql(JSON.stringify(expected))
}

describe('Test Data:', function () {
  var dot = new Dot()
  function testIt (test) {
    it(test.name, function () {
      if (test.options) {
        Object.keys(test.options).forEach(function (name) {
          dot[name] = test.options[name]
        })
      }

      if (Array.isArray(test.input)) {
        if (
          !Array.isArray(test.expected) ||
           test.input.length !== test.expected.length
        ) {
          throw Error('Input and Expected tests length must be the same')
        }
        test.expected.forEach((expected, i) => {
          singleTest(dot, test.input[i], expected)
        })
      } else {
        singleTest(dot, test.input, test.expected)
      }
    })
  }

  // note with object() it is possible to cleanup, with del it is not.

  testData.forEach(testIt)
})
