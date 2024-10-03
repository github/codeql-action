"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stackDuplexStreamingInterceptors = exports.stackClientStreamingInterceptors = exports.stackServerStreamingInterceptors = exports.stackUnaryInterceptors = exports.stackIntercept = void 0;
const runtime_1 = require("@protobuf-ts/runtime");
/**
 * Creates a "stack" of of all interceptors specified in the given `RpcOptions`.
 * Used by generated client implementations.
 * @internal
 */
function stackIntercept(kind, transport, method, options, input) {
    var _a, _b, _c, _d;
    if (kind == "unary") {
        let tail = (mtd, inp, opt) => transport.unary(mtd, inp, opt);
        for (const curr of ((_a = options.interceptors) !== null && _a !== void 0 ? _a : []).filter(i => i.interceptUnary).reverse()) {
            const next = tail;
            tail = (mtd, inp, opt) => curr.interceptUnary(next, mtd, inp, opt);
        }
        return tail(method, input, options);
    }
    if (kind == "serverStreaming") {
        let tail = (mtd, inp, opt) => transport.serverStreaming(mtd, inp, opt);
        for (const curr of ((_b = options.interceptors) !== null && _b !== void 0 ? _b : []).filter(i => i.interceptServerStreaming).reverse()) {
            const next = tail;
            tail = (mtd, inp, opt) => curr.interceptServerStreaming(next, mtd, inp, opt);
        }
        return tail(method, input, options);
    }
    if (kind == "clientStreaming") {
        let tail = (mtd, opt) => transport.clientStreaming(mtd, opt);
        for (const curr of ((_c = options.interceptors) !== null && _c !== void 0 ? _c : []).filter(i => i.interceptClientStreaming).reverse()) {
            const next = tail;
            tail = (mtd, opt) => curr.interceptClientStreaming(next, mtd, opt);
        }
        return tail(method, options);
    }
    if (kind == "duplex") {
        let tail = (mtd, opt) => transport.duplex(mtd, opt);
        for (const curr of ((_d = options.interceptors) !== null && _d !== void 0 ? _d : []).filter(i => i.interceptDuplex).reverse()) {
            const next = tail;
            tail = (mtd, opt) => curr.interceptDuplex(next, mtd, opt);
        }
        return tail(method, options);
    }
    runtime_1.assertNever(kind);
}
exports.stackIntercept = stackIntercept;
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
function stackUnaryInterceptors(transport, method, input, options) {
    return stackIntercept("unary", transport, method, options, input);
}
exports.stackUnaryInterceptors = stackUnaryInterceptors;
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
function stackServerStreamingInterceptors(transport, method, input, options) {
    return stackIntercept("serverStreaming", transport, method, options, input);
}
exports.stackServerStreamingInterceptors = stackServerStreamingInterceptors;
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
function stackClientStreamingInterceptors(transport, method, options) {
    return stackIntercept("clientStreaming", transport, method, options);
}
exports.stackClientStreamingInterceptors = stackClientStreamingInterceptors;
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
function stackDuplexStreamingInterceptors(transport, method, options) {
    return stackIntercept("duplex", transport, method, options);
}
exports.stackDuplexStreamingInterceptors = stackDuplexStreamingInterceptors;
