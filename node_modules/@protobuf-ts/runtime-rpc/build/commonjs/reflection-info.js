"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readServiceOption = exports.readMethodOption = exports.readMethodOptions = exports.normalizeMethodInfo = void 0;
const runtime_1 = require("@protobuf-ts/runtime");
/**
 * Turns PartialMethodInfo into MethodInfo.
 */
function normalizeMethodInfo(method, service) {
    var _a, _b, _c;
    let m = method;
    m.service = service;
    m.localName = (_a = m.localName) !== null && _a !== void 0 ? _a : runtime_1.lowerCamelCase(m.name);
    // noinspection PointlessBooleanExpressionJS
    m.serverStreaming = !!m.serverStreaming;
    // noinspection PointlessBooleanExpressionJS
    m.clientStreaming = !!m.clientStreaming;
    m.options = (_b = m.options) !== null && _b !== void 0 ? _b : {};
    m.idempotency = (_c = m.idempotency) !== null && _c !== void 0 ? _c : undefined;
    return m;
}
exports.normalizeMethodInfo = normalizeMethodInfo;
/**
 * Read custom method options from a generated service client.
 *
 * @deprecated use readMethodOption()
 */
function readMethodOptions(service, methodName, extensionName, extensionType) {
    var _a;
    const options = (_a = service.methods.find((m, i) => m.localName === methodName || i === methodName)) === null || _a === void 0 ? void 0 : _a.options;
    return options && options[extensionName] ? extensionType.fromJson(options[extensionName]) : undefined;
}
exports.readMethodOptions = readMethodOptions;
function readMethodOption(service, methodName, extensionName, extensionType) {
    var _a;
    const options = (_a = service.methods.find((m, i) => m.localName === methodName || i === methodName)) === null || _a === void 0 ? void 0 : _a.options;
    if (!options) {
        return undefined;
    }
    const optionVal = options[extensionName];
    if (optionVal === undefined) {
        return optionVal;
    }
    return extensionType ? extensionType.fromJson(optionVal) : optionVal;
}
exports.readMethodOption = readMethodOption;
function readServiceOption(service, extensionName, extensionType) {
    const options = service.options;
    if (!options) {
        return undefined;
    }
    const optionVal = options[extensionName];
    if (optionVal === undefined) {
        return optionVal;
    }
    return extensionType ? extensionType.fromJson(optionVal) : optionVal;
}
exports.readServiceOption = readServiceOption;
