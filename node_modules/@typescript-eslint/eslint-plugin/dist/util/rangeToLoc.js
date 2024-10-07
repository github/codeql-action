"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rangeToLoc = rangeToLoc;
function rangeToLoc(sourceCode, range) {
    return {
        start: sourceCode.getLocFromIndex(range[0]),
        end: sourceCode.getLocFromIndex(range[1]),
    };
}
//# sourceMappingURL=rangeToLoc.js.map