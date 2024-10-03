var Transform = require('stream').Transform;
var util = require('util');
var UnzipStream = require('./unzip-stream');

function ParserStream(opts) {
    if (!(this instanceof ParserStream)) {
        return new ParserStream(opts);
    }

    var transformOpts = opts || {};
    Transform.call(this, { readableObjectMode: true });

    this.opts = opts || {};
    this.unzipStream = new UnzipStream(this.opts);

    var self = this;
    this.unzipStream.on('entry', function(entry) {
        self.push(entry);
    });
    this.unzipStream.on('error', function(error) {
        self.emit('error', error);
    });
}

util.inherits(ParserStream, Transform);

ParserStream.prototype._transform = function (chunk, encoding, cb) {
    this.unzipStream.write(chunk, encoding, cb);
}

ParserStream.prototype._flush = function (cb) {
    var self = this;
    this.unzipStream.end(function() {
        process.nextTick(function() { self.emit('close'); });
        cb();
    });
}

ParserStream.prototype.on = function(eventName, fn) {
    if (eventName === 'entry') {
        return Transform.prototype.on.call(this, 'data', fn);
    }
    return Transform.prototype.on.call(this, eventName, fn);
}

ParserStream.prototype.drainAll = function () {
    this.unzipStream.drainAll();
    return this.pipe(new Transform({ objectMode: true, transform: function (d, e, cb) { cb(); } }));
}

module.exports = ParserStream;
