'use strict'

require('should')
var Dot = require('../index')
var pkg = require('./fixtures/package.json')

describe('dot():', function () {
  var obj

  // Dot.useBrackets = false;

  beforeEach(function () {
    obj = {
      id: 'my-id',
      nes: {
        ted: {
          value: true
        }
      },
      other: {
        nested: {
          stuff: 5
        }
      },
      nested: {
        array: [
          {
            with: 'object1'
          },
          {
            and: 'object2'
          }
        ]
      },
      some: {
        array: ['A', 'B']
      },
      ehrm: 123,
      dates: {
        first: new Date('Mon Oct 13 2014 00:00:00 GMT+0100 (BST)')
      },
      arrays: [
        [
          [
            {
              all: [
                [
                  {
                    the: [
                      'way',
                      ['down']
                    ]
                  }
                ]
              ]
            }
          ]
        ]
      ]
    }
  })

  it('Should be able to convert to dotted-key/value pairs', function () {
    var expected = {
      id: 'my-id',
      'nes.ted.value': true,
      'other.nested.stuff': 5,
      'nested.array[0].with': 'object1',
      'nested.array[1].and': 'object2',
      'some.array[0]': 'A',
      'some.array[1]': 'B',
      ehrm: 123,
      'dates.first': new Date('Mon Oct 13 2014 00:00:00 GMT+0100 (BST)'),
      'arrays[0][0][0].all[0][0].the[0]': 'way',
      'arrays[0][0][0].all[0][0].the[1][0]': 'down'
    }

    Dot.dot(obj).should.eql(expected)
  })

  it('dot() should equal object()', function () {
    Dot.object(Dot.dot(pkg)).should.eql(pkg)
  })

  it('keepArray prevents arrays from being dotted', function () {
    var expected = {
      id: 'my-id',
      'nes.ted.value': true,
      'other.nested.stuff': 5,
      'nested.array': [{
        with: 'object1'
      }, {
        and: 'object2'
      }],
      'some.array': ['A', 'B'],
      ehrm: 123,
      'dates.first': new Date('Mon Oct 13 2014 00:00:00 GMT+0100 (BST)'),
      arrays: JSON.parse(JSON.stringify(obj.arrays))
    }

    Dot.keepArray = true

    Dot.dot(obj).should.eql(expected)

    Dot.keepArray = false
  })

  it('useBrackets wrap indexes with brackets', function () {
    var expected = {
      id: 'my-id',
      'nes.ted.value': true,
      'other.nested.stuff': 5,
      'nested.array[0].with': 'object1',
      'nested.array[1].and': 'object2',
      'some.array[0]': 'A',
      'some.array[1]': 'B',
      ehrm: 123,
      'dates.first': new Date('Mon Oct 13 2014 00:00:00 GMT+0100 (BST)'),
      'arrays[0][0][0].all[0][0].the[0]': 'way',
      'arrays[0][0][0].all[0][0].the[1][0]': 'down'
    }

    Dot.dot(obj).should.eql(expected)
  })

  it('useBrackets wrap indexes without brackets', function () {
    var expected = {
      id: 'my-id',
      'nes.ted.value': true,
      'other.nested.stuff': 5,
      'nested.array.0.with': 'object1',
      'nested.array.1.and': 'object2',
      'some.array.0': 'A',
      'some.array.1': 'B',
      ehrm: 123,
      'dates.first': new Date('Mon Oct 13 2014 00:00:00 GMT+0100 (BST)'),
      'arrays.0.0.0.all.0.0.the.0': 'way',
      'arrays.0.0.0.all.0.0.the.1.0': 'down'
    }

    Dot.useBrackets = false
    Dot.dot(obj).should.eql(expected)
    Dot.useBrackets = true
  })

  it('Always keeps empty arrays', function () {
    Dot.dot({ hello: [] }).should.eql({ hello: [] })
    Dot.dot({ hello: { world: [] } }).should.eql({ 'hello.world': [] })
  })

  it('Always keeps empty objects', function () {
    Dot.dot({ hello: {} }).should.eql({ hello: {} })
    Dot.dot({ hello: { world: {} } }).should.eql({ 'hello.world': {} })
  })
})
