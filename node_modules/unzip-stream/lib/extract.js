var fs = require('fs');
var path = require('path');
var util = require('util');
var mkdirp = require('mkdirp');
var Transform = require('stream').Transform;
var UnzipStream = require('./unzip-stream');

function Extract (opts) {
    if (!(this instanceof Extract))
    return new Extract(opts);

    Transform.call(this);

    this.opts = opts || {};
    this.unzipStream = new UnzipStream(this.opts);
    this.unfinishedEntries = 0;
    this.afterFlushWait = false;
    this.createdDirectories = {};

    var self = this;
    this.unzipStream.on('entry', this._processEntry.bind(this));
    this.unzipStream.on('error', function(error) {
        self.emit('error', error);
    });
}

util.inherits(Extract, Transform);

Extract.prototype._transform = function (chunk, encoding, cb) {
    this.unzipStream.write(chunk, encoding, cb);
}

Extract.prototype._flush = function (cb) {
    var self = this;

    var allDone = function() {
        process.nextTick(function() { self.emit('close'); });
        cb();
    }

    this.unzipStream.end(function() {
        if (self.unfinishedEntries > 0) {
            self.afterFlushWait = true;
            return self.on('await-finished', allDone);
        }
        allDone();
    });
}

Extract.prototype._processEntry = function (entry) {
    var self = this;
    var destPath = path.join(this.opts.path, entry.path);
    var directory = entry.isDirectory ? destPath : path.dirname(destPath);

    this.unfinishedEntries++;

    var writeFileFn = function() {
        var pipedStream = fs.createWriteStream(destPath);

        pipedStream.on('close', function() {
            self.unfinishedEntries--;
            self._notifyAwaiter();
        });
        pipedStream.on('error', function (error) {
            self.emit('error', error);
        });
        entry.pipe(pipedStream);
    }

    if (this.createdDirectories[directory] || directory === '.') {
        return writeFileFn();
    }

    // FIXME: calls to mkdirp can still be duplicated
    mkdirp(directory, function(err) {
        if (err) return self.emit('error', err);

        self.createdDirectories[directory] = true;

        if (entry.isDirectory) {
            self.unfinishedEntries--;
            self._notifyAwaiter();
            return;
        }

        writeFileFn();
    });
}

Extract.prototype._notifyAwaiter = function() {
    if (this.afterFlushWait && this.unfinishedEntries === 0) {
        this.emit('await-finished');
        this.afterFlushWait = false;
    }
}

module.exports = Extract;