"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeJsonOptions = exports.jsonWriteOptions = exports.jsonReadOptions = void 0;
const defaultsWrite = {
    emitDefaultValues: false,
    enumAsInteger: false,
    useProtoFieldName: false,
    prettySpaces: 0,
}, defaultsRead = {
    ignoreUnknownFields: false,
};
/**
 * Make options for reading JSON data from partial options.
 */
function jsonReadOptions(options) {
    return options ? Object.assign(Object.assign({}, defaultsRead), options) : defaultsRead;
}
exports.jsonReadOptions = jsonReadOptions;
/**
 * Make options for writing JSON data from partial options.
 */
function jsonWriteOptions(options) {
    return options ? Object.assign(Object.assign({}, defaultsWrite), options) : defaultsWrite;
}
exports.jsonWriteOptions = jsonWriteOptions;
/**
 * Merges JSON write or read options. Later values override earlier values. Type registries are merged.
 */
function mergeJsonOptions(a, b) {
    var _a, _b;
    let c = Object.assign(Object.assign({}, a), b);
    c.typeRegistry = [...((_a = a === null || a === void 0 ? void 0 : a.typeRegistry) !== null && _a !== void 0 ? _a : []), ...((_b = b === null || b === void 0 ? void 0 : b.typeRegistry) !== null && _b !== void 0 ? _b : [])];
    return c;
}
exports.mergeJsonOptions = mergeJsonOptions;
