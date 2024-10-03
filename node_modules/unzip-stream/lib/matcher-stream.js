var Transform = require('stream').Transform;
var util = require('util');

function MatcherStream(patternDesc, matchFn) {
    if (!(this instanceof MatcherStream)) {
        return new MatcherStream();
    }

    Transform.call(this);

    var p = typeof patternDesc === 'object' ? patternDesc.pattern : patternDesc;

    this.pattern = Buffer.isBuffer(p) ? p : Buffer.from(p);
    this.requiredLength = this.pattern.length;
    if (patternDesc.requiredExtraSize) this.requiredLength += patternDesc.requiredExtraSize;

    this.data = new Buffer('');
    this.bytesSoFar = 0;

    this.matchFn = matchFn;
}

util.inherits(MatcherStream, Transform);

MatcherStream.prototype.checkDataChunk = function (ignoreMatchZero) {
    var enoughData = this.data.length >= this.requiredLength; // strict more than ?
    if (!enoughData) { return; }

    var matchIndex = this.data.indexOf(this.pattern, ignoreMatchZero ? 1 : 0);
    if (matchIndex >= 0 && matchIndex + this.requiredLength > this.data.length) {
        if (matchIndex > 0) {
            var packet = this.data.slice(0, matchIndex);
            this.push(packet);
            this.bytesSoFar += matchIndex;
            this.data = this.data.slice(matchIndex);
        }
        return;
    }

    if (matchIndex === -1) {
        var packetLen = this.data.length - this.requiredLength + 1;

        var packet = this.data.slice(0, packetLen);
        this.push(packet);
        this.bytesSoFar += packetLen;
        this.data = this.data.slice(packetLen);
        return;
    }

    // found match
    if (matchIndex > 0) {
        var packet = this.data.slice(0, matchIndex);
        this.data = this.data.slice(matchIndex);
        this.push(packet);
        this.bytesSoFar += matchIndex;
    }

    var finished = this.matchFn ? this.matchFn(this.data, this.bytesSoFar) : true;
    if (finished) {
        this.data = new Buffer('');
        return;
    }

    return true;
}

MatcherStream.prototype._transform = function (chunk, encoding, cb) {
    this.data = Buffer.concat([this.data, chunk]);

    var firstIteration = true;
    while (this.checkDataChunk(!firstIteration)) {
        firstIteration = false;
    }

    cb();
}

MatcherStream.prototype._flush = function (cb) {
    if (this.data.length > 0) {
        var firstIteration = true;
        while (this.checkDataChunk(!firstIteration)) {
            firstIteration = false;
        }
    }

    if (this.data.length > 0) {
        this.push(this.data);
        this.data = null;
    }

    cb();
}

module.exports = MatcherStream;