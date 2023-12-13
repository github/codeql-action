'use strict'

/* jshint -W030 */

require('should')
var Dot = require('../index')

describe('Pick:', function () {
  it('Should be able to pick a value', function () {
    var obj = {
      some: 'value',
      already: 'set'
    }

    var val = Dot.pick('some', obj)

    val.should.eql('value')
  })

  it('Should be able to pick dotted value', function () {
    var obj = {
      some: {
        other: 'value'
      }
    }

    var val = Dot.pick('some.other', obj)

    val.should.eql('value')
  })

  it('Should be able to pick null properties', function () {
    var obj = {
      some: null
    }

    var val = Dot.pick('some', obj)

    ;(val === null).should.equal(true)
  })

  it('Should return undefined when picking an non-existing value', function () {
    var obj = {
      some: null
    }

    var val = Dot.pick('other', obj)

    ;(val === undefined).should.equal(true)
  })

  it('Should return undefined when picking an non-existing dotted value',
    function () {
      var obj = {
        some: null
      }

      var val = Dot.pick('some.other', obj)

      ;(val === undefined).should.equal(true)
    }
  )

  it("Should check down the object's prototype chain", function () {
    var obj = {
      some: {
        other: 'value'
      }
    }

    var objIns = Object.create(obj)

    objIns.should.have.property('some')

    var val = Dot.pick('some.other', objIns)
    val.should.be.instanceOf(String)
  })

  it('Should be able to delete picked value', function () {
    var obj = {
      some: {
        other: 'value',
        foo: 'bar'
      }
    }

    var val = Dot.pick('some.foo', obj, true)

    val.should.eql('bar')
    obj.should.eql({
      some: {
        other: 'value'
      }
    })
  })

  it('Should be able to delete picked array value', function () {
    var obj = {
      some: {
        other: 'value',
        arrayItems: ['foo', 'bar', 'baz']
      }
    }

    var val = Dot.pick('some.arrayItems[1]', obj, true)

    val.should.eql('bar')
    obj.should.eql({
      some: {
        other: 'value',
        arrayItems: ['foo', , 'baz'] /* eslint-disable-line no-sparse-arrays */
      }
    })
  })

  it('Should be able to delete picked array value and reindex', function () {
    var obj = {
      some: {
        other: 'value',
        arrayItems: ['foo', 'bar', 'baz']
      }
    }

    var val = Dot.pick('some.arrayItems[1]', obj, true, true)

    val.should.eql('bar')
    obj.should.eql({
      some: {
        other: 'value',
        arrayItems: ['foo', 'baz']
      }
    })
  })
})
