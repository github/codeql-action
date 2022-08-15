"use strict";
var initBuffer = require("./init-buffer");

if (!Buffer.prototype.indexOf) {
    Buffer.prototype.indexOf = function (value, offset) {
        offset = offset || 0;

        // Always wrap the input as a Buffer so that this method will support any
        // data type such as array octet, string or buffer.
        if (typeof value === "string" || value instanceof String) {
            value = initBuffer(value);
        } else if (typeof value === "number" || value instanceof Number) {
            value = initBuffer([ value ]);
        }

        var len = value.length;

        for (var i = offset; i <= this.length - len; i++) {
            var mismatch = false;
            for (var j = 0; j < len; j++) {
                if (this[i + j] != value[j]) {
                    mismatch = true;
                    break;
                }
            }

            if (!mismatch) {
                return i;
            }
        }

        return -1;
    };
}

function bufferLastIndexOf (value, offset) {

    // Always wrap the input as a Buffer so that this method will support any
    // data type such as array octet, string or buffer.
    if (typeof value === "string" || value instanceof String) {
        value = initBuffer(value);
    } else if (typeof value === "number" || value instanceof Number) {
        value = initBuffer([ value ]);
    }

    var len = value.length;
    offset = offset || this.length - len;

    for (var i = offset; i >= 0; i--) {
        var mismatch = false;
        for (var j = 0; j < len; j++) {
            if (this[i + j] != value[j]) {
                mismatch = true;
                break;
            }
        }

        if (!mismatch) {
            return i;
        }
    }

    return -1;
}


if (Buffer.prototype.lastIndexOf) {
    // check Buffer#lastIndexOf is usable: https://github.com/nodejs/node/issues/4604
    if (initBuffer("ABC").lastIndexOf ("ABC") === -1)
        Buffer.prototype.lastIndexOf = bufferLastIndexOf;
} else {
    Buffer.prototype.lastIndexOf = bufferLastIndexOf;
}
