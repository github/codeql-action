'use strict'

require('should')
var Dot = require('../index')

describe('str:', function () {
  it('can set root property', function () {
    Dot.str('b', 2, {
      a: 1
    }).should.deepEqual({
      a: 1,
      b: 2
    })
  })

  it('can set nested property', function () {
    Dot.str('b.a', 2, {
      a: 1
    }).should.deepEqual({
      a: 1,
      b: {
        a: 2
      }
    })
  })

  it('can set nested with array notation', function () {
    var obj = {
      a: 1
    }
    Dot.str('object.fields[0].subfield', 'value', obj)
    Dot.str('object.fields[1].subfield', 'value1', obj)

    obj.should.deepEqual({
      a: 1,
      object: {
        fields: [
          {
            subfield: 'value'
          },
          {
            subfield: 'value1'
          }
        ]
      }
    })
  })

  it('can set root level property regardless whether override is set', function () {
    Dot.str('a', 'b', {
      a: 1
    }).should.deepEqual({
      a: 'b'
    })
  })

  it('cannot set __proto__ property', function () {
    (() => Dot.str('__proto__.toString', 'hi', {})).should.throw(
      /Refusing to update/
    );
    ({}.toString().should.deepEqual('[object Object]'))
  })
})
