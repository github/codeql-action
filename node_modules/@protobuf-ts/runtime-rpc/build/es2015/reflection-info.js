import { lowerCamelCase } from "@protobuf-ts/runtime";
/**
 * Turns PartialMethodInfo into MethodInfo.
 */
export function normalizeMethodInfo(method, service) {
    var _a, _b, _c;
    let m = method;
    m.service = service;
    m.localName = (_a = m.localName) !== null && _a !== void 0 ? _a : lowerCamelCase(m.name);
    // noinspection PointlessBooleanExpressionJS
    m.serverStreaming = !!m.serverStreaming;
    // noinspection PointlessBooleanExpressionJS
    m.clientStreaming = !!m.clientStreaming;
    m.options = (_b = m.options) !== null && _b !== void 0 ? _b : {};
    m.idempotency = (_c = m.idempotency) !== null && _c !== void 0 ? _c : undefined;
    return m;
}
/**
 * Read custom method options from a generated service client.
 *
 * @deprecated use readMethodOption()
 */
export function readMethodOptions(service, methodName, extensionName, extensionType) {
    var _a;
    const options = (_a = service.methods.find((m, i) => m.localName === methodName || i === methodName)) === null || _a === void 0 ? void 0 : _a.options;
    return options && options[extensionName] ? extensionType.fromJson(options[extensionName]) : undefined;
}
export function readMethodOption(service, methodName, extensionName, extensionType) {
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
export function readServiceOption(service, extensionName, extensionType) {
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
