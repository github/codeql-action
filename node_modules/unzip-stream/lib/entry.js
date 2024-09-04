'use strict';

var stream = require('stream');
var inherits = require('util').inherits;

function Entry() {
    if (!(this instanceof Entry)) {
        return new Entry();
    }

    stream.PassThrough.call(this);

    this.path = null;
    this.type = null;
    this.isDirectory = false;
}

inherits(Entry, stream.PassThrough);

Entry.prototype.autodrain = function () {
    return this.pipe(new stream.Transform({ transform: function (d, e, cb) { cb(); } }));
}

module.exports = Entry;