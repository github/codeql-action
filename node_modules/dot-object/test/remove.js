'use strict'

require('should')
var Dot = require('../index')

describe('Remove/del:', function () {
  var obj
  var expected

  beforeEach(function () {
    obj = {
      id: 'my-id',
      nes: {
        ted: {
          gone: 'value',
          still: 'there'
        }
      },
      ehrm: 123
    }

    expected = {
      id: 'my-id',
      nes: {
        ted: {
          still: 'there'
        }
      }
    }
  })

  it('Should be able to remove() properties', function () {
    Dot.remove('ehrm', obj).should.equal(123)
    Dot.remove('nes.ted.gone', obj).should.equal('value')
    obj.should.eql(expected)
  })

  it('Should be able to use del() alias', function () {
    Dot.del('ehrm', obj).should.equal(123)
    Dot.del('nes.ted.gone', obj).should.equal('value')
    obj.should.eql(expected)
  })

  it('Should be able to remove() array item and reindex array', function () {
    var obj = {
      some: {
        other: 'value',
        arrayItems: ['foo', 'bar', 'baz']
      }
    }

    var val = Dot.remove('some.arrayItems[1]', obj, true, true)

    val.should.eql('bar')
    obj.should.eql({
      some: {
        other: 'value',
        arrayItems: ['foo', 'baz']
      }
    })
  })

  it('Should be handle being told to reindex an object by ignoring reindex rule', function () {
    var obj = {
      some: {
        other: 'value',
        arrayItems: ['foo', 'bar', 'baz']
      }
    }

    var val = Dot.remove('some.other', obj, true, true)

    val.should.eql('value')
    obj.should.eql({
      some: {
        arrayItems: ['foo', 'bar', 'baz']
      }
    })
  })
})
