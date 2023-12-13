import { assertNever } from "@protobuf-ts/runtime";
/**
 * Creates a "stack" of of all interceptors specified in the given `RpcOptions`.
 * Used by generated client implementations.
 * @internal
 */
export function stackIntercept(kind, transport, method, options, input) {
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
    assertNever(kind);
}
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
export function stackUnaryInterceptors(transport, method, input, options) {
    return stackIntercept("unary", transport, method, options, input);
}
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
export function stackServerStreamingInterceptors(transport, method, input, options) {
    return stackIntercept("serverStreaming", transport, method, options, input);
}
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
export function stackClientStreamingInterceptors(transport, method, options) {
    return stackIntercept("clientStreaming", transport, method, options);
}
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
export function stackDuplexStreamingInterceptors(transport, method, options) {
    return stackIntercept("duplex", transport, method, options);
}
