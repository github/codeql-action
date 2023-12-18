'use strict';

var binary = require('binary');
var stream = require('stream');
var util = require('util');
var zlib = require('zlib');
var MatcherStream = require('./matcher-stream');
var Entry = require('./entry');

const states = {
    STREAM_START:                         0,
    START:                                1,
    LOCAL_FILE_HEADER:                    2,
    LOCAL_FILE_HEADER_SUFFIX:             3,
    FILE_DATA:                            4,
    FILE_DATA_END:                        5,
    DATA_DESCRIPTOR:                      6,
    CENTRAL_DIRECTORY_FILE_HEADER:        7,
    CENTRAL_DIRECTORY_FILE_HEADER_SUFFIX: 8,
    CDIR64_END:                           9,
    CDIR64_END_DATA_SECTOR:               10,
    CDIR64_LOCATOR:                       11,
    CENTRAL_DIRECTORY_END:                12,
    CENTRAL_DIRECTORY_END_COMMENT:        13,
    TRAILING_JUNK:                        14,

    ERROR: 99
}

const FOUR_GIGS = 4294967296;

const SIG_LOCAL_FILE_HEADER  = 0x04034b50;
const SIG_DATA_DESCRIPTOR    = 0x08074b50;
const SIG_CDIR_RECORD        = 0x02014b50;
const SIG_CDIR64_RECORD_END  = 0x06064b50;
const SIG_CDIR64_LOCATOR_END = 0x07064b50;
const SIG_CDIR_RECORD_END    = 0x06054b50;

function UnzipStream(options) {
    if (!(this instanceof UnzipStream)) {
        return new UnzipStream(options);
    }

    stream.Transform.call(this);

    this.options = options || {};
    this.data = new Buffer('');
    this.state = states.STREAM_START;
    this.skippedBytes = 0;
    this.parsedEntity = null;
    this.outStreamInfo = {};
}

util.inherits(UnzipStream, stream.Transform);

UnzipStream.prototype.processDataChunk = function (chunk) {
    var requiredLength;

    switch (this.state) {
        case states.STREAM_START:
        case states.START:
            requiredLength = 4;
            break;
        case states.LOCAL_FILE_HEADER:
            requiredLength = 26;
            break;
        case states.LOCAL_FILE_HEADER_SUFFIX:
            requiredLength = this.parsedEntity.fileNameLength + this.parsedEntity.extraFieldLength;
            break;
        case states.DATA_DESCRIPTOR:
            requiredLength = 12;
            break;
        case states.CENTRAL_DIRECTORY_FILE_HEADER:
            requiredLength = 42;
            break;
        case states.CENTRAL_DIRECTORY_FILE_HEADER_SUFFIX:
            requiredLength = this.parsedEntity.fileNameLength + this.parsedEntity.extraFieldLength + this.parsedEntity.fileCommentLength;
            break;
        case states.CDIR64_END:
            requiredLength = 52;
            break;
        case states.CDIR64_END_DATA_SECTOR:
            requiredLength = this.parsedEntity.centralDirectoryRecordSize - 44;
            break;
        case states.CDIR64_LOCATOR:
            requiredLength = 16;
            break;
        case states.CENTRAL_DIRECTORY_END:
            requiredLength = 18;
            break;
        case states.CENTRAL_DIRECTORY_END_COMMENT:
            requiredLength = this.parsedEntity.commentLength;
            break;
        case states.FILE_DATA:
            return 0;
        case states.FILE_DATA_END:
            return 0;
        case states.TRAILING_JUNK:
            if (this.options.debug) console.log("found", chunk.length, "bytes of TRAILING_JUNK");
            return chunk.length;
        default:
            return chunk.length;
    }

    var chunkLength = chunk.length;
    if (chunkLength < requiredLength) {
        return 0;
    }

    switch (this.state) {
        case states.STREAM_START:
        case states.START:
            var signature = chunk.readUInt32LE(0);
            switch (signature) {
                case SIG_LOCAL_FILE_HEADER:
                    this.state = states.LOCAL_FILE_HEADER;
                    break;
                case SIG_CDIR_RECORD:
                    this.state = states.CENTRAL_DIRECTORY_FILE_HEADER;
                    break;
                case SIG_CDIR64_RECORD_END:
                    this.state = states.CDIR64_END;
                    break;
                case SIG_CDIR64_LOCATOR_END:
                    this.state = states.CDIR64_LOCATOR;
                    break;
                case SIG_CDIR_RECORD_END:
                    this.state = states.CENTRAL_DIRECTORY_END;
                    break;
                default:
                    var isStreamStart = this.state === states.STREAM_START;
                    if (!isStreamStart && (signature & 0xffff) !== 0x4b50 && this.skippedBytes < 26) {
                        // we'll allow a padding of max 28 bytes
                        var remaining = signature;
                        var toSkip = 4;
                        for (var i = 1; i < 4 && remaining !== 0; i++) {
                            remaining = remaining >>> 8;
                            if ((remaining & 0xff) === 0x50) {
                                toSkip = i;
                                break;
                            }
                        }
                        this.skippedBytes += toSkip;
                        if (this.options.debug) console.log('Skipped', this.skippedBytes, 'bytes');
                        return toSkip;
                    }
                    this.state = states.ERROR;
                    var errMsg = isStreamStart ? "Not a valid zip file" : "Invalid signature in zip file";
                    if (this.options.debug) {
                        var sig = chunk.readUInt32LE(0);
                        var asString;
                        try { asString = chunk.slice(0, 4).toString(); } catch (e) {}
                        console.log("Unexpected signature in zip file: 0x" + sig.toString(16), '"' + asString + '", skipped', this.skippedBytes, 'bytes');
                    }
                    this.emit("error", new Error(errMsg));
                    return chunk.length;
            }
            this.skippedBytes = 0;
            return requiredLength;

        case states.LOCAL_FILE_HEADER:
            this.parsedEntity = this._readFile(chunk);
            this.state = states.LOCAL_FILE_HEADER_SUFFIX;

            return requiredLength;

        case states.LOCAL_FILE_HEADER_SUFFIX:
            var entry = new Entry();
            var isUtf8 = (this.parsedEntity.flags & 0x800) !== 0;
            entry.path = this._decodeString(chunk.slice(0, this.parsedEntity.fileNameLength), isUtf8);
            var extraDataBuffer = chunk.slice(this.parsedEntity.fileNameLength, this.parsedEntity.fileNameLength + this.parsedEntity.extraFieldLength);
            var extra = this._readExtraFields(extraDataBuffer);
            if (extra && extra.parsed) {
                if (extra.parsed.path && !isUtf8) {
                    entry.path = extra.parsed.path;
                }
                if (Number.isFinite(extra.parsed.uncompressedSize) && this.parsedEntity.uncompressedSize === FOUR_GIGS-1) {
                    this.parsedEntity.uncompressedSize = extra.parsed.uncompressedSize;
                }
                if (Number.isFinite(extra.parsed.compressedSize) && this.parsedEntity.compressedSize === FOUR_GIGS-1) {
                    this.parsedEntity.compressedSize = extra.parsed.compressedSize;
                }
            }
            this.parsedEntity.extra = extra.parsed || {};

            if (this.options.debug) {
                const debugObj = Object.assign({}, this.parsedEntity, {
                    path: entry.path,
                    flags: '0x' + this.parsedEntity.flags.toString(16),
                    extraFields: extra && extra.debug
                });
                console.log("decoded LOCAL_FILE_HEADER:", JSON.stringify(debugObj, null, 2));
            }
            this._prepareOutStream(this.parsedEntity, entry);

            this.emit("entry", entry);

            this.state = states.FILE_DATA;

            return requiredLength;

        case states.CENTRAL_DIRECTORY_FILE_HEADER:
            this.parsedEntity = this._readCentralDirectoryEntry(chunk);
            this.state = states.CENTRAL_DIRECTORY_FILE_HEADER_SUFFIX;

            return requiredLength;

        case states.CENTRAL_DIRECTORY_FILE_HEADER_SUFFIX:
            // got file name in chunk[0..]
            var isUtf8 = (this.parsedEntity.flags & 0x800) !== 0;
            var path = this._decodeString(chunk.slice(0, this.parsedEntity.fileNameLength), isUtf8);
            var extraDataBuffer = chunk.slice(this.parsedEntity.fileNameLength, this.parsedEntity.fileNameLength + this.parsedEntity.extraFieldLength);
            var extra = this._readExtraFields(extraDataBuffer);
            if (extra && extra.parsed && extra.parsed.path && !isUtf8) {
                path = extra.parsed.path;
            }
            this.parsedEntity.extra = extra.parsed;

            var isUnix = ((this.parsedEntity.versionMadeBy & 0xff00) >> 8) === 3;
            var unixAttrs, isSymlink;
            if (isUnix) {
                unixAttrs = this.parsedEntity.externalFileAttributes >>> 16;
                var fileType = unixAttrs >>> 12;
                isSymlink = (fileType & 0o12) === 0o12; // __S_IFLNK
            }
            if (this.options.debug) {
                const debugObj = Object.assign({}, this.parsedEntity, {
                    path: path,
                    flags: '0x' + this.parsedEntity.flags.toString(16),
                    unixAttrs: unixAttrs && '0' + unixAttrs.toString(8),
                    isSymlink: isSymlink,
                    extraFields: extra.debug,
                });
                console.log("decoded CENTRAL_DIRECTORY_FILE_HEADER:", JSON.stringify(debugObj, null, 2));
            }
            this.state = states.START;

            return requiredLength;

        case states.CDIR64_END:
            this.parsedEntity = this._readEndOfCentralDirectory64(chunk);
            if (this.options.debug) {
                console.log("decoded CDIR64_END_RECORD:", this.parsedEntity);
            }
            this.state = states.CDIR64_END_DATA_SECTOR;

            return requiredLength;

        case states.CDIR64_END_DATA_SECTOR:
            this.state = states.START;

            return requiredLength;

        case states.CDIR64_LOCATOR:
            // ignore, nothing interesting
            this.state = states.START;

            return requiredLength;

        case states.CENTRAL_DIRECTORY_END:
            this.parsedEntity = this._readEndOfCentralDirectory(chunk);
            if (this.options.debug) {
                console.log("decoded CENTRAL_DIRECTORY_END:", this.parsedEntity);
            }
            this.state = states.CENTRAL_DIRECTORY_END_COMMENT;

            return requiredLength;

        case states.CENTRAL_DIRECTORY_END_COMMENT:
            if (this.options.debug) {
                console.log("decoded CENTRAL_DIRECTORY_END_COMMENT:", chunk.slice(0, requiredLength).toString());
            }
            this.state = states.TRAILING_JUNK;

            return requiredLength;

        case states.ERROR:
            return chunk.length; // discard

        default:
            console.log("didn't handle state #", this.state, "discarding");
            return chunk.length;
    }
}

UnzipStream.prototype._prepareOutStream = function (vars, entry) {
    var self = this;

    var isDirectory = vars.uncompressedSize === 0 && /[\/\\]$/.test(entry.path);
    // protect against malicious zip files which want to extract to parent dirs
    entry.path = entry.path.replace(/^([/\\]*[.]+[/\\]+)*[/\\]*/, "");
    entry.type = isDirectory ? 'Directory' : 'File';
    entry.isDirectory = isDirectory;

    var fileSizeKnown = !(vars.flags & 0x08);
    if (fileSizeKnown) {
        entry.size = vars.uncompressedSize;
    }

    var isVersionSupported = vars.versionsNeededToExtract <= 45;

    this.outStreamInfo = {
        stream: null,
        limit: fileSizeKnown ? vars.compressedSize : -1,
        written: 0
    };

    if (!fileSizeKnown) {
        var pattern = new Buffer(4);
        pattern.writeUInt32LE(SIG_DATA_DESCRIPTOR, 0);
        var zip64Mode = vars.extra.zip64Mode;
        var extraSize = zip64Mode ? 20 : 12;
        var searchPattern = {
            pattern: pattern,
            requiredExtraSize: extraSize
        }

        var matcherStream = new MatcherStream(searchPattern, function (matchedChunk, sizeSoFar) {
            var vars = self._readDataDescriptor(matchedChunk, zip64Mode);

            var compressedSizeMatches = vars.compressedSize === sizeSoFar;
            // let's also deal with archives with 4GiB+ files without zip64
            if (!zip64Mode && !compressedSizeMatches && sizeSoFar >= FOUR_GIGS) {
                var overflown = sizeSoFar - FOUR_GIGS;
                while (overflown >= 0) {
                    compressedSizeMatches = vars.compressedSize === overflown;
                    if (compressedSizeMatches) break;
                    overflown -= FOUR_GIGS;
                }
            }
            if (!compressedSizeMatches) { return; }

            self.state = states.FILE_DATA_END;
            var sliceOffset = zip64Mode ? 24 : 16;
            if (self.data.length > 0) {
                self.data = Buffer.concat([matchedChunk.slice(sliceOffset), self.data]);
            } else {
                self.data = matchedChunk.slice(sliceOffset);
            }

            return true;
        });
        this.outStreamInfo.stream = matcherStream;
    } else {
        this.outStreamInfo.stream = new stream.PassThrough();
    }

    var isEncrypted = (vars.flags & 0x01) || (vars.flags & 0x40);
    if (isEncrypted || !isVersionSupported) {
        var message = isEncrypted ? "Encrypted files are not supported!"
            : ("Zip version " + Math.floor(vars.versionsNeededToExtract / 10) + "." + vars.versionsNeededToExtract % 10 + " is not supported");

        entry.skip = true;
        setImmediate(() => {
            entry.emit("error", new Error(message));
        });

        // try to skip over this entry
        this.outStreamInfo.stream.pipe(new Entry().autodrain());
        return;
    }

    var isCompressed = vars.compressionMethod > 0;
    if (isCompressed) {
        var inflater = zlib.createInflateRaw();
        inflater.on('error', function (err) {
            self.state = states.ERROR;
            self.emit('error', err);
        });
        this.outStreamInfo.stream.pipe(inflater).pipe(entry);
    } else {
        this.outStreamInfo.stream.pipe(entry);
    }

    if (this._drainAllEntries) {
        entry.autodrain();
    }
}

UnzipStream.prototype._readFile = function (data) {
    var vars = binary.parse(data)
        .word16lu('versionsNeededToExtract')
        .word16lu('flags')
        .word16lu('compressionMethod')
        .word16lu('lastModifiedTime')
        .word16lu('lastModifiedDate')
        .word32lu('crc32')
        .word32lu('compressedSize')
        .word32lu('uncompressedSize')
        .word16lu('fileNameLength')
        .word16lu('extraFieldLength')
        .vars;

    return vars;
}

UnzipStream.prototype._readExtraFields = function (data) {
    var extra = {};
    var result = { parsed: extra };
    if (this.options.debug) {
        result.debug = [];
    }
    var index = 0;
    while (index < data.length) {
        var vars = binary.parse(data)
            .skip(index)
            .word16lu('extraId')
            .word16lu('extraSize')
            .vars;

        index += 4;

        var fieldType = undefined;
        switch (vars.extraId) {
            case 0x0001:
                fieldType = "Zip64 extended information extra field";
                var z64vars = binary.parse(data.slice(index, index+vars.extraSize))
                    .word64lu('uncompressedSize')
                    .word64lu('compressedSize')
                    .word64lu('offsetToLocalHeader')
                    .word32lu('diskStartNumber')
                    .vars;
                if (z64vars.uncompressedSize !== null) {
                    extra.uncompressedSize = z64vars.uncompressedSize;
                }
                if (z64vars.compressedSize !== null) {
                    extra.compressedSize = z64vars.compressedSize;
                }
                extra.zip64Mode = true;
                break;
            case 0x000a:
                fieldType = "NTFS extra field";
                break;
            case 0x5455:
                fieldType = "extended timestamp";
                var timestampFields = data.readUInt8(index);
                var offset = 1;
                if (vars.extraSize >= offset + 4 && timestampFields & 1) {
                    extra.mtime = new Date(data.readUInt32LE(index + offset) * 1000);
                    offset += 4;
                }
                if (vars.extraSize >= offset + 4 && timestampFields & 2) {
                    extra.atime = new Date(data.readUInt32LE(index + offset) * 1000);
                    offset += 4;
                }
                if (vars.extraSize >= offset + 4 && timestampFields & 4) {
                    extra.ctime = new Date(data.readUInt32LE(index + offset) * 1000);
                }
                break;
            case 0x7075:
                fieldType = "Info-ZIP Unicode Path Extra Field";
                var fieldVer = data.readUInt8(index);
                if (fieldVer === 1) {
                    var offset = 1;
                    // TODO: should be checking this against our path buffer
                    var nameCrc32 = data.readUInt32LE(index + offset);
                    offset += 4;
                    var pathBuffer = data.slice(index + offset);
                    extra.path = pathBuffer.toString();
                }
                break;
            case 0x000d:
            case 0x5855:
                fieldType = vars.extraId === 0x000d ? "PKWARE Unix" : "Info-ZIP UNIX (type 1)";
                var offset = 0;
                if (vars.extraSize >= 8) {
                    var atime = new Date(data.readUInt32LE(index + offset) * 1000);
                    offset += 4;
                    var mtime = new Date(data.readUInt32LE(index + offset) * 1000);
                    offset += 4;
                    extra.atime = atime;
                    extra.mtime = mtime;

                    if (vars.extraSize >= 12) {
                        var uid = data.readUInt16LE(index + offset);
                        offset += 2;
                        var gid = data.readUInt16LE(index + offset);
                        offset += 2;
                        extra.uid = uid;
                        extra.gid = gid;
                    }
                }
                break;
            case 0x7855:
                fieldType = "Info-ZIP UNIX (type 2)";
                var offset = 0;
                if (vars.extraSize >= 4) {
                    var uid = data.readUInt16LE(index + offset);
                    offset += 2;
                    var gid = data.readUInt16LE(index + offset);
                    offset += 2;
                    extra.uid = uid;
                    extra.gid = gid;
                }
                break;
            case 0x7875:
                fieldType = "Info-ZIP New Unix";
                var offset = 0;
                var extraVer = data.readUInt8(index);
                offset += 1;
                if (extraVer === 1) {
                    var uidSize = data.readUInt8(index + offset);
                    offset += 1;
                    if (uidSize <= 6) {
                        extra.uid = data.readUIntLE(index + offset, uidSize);
                    }
                    offset += uidSize;

                    var gidSize = data.readUInt8(index + offset);
                    offset += 1;
                    if (gidSize <= 6) {
                        extra.gid = data.readUIntLE(index + offset, gidSize);
                    }
                }
                break;
            case 0x756e:
                fieldType = "ASi Unix";
                var offset = 0;
                if (vars.extraSize >= 14) {
                    var crc = data.readUInt32LE(index + offset);
                    offset += 4;
                    var mode = data.readUInt16LE(index + offset);
                    offset += 2;
                    var sizdev = data.readUInt32LE(index + offset);
                    offset += 4;
                    var uid = data.readUInt16LE(index + offset);
                    offset += 2;
                    var gid = data.readUInt16LE(index + offset);
                    offset += 2;
                    extra.mode = mode;
                    extra.uid = uid;
                    extra.gid = gid;
                    if (vars.extraSize > 14) {
                        var start = index + offset;
                        var end = index + vars.extraSize - 14;
                        var symlinkName = this._decodeString(data.slice(start, end));
                        extra.symlink = symlinkName;
                    }
                }
                break;
        }

        if (this.options.debug) {
            result.debug.push({
                extraId: '0x' + vars.extraId.toString(16),
                description: fieldType,
                data: data.slice(index, index + vars.extraSize).inspect()
            });
        }

        index += vars.extraSize;
    }

    return result;
}

UnzipStream.prototype._readDataDescriptor = function (data, zip64Mode) {
    if (zip64Mode) {
        var vars = binary.parse(data)
            .word32lu('dataDescriptorSignature')
            .word32lu('crc32')
            .word64lu('compressedSize')
            .word64lu('uncompressedSize')
            .vars;

        return vars;
    }

    var vars = binary.parse(data)
        .word32lu('dataDescriptorSignature')
        .word32lu('crc32')
        .word32lu('compressedSize')
        .word32lu('uncompressedSize')
        .vars;

    return vars;
}

UnzipStream.prototype._readCentralDirectoryEntry = function (data) {
    var vars = binary.parse(data)
        .word16lu('versionMadeBy')
        .word16lu('versionsNeededToExtract')
        .word16lu('flags')
        .word16lu('compressionMethod')
        .word16lu('lastModifiedTime')
        .word16lu('lastModifiedDate')
        .word32lu('crc32')
        .word32lu('compressedSize')
        .word32lu('uncompressedSize')
        .word16lu('fileNameLength')
        .word16lu('extraFieldLength')
        .word16lu('fileCommentLength')
        .word16lu('diskNumber')
        .word16lu('internalFileAttributes')
        .word32lu('externalFileAttributes')
        .word32lu('offsetToLocalFileHeader')
        .vars;

    return vars;
}

UnzipStream.prototype._readEndOfCentralDirectory64 = function (data) {
    var vars = binary.parse(data)
        .word64lu('centralDirectoryRecordSize')
        .word16lu('versionMadeBy')
        .word16lu('versionsNeededToExtract')
        .word32lu('diskNumber')
        .word32lu('diskNumberWithCentralDirectoryStart')
        .word64lu('centralDirectoryEntries')
        .word64lu('totalCentralDirectoryEntries')
        .word64lu('sizeOfCentralDirectory')
        .word64lu('offsetToStartOfCentralDirectory')
        .vars;

    return vars;
}

UnzipStream.prototype._readEndOfCentralDirectory = function (data) {
    var vars = binary.parse(data)
        .word16lu('diskNumber')
        .word16lu('diskStart')
        .word16lu('centralDirectoryEntries')
        .word16lu('totalCentralDirectoryEntries')
        .word32lu('sizeOfCentralDirectory')
        .word32lu('offsetToStartOfCentralDirectory')
        .word16lu('commentLength')
        .vars;

    return vars;
}

const cp437 = '\u0000☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼ !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

UnzipStream.prototype._decodeString = function (buffer, isUtf8) {
    if (isUtf8) {
        return buffer.toString('utf8');
    }
    // allow passing custom decoder
    if (this.options.decodeString) {
        return this.options.decodeString(buffer);
    }
    let result = "";
    for (var i=0; i<buffer.length; i++) {
        result += cp437[buffer[i]];
    }
    return result;
}

UnzipStream.prototype._parseOrOutput = function (encoding, cb) {
    var consume;
    while ((consume = this.processDataChunk(this.data)) > 0) {
        this.data = this.data.slice(consume);
        if (this.data.length === 0) break;
    }

    if (this.state === states.FILE_DATA) {
        if (this.outStreamInfo.limit >= 0) {
            var remaining = this.outStreamInfo.limit - this.outStreamInfo.written;
            var packet;
            if (remaining < this.data.length) {
                packet = this.data.slice(0, remaining);
                this.data = this.data.slice(remaining);
            } else {
                packet = this.data;
                this.data = new Buffer('');
            }

            this.outStreamInfo.written += packet.length;
            if (this.outStreamInfo.limit === this.outStreamInfo.written) {
                this.state = states.START;

                this.outStreamInfo.stream.end(packet, encoding, cb);
            } else {
                this.outStreamInfo.stream.write(packet, encoding, cb);
            }
        } else {
            var packet = this.data;
            this.data = new Buffer('');

            this.outStreamInfo.written += packet.length;
            var outputStream = this.outStreamInfo.stream;
            outputStream.write(packet, encoding, () => {
                if (this.state === states.FILE_DATA_END) {
                    this.state = states.START;
                    return outputStream.end(cb);
                }
                cb();
            });
        }
        // we've written to the output stream, letting that write deal with the callback
        return;
    }

    cb();
}

UnzipStream.prototype.drainAll = function () {
    this._drainAllEntries = true;
}

UnzipStream.prototype._transform = function (chunk, encoding, cb) {
    var self = this;
    if (self.data.length > 0) {
        self.data = Buffer.concat([self.data, chunk]);
    } else {
        self.data = chunk;
    }

    var startDataLength = self.data.length;
    var done = function () {
        if (self.data.length > 0 && self.data.length < startDataLength) {
            startDataLength = self.data.length;
            self._parseOrOutput(encoding, done);
            return;
        }
        cb();
    };
    self._parseOrOutput(encoding, done);
}

UnzipStream.prototype._flush = function (cb) {
    var self = this;
    if (self.data.length > 0) {
        self._parseOrOutput('buffer', function () {
            if (self.data.length > 0) return setImmediate(function () { self._flush(cb); });
            cb();
        });

        return;
    }

    if (self.state === states.FILE_DATA) {
        // uh oh, something went wrong
        return cb(new Error("Stream finished in an invalid state, uncompression failed"));
    }

    setImmediate(cb);
}

module.exports = UnzipStream;
