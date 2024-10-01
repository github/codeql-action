(function(global, exportName) {
    'use strict'

    function _process(v, mod) {
        var i
        var r

        if (typeof mod === 'function') {
            r = mod(v)
            if (r !== undefined) {
                v = r
            }
        } else if (Array.isArray(mod)) {
            for (i = 0; i < mod.length; i++) {
                r = mod[i](v)
                if (r !== undefined) {
                    v = r
                }
            }
        }

        return v
    }

    function parseKey(key, val) {
        // detect negative index notation
        if (key[0] === '-' && Array.isArray(val) && /^-\d+$/.test(key)) {
            return val.length + parseInt(key, 10)
        }
        return key
    }

    function isIndex(k) {
        return /^\d+$/.test(k)
    }

    function isObject(val) {
        return Object.prototype.toString.call(val) === '[object Object]'
    }

    function isArrayOrObject(val) {
        return Object(val) === val
    }

    function isEmptyObject(val) {
        return Object.keys(val).length === 0
    }

    var blacklist = ['__proto__', 'prototype', 'constructor']
    var blacklistFilter = function(part) {
        return blacklist.indexOf(part) === -1
    }

    function parsePath(path, sep) {
        if (path.indexOf('[') >= 0) {
            path = path.replace(/\[/g, sep).replace(/]/g, '')
        }

        var parts = path.split(sep)

        var check = parts.filter(blacklistFilter)

        if (check.length !== parts.length) {
            throw Error('Refusing to update blacklisted property ' + path)
        }

        return parts
    }

    var hasOwnProperty = Object.prototype.hasOwnProperty

    function DotObject(separator, override, useArray, useBrackets) {
        if (!(this instanceof DotObject)) {
            return new DotObject(separator, override, useArray, useBrackets)
        }

        if (typeof override === 'undefined') override = false
        if (typeof useArray === 'undefined') useArray = true
        if (typeof useBrackets === 'undefined') useBrackets = true
        this.separator = separator || '.'
        this.override = override
        this.useArray = useArray
        this.useBrackets = useBrackets
        this.keepArray = false

        // contains touched arrays
        this.cleanup = []
    }

    var dotDefault = new DotObject('.', false, true, true)

    function wrap(method) {
        return function() {
            return dotDefault[method].apply(dotDefault, arguments)
        }
    }

    DotObject.prototype._fill = function(a, obj, v, mod) {
        var k = a.shift()

        if (a.length > 0) {
            obj[k] = obj[k] || (this.useArray && isIndex(a[0]) ? [] : {})

            if (!isArrayOrObject(obj[k])) {
                if (this.override) {
                    obj[k] = {}
                } else {
                    if (!(isArrayOrObject(v) && isEmptyObject(v))) {
                        throw new Error(
                            'Trying to redefine `' + k + '` which is a ' + typeof obj[k]
                        )
                    }

                    return
                }
            }

            this._fill(a, obj[k], v, mod)
        } else {
            if (!this.override && isArrayOrObject(obj[k]) && !isEmptyObject(obj[k])) {
                if (!(isArrayOrObject(v) && isEmptyObject(v))) {
                    throw new Error("Trying to redefine non-empty obj['" + k + "']")
                }

                return
            }

            obj[k] = _process(v, mod)
        }
    }

    /**
     *
     * Converts an object with dotted-key/value pairs to it's expanded version
     *
     * Optionally transformed by a set of modifiers.
     *
     * Usage:
     *
     *   var row = {
     *     'nr': 200,
     *     'doc.name': '  My Document  '
     *   }
     *
     *   var mods = {
     *     'doc.name': [_s.trim, _s.underscored]
     *   }
     *
     *   dot.object(row, mods)
     *
     * @param {Object} obj
     * @param {Object} mods
     */
    DotObject.prototype.object = function(obj, mods) {
        var self = this

        Object.keys(obj).forEach(function(k) {
            var mod = mods === undefined ? null : mods[k]
            // normalize array notation.
            var ok = parsePath(k, self.separator).join(self.separator)

            if (ok.indexOf(self.separator) !== -1) {
                self._fill(ok.split(self.separator), obj, obj[k], mod)
                delete obj[k]
            } else {
                obj[k] = _process(obj[k], mod)
            }
        })

        return obj
    }

    /**
     * @param {String} path dotted path
     * @param {String} v value to be set
     * @param {Object} obj object to be modified
     * @param {Function|Array} mod optional modifier
     */
    DotObject.prototype.str = function(path, v, obj, mod) {
        var ok = parsePath(path, this.separator).join(this.separator)

        if (path.indexOf(this.separator) !== -1) {
            this._fill(ok.split(this.separator), obj, v, mod)
        } else {
            obj[path] = _process(v, mod)
        }

        return obj
    }

    /**
     *
     * Pick a value from an object using dot notation.
     *
     * Optionally remove the value
     *
     * @param {String} path
     * @param {Object} obj
     * @param {Boolean} remove
     */
    DotObject.prototype.pick = function(path, obj, remove, reindexArray) {
        var i
        var keys
        var val
        var key
        var cp

        keys = parsePath(path, this.separator)
        for (i = 0; i < keys.length; i++) {
            key = parseKey(keys[i], obj)
            if (obj && typeof obj === 'object' && key in obj) {
                if (i === keys.length - 1) {
                    if (remove) {
                        val = obj[key]
                        if (reindexArray && Array.isArray(obj)) {
                            obj.splice(key, 1)
                        } else {
                            delete obj[key]
                        }
                        if (Array.isArray(obj)) {
                            cp = keys.slice(0, -1).join('.')
                            if (this.cleanup.indexOf(cp) === -1) {
                                this.cleanup.push(cp)
                            }
                        }
                        return val
                    } else {
                        return obj[key]
                    }
                } else {
                    obj = obj[key]
                }
            } else {
                return undefined
            }
        }
        if (remove && Array.isArray(obj)) {
            obj = obj.filter(function(n) {
                return n !== undefined
            })
        }
        return obj
    }
    /**
     *
     * Delete value from an object using dot notation.
     *
     * @param {String} path
     * @param {Object} obj
     * @return {any} The removed value
     */
    DotObject.prototype.delete = function(path, obj) {
        return this.remove(path, obj, true)
    }

    /**
     *
     * Remove value from an object using dot notation.
     *
     * Will remove multiple items if path is an array.
     * In this case array indexes will be retained until all
     * removals have been processed.
     *
     * Use dot.delete() to automatically  re-index arrays.
     *
     * @param {String|Array<String>} path
     * @param {Object} obj
     * @param {Boolean} reindexArray
     * @return {any} The removed value
     */
    DotObject.prototype.remove = function(path, obj, reindexArray) {
        var i

        this.cleanup = []
        if (Array.isArray(path)) {
            for (i = 0; i < path.length; i++) {
                this.pick(path[i], obj, true, reindexArray)
            }
            if (!reindexArray) {
                this._cleanup(obj)
            }
            return obj
        } else {
            return this.pick(path, obj, true, reindexArray)
        }
    }

    DotObject.prototype._cleanup = function(obj) {
        var ret
        var i
        var keys
        var root
        if (this.cleanup.length) {
            for (i = 0; i < this.cleanup.length; i++) {
                keys = this.cleanup[i].split('.')
                root = keys.splice(0, -1).join('.')
                ret = root ? this.pick(root, obj) : obj
                ret = ret[keys[0]].filter(function(v) {
                    return v !== undefined
                })
                this.set(this.cleanup[i], ret, obj)
            }
            this.cleanup = []
        }
    }

    /**
     * Alias method  for `dot.remove`
     *
     * Note: this is not an alias for dot.delete()
     *
     * @param {String|Array<String>} path
     * @param {Object} obj
     * @param {Boolean} reindexArray
     * @return {any} The removed value
     */
    DotObject.prototype.del = DotObject.prototype.remove

    /**
     *
     * Move a property from one place to the other.
     *
     * If the source path does not exist (undefined)
     * the target property will not be set.
     *
     * @param {String} source
     * @param {String} target
     * @param {Object} obj
     * @param {Function|Array} mods
     * @param {Boolean} merge
     */
    DotObject.prototype.move = function(source, target, obj, mods, merge) {
        if (typeof mods === 'function' || Array.isArray(mods)) {
            this.set(target, _process(this.pick(source, obj, true), mods), obj, merge)
        } else {
            merge = mods
            this.set(target, this.pick(source, obj, true), obj, merge)
        }

        return obj
    }

    /**
     *
     * Transfer a property from one object to another object.
     *
     * If the source path does not exist (undefined)
     * the property on the other object will not be set.
     *
     * @param {String} source
     * @param {String} target
     * @param {Object} obj1
     * @param {Object} obj2
     * @param {Function|Array} mods
     * @param {Boolean} merge
     */
    DotObject.prototype.transfer = function(
        source,
        target,
        obj1,
        obj2,
        mods,
        merge
    ) {
        if (typeof mods === 'function' || Array.isArray(mods)) {
            this.set(
                target,
                _process(this.pick(source, obj1, true), mods),
                obj2,
                merge
            )
        } else {
            merge = mods
            this.set(target, this.pick(source, obj1, true), obj2, merge)
        }

        return obj2
    }

    /**
     *
     * Copy a property from one object to another object.
     *
     * If the source path does not exist (undefined)
     * the property on the other object will not be set.
     *
     * @param {String} source
     * @param {String} target
     * @param {Object} obj1
     * @param {Object} obj2
     * @param {Function|Array} mods
     * @param {Boolean} merge
     */
    DotObject.prototype.copy = function(source, target, obj1, obj2, mods, merge) {
        if (typeof mods === 'function' || Array.isArray(mods)) {
            this.set(
                target,
                _process(
                    // clone what is picked
                    JSON.parse(JSON.stringify(this.pick(source, obj1, false))),
                    mods
                ),
                obj2,
                merge
            )
        } else {
            merge = mods
            this.set(target, this.pick(source, obj1, false), obj2, merge)
        }

        return obj2
    }

    /**
     *
     * Set a property on an object using dot notation.
     *
     * @param {String} path
     * @param {any} val
     * @param {Object} obj
     * @param {Boolean} merge
     */
    DotObject.prototype.set = function(path, val, obj, merge) {
        var i
        var k
        var keys
        var key

        // Do not operate if the value is undefined.
        if (typeof val === 'undefined') {
            return obj
        }
        keys = parsePath(path, this.separator)

        for (i = 0; i < keys.length; i++) {
            key = keys[i]
            if (i === keys.length - 1) {
                if (merge && isObject(val) && isObject(obj[key])) {
                    for (k in val) {
                        if (hasOwnProperty.call(val, k)) {
                            obj[key][k] = val[k]
                        }
                    }
                } else if (merge && Array.isArray(obj[key]) && Array.isArray(val)) {
                    for (var j = 0; j < val.length; j++) {
                        obj[keys[i]].push(val[j])
                    }
                } else {
                    obj[key] = val
                }
            } else if (
                // force the value to be an object
                !hasOwnProperty.call(obj, key) ||
                (!isObject(obj[key]) && !Array.isArray(obj[key]))
            ) {
                // initialize as array if next key is numeric
                if (/^\d+$/.test(keys[i + 1])) {
                    obj[key] = []
                } else {
                    obj[key] = {}
                }
            }
            obj = obj[key]
        }
        return obj
    }

    /**
     *
     * Transform an object
     *
     * Usage:
     *
     *   var obj = {
     *     "id": 1,
     *    "some": {
     *      "thing": "else"
     *    }
     *   }
     *
     *   var transform = {
     *     "id": "nr",
     *    "some.thing": "name"
     *   }
     *
     *   var tgt = dot.transform(transform, obj)
     *
     * @param {Object} recipe Transform recipe
     * @param {Object} obj Object to be transformed
     * @param {Array} mods modifiers for the target
     */
    DotObject.prototype.transform = function(recipe, obj, tgt) {
        obj = obj || {}
        tgt = tgt || {}
        Object.keys(recipe).forEach(
            function(key) {
                this.set(recipe[key], this.pick(key, obj), tgt)
            }.bind(this)
        )
        return tgt
    }

    /**
     *
     * Convert object to dotted-key/value pair
     *
     * Usage:
     *
     *   var tgt = dot.dot(obj)
     *
     *   or
     *
     *   var tgt = {}
     *   dot.dot(obj, tgt)
     *
     * @param {Object} obj source object
     * @param {Object} tgt target object
     * @param {Array} path path array (internal)
     */
    DotObject.prototype.dot = function(obj, tgt, path) {
        tgt = tgt || {}
        path = path || []
        var isArray = Array.isArray(obj)

        Object.keys(obj).forEach(
            function(key) {
                var index = isArray && this.useBrackets ? '[' + key + ']' : key
                if (
                    isArrayOrObject(obj[key]) &&
                    ((isObject(obj[key]) && !isEmptyObject(obj[key])) ||
                        (Array.isArray(obj[key]) && !this.keepArray && obj[key].length !== 0))
                ) {
                    if (isArray && this.useBrackets) {
                        var previousKey = path[path.length - 1] || ''
                        return this.dot(
                            obj[key],
                            tgt,
                            path.slice(0, -1).concat(previousKey + index)
                        )
                    } else {
                        return this.dot(obj[key], tgt, path.concat(index))
                    }
                } else {
                    if (isArray && this.useBrackets) {
                        tgt[path.join(this.separator).concat('[' + key + ']')] = obj[key]
                    } else {
                        tgt[path.concat(index).join(this.separator)] = obj[key]
                    }
                }
            }.bind(this)
        )
        return tgt
    }

    DotObject.pick = wrap('pick')
    DotObject.move = wrap('move')
    DotObject.transfer = wrap('transfer')
    DotObject.transform = wrap('transform')
    DotObject.copy = wrap('copy')
    DotObject.object = wrap('object')
    DotObject.str = wrap('str')
    DotObject.set = wrap('set')
    DotObject.delete = wrap('delete')
    DotObject.del = DotObject.remove = wrap('remove')
    DotObject.dot = wrap('dot');
    ['override', 'overwrite'].forEach(function(prop) {
        Object.defineProperty(DotObject, prop, {
            get: function() {
                return dotDefault.override
            },
            set: function(val) {
                dotDefault.override = !!val
            }
        })
    });
    ['useArray', 'keepArray', 'useBrackets'].forEach(function(prop) {
        Object.defineProperty(DotObject, prop, {
            get: function() {
                return dotDefault[prop]
            },
            set: function(val) {
                dotDefault[prop] = val
            }
        })
    })

    DotObject._process = _process


    if (typeof define === 'function' && define.amd) {
        define(function() {
            return DotObject
        })
    } else if (typeof module != 'undefined' && module.exports) {
        module.exports = DotObject
    } else {
        global[exportName] = DotObject
    }

})(this, 'DotObject')